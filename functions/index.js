// functions/index.js

// v2 Scheduler API / Realtime DB Triggers を使用
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

admin.initializeApp();
const db = admin.database();

/**
 * 定期クリーンアップ: createdAt から2時間以上経過した古いルームを削除
 */
exports.scheduledCleanupRooms = onSchedule(
  /* 1時間ごとに実行 */ 
  "every 60 minutes",
  async (event) => {
  const cutoff   = Date.now() - 2 * 60 * 60 * 1000; // 今から2h 前
    const roomsRef = db.ref("rooms");
    const snap     = await roomsRef.once("value");
    const updates  = {};
    const logPromises = [];
    const firestore = admin.firestore();

    snap.forEach((roomSnap) => {
      const settings = roomSnap.child("settings").val();
      if (settings && settings.createdAt < cutoff) {
        // 2h 過ぎていれば削除対象
        updates[roomSnap.key] = null;

        // finishedAtが存在しない（終了印がない）場合は途中終了とみなす
        if (!settings.finishedAt) {
          const roomData = roomSnap.val();
          if (roomData) {
            roomData.status = 'incomplete';
            logPromises.push(firestore.collection('gameLogs').add(roomData));
          }
        }
      }
    });

    if (logPromises.length > 0) {
      await Promise.all(logPromises);
    }

    if (Object.keys(updates).length) {
      await roomsRef.update(updates);
    }
  }
);

/**
 * ゲーム終了時の保存処理
 * rooms/{roomId}/settings/finishedAt が作成されたタイミングをトリガー
 */
exports.onRoomFinished = onValueCreated(
  { ref: "/rooms/{roomId}/settings/finishedAt", instance: "kgs-test-68924-default-rtdb", region: "us-central1" },
  async (event) => {
    try {
      const roomId = event.params.roomId;
      const roomSnap = await db.ref(`rooms/${roomId}`).once("value");
      const roomData = roomSnap.val();

      if (!roomData) return;

      roomData.status = 'finished';

      const firestore = admin.firestore();
      await firestore.collection('gameLogs').add(roomData);
    } catch (e) {
      console.error('onRoomFinished error', e);
    }
  }
);

/**
 * 正解イベントが書き込まれた際に、"最初の1人" だけにスコアを付与する。
 * パス: rooms/{roomId}/events/{eventId}
 * 
 * クライアントは correct: true の events を push するだけで、スコア加算はここで統一。
 * 二重加算防止のため awards/{questionIndex} で勝者をトランザクション確保。
 */
// RTDB トリガー: 既定インスタンスを明示して取りこぼしを防止
exports.onCorrectEvent = onValueCreated(
  { ref: "/rooms/{roomId}/events/{eventId}", instance: "kgs-test-68924-default-rtdb", region: "us-central1" },
  async (event) => {
  try {
    const val = event.data.val();
    if (!val || !val.correct) return; // 不正解 or 型不正は無視
    const roomId = event.params.roomId;
    // questionIndex は string で来る可能性があるため安全に数値化
    const questionIndex = Number(val.questionIndex);
  if (!Number.isFinite(questionIndex)) return; // 不正な値は無視

    const awardRef = db.ref(`rooms/${roomId}/awards/${questionIndex}`);
    const txnResult = await awardRef.transaction(cur => {
      if (cur === null) {
        return { nick: val.nick, at: Date.now() };
      }
      return; // 既に誰かが正解確定済 → 中断
    });
    if (txnResult.committed) {
      // スコア加算（初回のみ）
      await db.ref(`rooms/${roomId}/scores/${val.nick}`).transaction(s => (s || 0) + 1);
    }
  } catch (e) {
    console.error('onCorrectEvent error', e);
  }
}
);

/**
 * 質問データ取得の最適化: 指定章+件数でシーケンスを生成し返すHTTP関数。
 * Body(JSON): { chapters: number[], count: number, mode?: 'input'|'select' }
 */
exports.generateSequence = onRequest({ region: "us-central1" }, async (req, res) => {
  // CORS簡易対応
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const { chapters, count, mode } = req.body || {};
    if (!Array.isArray(chapters) || !chapters.length) return res.status(400).json({ error: 'chapters required' });
    const chs = chapters.map(Number).filter(n => Number.isInteger(n));
    const cnt = Number(count);
    if (!Number.isFinite(cnt) || cnt < 1 || cnt > 999) return res.status(400).json({ error: 'invalid count' });
    const isSelect = mode === 'select';

    const snap = await db.ref('questions').once('value');
    const all = Object.values(snap.val() || {}).filter(Boolean);
    const pool = all.filter(q => chs.includes(Number(q.chapter)));
    // Fisher-Yates shuffle
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const seq = pool.slice(0, cnt).map(q => ({ ...q }));
    if (isSelect) {
      seq.forEach(q => {
        let order = [0,1,2,3,4];
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        q.choicesOrder = order;
      });
    }
    return res.json({ sequence: seq });
  } catch (e) {
    console.error('generateSequence error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

/**
 * ゲームログ保存: クライアントからゲーム終了のログを受け取ってFirestoreに保存
 * Body(JSON): { roomId, participants, winners, scores, questionsCount, mode, chapters, duration, createdAt, finishedAt }
 */
exports.saveGameLog = onRequest({ region: "us-central1" }, async (req, res) => {
  // CORS対応
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const {
      roomId,
      participants,
      winners,
      scores,
      questionsCount,
      mode,
      chapters,
      duration,
      createdAt,
      finishedAt,
      status
    } = req.body || {};

    if (!roomId || !participants || !Array.isArray(participants)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const logEntry = {
      roomId,
      participants: Array.isArray(participants) ? participants : [],
      winners: Array.isArray(winners) ? winners : [],
      scores: scores || {},
      questionsCount: Number(questionsCount) || 0,
      mode: mode || 'input',
      chapters: Array.isArray(chapters) ? chapters : [],
      duration: Number(duration) || 0,
      createdAt: Number(createdAt) || Date.now(),
      finishedAt: Number(finishedAt) || Date.now(),
      status: status || 'finished',
      savedAt: admin.database.ServerValue.TIMESTAMP
    };

    // Firestoreに保存
    const firestore = admin.firestore();
    const docRef = await firestore.collection('gameLogs').add(logEntry);

    return res.json({ success: true, logId: docRef.id });
  } catch (e) {
    console.error('saveGameLog error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

/**
 * ゲームログ取得: Firestore からゲームログを取得して返す HTTP 関数
 * クエリパラメータ: limit (デフォルト 100)
 */
exports.getGameLogs = onRequest({ region: "us-central1" }, async (req, res) => {
  // CORS対応
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    
    const firestore = admin.firestore();
    const snapshot = await firestore
      .collection('gameLogs')
      .orderBy('finishedAt', 'desc')
      .limit(limit)
      .get();
    
    const logs = [];
    snapshot.forEach(doc => {
      logs.push({
        id: doc.id,
        ...doc.data()
      });
    });

    return res.json({ logs });
  } catch (e) {
    console.error('getGameLogs error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
