// functions/index.js

// v2 Scheduler API / Realtime DB Triggers を使用
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");
const { onRequest } = require("firebase-functions/v2/https");

admin.initializeApp();
const db = admin.database();
// 万一 undefined が混ざっても書き込みを落とさない（保険）
try { admin.firestore().settings({ ignoreUndefinedProperties: true }); } catch (e) { /* 既に設定済み */ }

/**
 * RTDB の戻り値をプレーンオブジェクトに正規化する。
 *
 * ニックネームが "1" のように数字だけだと、RTDB は {"1":2} ではなく
 * 穴あき配列 [undefined, 2] を返す。そのまま Firestore に渡すと
 * 「Cannot use "undefined" as a Firestore value」で書き込みが失敗し、
 * しかも add() は同期的に throw するため Promise.allSettled では捕まらない。
 */
function toPlainObject(v) {
  if (!v || typeof v !== 'object') return {};
  if (!Array.isArray(v)) return v;
  const o = {};
  v.forEach((x, i) => { if (x !== undefined && x !== null) o[String(i)] = x; });
  return o;
}

/** 配列にも穴あき配列にもなり得るノードを、詰めた配列にする */
function toDenseArray(v) {
  if (!v) return [];
  const arr = Array.isArray(v) ? v : Object.values(v);
  return arr.filter(x => x !== undefined && x !== null);
}

/**
 * 参加者一覧を players と scores の和集合から作る。
 * 終了時に一時的に切断していた人が players から欠けても、
 * スコアを持っていれば参加者として残るようにするため。
 */
function mergeParticipants(players, scores) {
  const set = new Set([
    ...Object.keys(toPlainObject(players)),
    ...Object.keys(toPlainObject(scores))
  ]);
  return Array.from(set).sort();
}

/** 問題の安定ID。章と問番号の組は問題バンク全670問で一意であることを確認済み。 */
function questionKey(q) {
  if (!q) return null;
  const ch = q.chapter, qn = q.qnum;
  if (ch === undefined || ch === null || qn === undefined || qn === null) return null;
  return `${ch}-${qn}`;
}

/**
 * 1試合ぶんの events を問題単位に畳む。
 * ログを軽く保つため問題文そのものは持たせず、集計側 (questionStats) に置く。
 */
function summariseQuestions(sequence, eventsObj, qStartObj, askedCount) {
  const events = toDenseArray(eventsObj);
  const qStart = toPlainObject(qStartObj);
  const byIndex = new Map();
  events.forEach(e => {
    const i = Number(e && e.questionIndex);
    if (!Number.isFinite(i)) return;
    if (!byIndex.has(i)) byIndex.set(i, []);
    byIndex.get(i).push(e);
  });

  const out = [];
  for (let i = 0; i < Math.min(askedCount, sequence.length); i++) {
    const q = sequence[i];
    if (!q) continue;
    const evs = (byIndex.get(i) || []).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const correct = evs.find(e => e.correct);
    const wrong = evs.filter(e => !e.correct && e.type === 'wrongGuess').length;
    const timeout = evs.filter(e => !e.correct && e.type === 'answerTimeout').length;
    const startAt = Number(qStart[String(i)] ?? qStart[i]);
    let ms = null;
    if (correct && Number.isFinite(startAt) && Number.isFinite(Number(correct.timestamp))) {
      const d = Number(correct.timestamp) - startAt;
      if (d >= 0 && d < 10 * 60 * 1000) ms = d;
    }
    out.push({
      i,
      id: questionKey(q) || `idx-${i}`,
      chapter: Number(q.chapter),
      winner: correct ? String(correct.nick) : null,
      wrong,
      timeout,
      // 誰も反応しないまま制限時間が切れた問題（イベントが1件も無い）
      unanswered: evs.length === 0,
      ms
    });
  }
  return out;
}

/**
 * 問題ごとの累積成績を questionStats に足しこむ。
 * 全ログを走査せずに「難問ランキング」を出せるようにするための集計。
 */
async function accumulateQuestionStats(firestore, sequence, summaries) {
  if (!summaries.length) return;
  const CHUNK = 400; // batch の上限500に対する余裕
  for (let s = 0; s < summaries.length; s += CHUNK) {
    const slice = summaries.slice(s, s + CHUNK);
    const batch = firestore.batch();
    slice.forEach(item => {
      const q = sequence[item.i] || {};
      const ref = firestore.collection('questionStats').doc(item.id);
      const inc = admin.firestore.FieldValue.increment;
      batch.set(ref, {
        id: item.id,
        chapter: Number(q.chapter),
        qnum: Number(q.qnum),
        question: String(q.question || ''),
        answer: String(q.answer || ''),
        asked: inc(1),
        correct: inc(item.winner ? 1 : 0),
        wrong: inc(item.wrong),
        timeout: inc(item.timeout),
        unanswered: inc(item.unanswered ? 1 : 0),
        totalMs: inc(item.ms || 0),
        msCount: inc(item.ms == null ? 0 : 1),
        lastAskedAt: Date.now()
      }, { merge: true });
    });
    await batch.commit();
  }
}

/**
 * 定期クリーンアップ: createdAt から2時間以上経過した古いルームを削除
 *
 * 注意:
 * - rooms 配下を once("value") で全件ロードすると sequence まで引っ張ってしまい
 *   （全体の約75%）、件数が増えるとメモリ上限で落ちて1件も削除できなくなる。
 *   そのため orderByChild + limitToFirst でサーバ側に絞らせ、少しずつ処理する。
 *   このクエリには database.rules.json の rooms/".indexOn" が必須。
 * - 削除を先に確定させ、ログ保存の失敗が削除を巻き添えにしないようにする。
 */
const CLEANUP_BATCH_SIZE = 50;
const CLEANUP_MAX_BATCHES = 200;
const CLEANUP_DEADLINE_MS = 240 * 1000; // timeoutSeconds に対する安全マージン
const STALE_ROOM_MS = 2 * 60 * 60 * 1000;  // これを超えたルームは「進行中」として扱わない

exports.scheduledCleanupRooms = onSchedule(
  {
    schedule: "every 60 minutes",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 300,
  },
  async (event) => {
    const startedAt = Date.now();
    const cutoff = Date.now() - 2 * 60 * 60 * 1000; // 今から2h 前
    const roomsRef = db.ref("rooms");
    const firestore = admin.firestore();
    let deletedTotal = 0;
    let loggedTotal = 0;

    for (let batch = 0; batch < CLEANUP_MAX_BATCHES; batch++) {
      if (Date.now() - startedAt > CLEANUP_DEADLINE_MS) {
        console.warn(`cleanup: deadline reached, ${deletedTotal} rooms deleted so far`);
        break;
      }

      // createdAt が cutoff 以下のルームだけを取得（createdAt 無しは先頭に並ぶ）
      const snap = await roomsRef
        .orderByChild("settings/createdAt")
        .endAt(cutoff)
        .limitToFirst(CLEANUP_BATCH_SIZE)
        .once("value");

      if (!snap.numChildren()) break;

      const updates = {};
      const logEntries = [];

      snap.forEach((roomSnap) => {
        const settings = roomSnap.child("settings").val() || {};
        const createdAt = settings.createdAt;
        const playerCount = roomSnap.child("players").numChildren();

        if (typeof createdAt === "number") {
          if (createdAt >= cutoff) return; // クエリ境界の取りこぼし対策
        } else if (playerCount > 0) {
          // createdAt 不明かつ在室者ありは、進行中の可能性があるので触らない
          return;
        }

        updates[roomSnap.key] = null;

        // finishedAtが存在しない（終了印がない）場合は途中終了とみなす
        if (!settings.finishedAt) {
          const sequence = toDenseArray(roomSnap.child("sequence").val());
          const currentQuestion = roomSnap.child("currentIndex").val() || 0;
          const questions = summariseQuestions(
            sequence,
            roomSnap.child("events").val(),
            roomSnap.child("qStart").val(),
            currentQuestion + 1
          );
          logEntries.push({
            entry: {
              roomId: roomSnap.key,
              host: settings.host || '',
              participants: mergeParticipants(
                roomSnap.child("players").val(),
                roomSnap.child("scores").val()
              ),
              winners: [],
              scores: toPlainObject(roomSnap.child("scores").val()),
              questionsCount: sequence.length || settings.count || 0,
              mode: settings.mode || 'input',
              chapters: settings.chapters || [],
              duration: Date.now() - (createdAt || Date.now()),
              createdAt: createdAt || Date.now(),
              finishedAt: Date.now(),
              status: 'incomplete',
              currentQuestion,
              questions,
              savedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            sequence,
            questions
          });
        }
      });

      if (!Object.keys(updates).length) {
        // 全件スキップ（進行中扱い）だと同じバッチを引き続けるため打ち切る
        console.warn('cleanup: batch had no deletable rooms, stopping');
        break;
      }

      // 先に削除を確定させる
      await roomsRef.update(updates);
      deletedTotal += Object.keys(updates).length;

      // ログ保存は best-effort（失敗しても削除は巻き戻さない）。
      // add() は引数検証で同期的に throw するため、1件ずつ囲まないと
      // 1つの不正データでバッチ全体（＝以降の全ルーム）が落ちる。
      for (const item of logEntries) {
        try {
          await firestore.collection('gameLogs').add(item.entry);
          loggedTotal++;
        } catch (e) {
          console.error('cleanup: gameLog save failed', item.entry && item.entry.roomId, e);
          continue;
        }
        try {
          await accumulateQuestionStats(firestore, item.sequence, item.questions);
        } catch (e) {
          console.error('cleanup: questionStats failed', item.entry && item.entry.roomId, e);
        }
      }
    }

    console.log(`cleanup: deleted ${deletedTotal} rooms, saved ${loggedTotal} incomplete logs`);
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

      const settings = roomData.settings || {};
      const scores = toPlainObject(roomData.scores);
      const players = toPlainObject(roomData.players);
      const sequence = toDenseArray(roomData.sequence);

      const scoreValues = Object.values(scores).map(v => v || 0);
      const maxScore = scoreValues.length ? Math.max(...scoreValues) : 0;
      const winners = maxScore > 0
        ? Object.keys(scores).filter(nick => (scores[nick] || 0) === maxScore)
        : [];

      const logEntry = {
        roomId: roomId,
        host: settings.host || '',
        participants: mergeParticipants(players, scores),
        winners: winners,
        scores: scores,
        questionsCount: sequence.length || settings.count || 0,
        mode: settings.mode || 'input',
        chapters: settings.chapters || [],
        duration: (settings.finishedAt || Date.now()) - (settings.createdAt || Date.now()),
        createdAt: settings.createdAt || Date.now(),
        finishedAt: settings.finishedAt || Date.now(),
        status: 'finished',
        questions: summariseQuestions(sequence, roomData.events, roomData.qStart, sequence.length),
        savedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      const firestore = admin.firestore();
      await firestore.collection('gameLogs').add(logEntry);
      try {
        await accumulateQuestionStats(firestore, sequence, logEntry.questions);
      } catch (e) {
        console.error('onRoomFinished questionStats error', roomId, e);
      }
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
// 問題バンクのキャッシュ。内容の更新は年に数回なので、
// ウォームインスタンスでは24時間使い回す（作成のたびに182KBを読むのをやめる）。
const QUESTION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let questionCache = { at: 0, items: null };
async function getQuestions() {
  const now = Date.now();
  if (questionCache.items && (now - questionCache.at) < QUESTION_CACHE_TTL_MS) {
    return questionCache.items;
  }
  const snap = await db.ref('questions').once('value');
  const items = toDenseArray(snap.val());
  questionCache = { at: now, items };
  return items;
}

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

    const all = await getQuestions();
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
 * 章ごとの問題数を返す。出題範囲を選んだ時点で「問題総数：○○問」を出すため。
 * 問題バンク全件をクライアントに落とさずに済む。
 */
exports.getQuestionCounts = onRequest({ region: "us-central1" }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const all = await getQuestions();
    const counts = {};
    all.forEach(q => {
      const c = Number(q.chapter);
      if (Number.isFinite(c)) counts[c] = (counts[c] || 0) + 1;
    });
    res.set("Cache-Control", "public, max-age=3600");
    return res.json({ counts, total: all.length });
  } catch (e) {
    console.error('getQuestionCounts error', e);
    return res.status(500).json({ error: 'internal' });
  }
});

/**
 * 問題ごとの累積成績を返す。ログ画面の「問題別成績」用。
 * questionStats はゲーム終了時に加算されていくので、全ログを走査しなくてよい。
 */
exports.getQuestionStats = onRequest({ region: "us-central1" }, async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === 'OPTIONS') return res.status(204).send('');
  try {
    const limit = Math.min(Number(req.query.limit) || 1000, 2000);
    const snapshot = await admin.firestore()
      .collection('questionStats')
      .orderBy('asked', 'desc')
      .limit(limit)
      .get();
    const stats = [];
    snapshot.forEach(doc => {
      const d = doc.data() || {};
      const asked = d.asked || 0;
      const correct = d.correct || 0;
      stats.push({
        id: doc.id,
        chapter: d.chapter,
        qnum: d.qnum,
        question: d.question || '',
        answer: d.answer || '',
        asked,
        correct,
        wrong: d.wrong || 0,
        timeout: d.timeout || 0,
        unanswered: d.unanswered || 0,
        correctRate: asked ? correct / asked : null,
        avgMs: d.msCount ? Math.round((d.totalMs || 0) / d.msCount) : null,
        lastAskedAt: d.lastAskedAt || null
      });
    });
    return res.json({ stats });
  } catch (e) {
    console.error('getQuestionStats error', e);
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
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    
    const logs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Firestore Timestamp をミリ秒に正規化（旧データはセンチネルのマップが入っている）
      if (data.savedAt && typeof data.savedAt.toMillis === 'function') {
        data.savedAt = data.savedAt.toMillis();
      } else if (data.savedAt && typeof data.savedAt !== 'number') {
        data.savedAt = null;
      }
      logs.push({ id: doc.id, ...data });
    });

    // Realtime Databaseから進行中のルームを取得してマージ
    // 全件 once("value") はメモリ上限で落ちるため、新しい順に limit 件だけ読む
    // （orderByChild には database.rules.json の rooms/".indexOn" が必要）
    const rtdbSnap = await db.ref('rooms')
      .orderByChild('settings/createdAt')
      .limitToLast(Math.min(limit, 200))
      .once('value');
    rtdbSnap.forEach(roomSnap => {
      const settings = roomSnap.child('settings').val() || {};

      // finishedAt が無くても、作成から2時間以上経っていれば放置ルーム。
      // クリーンアップ待ちのものを「進行中」として並べない。
      const createdAt = settings.createdAt || 0;
      const stale = !createdAt || (Date.now() - createdAt) > STALE_ROOM_MS;
      if (!settings.finishedAt && !stale) {
        logs.push({
          id: roomSnap.key,
          roomId: roomSnap.key,
          host: settings.host || '',
          participants: mergeParticipants(
            roomSnap.child('players').val(),
            roomSnap.child('scores').val()
          ),
          winners: [],
          scores: toPlainObject(roomSnap.child('scores').val()),
          questionsCount: roomSnap.child('sequence').numChildren() || settings.count || 0,
          mode: settings.mode || 'input',
          chapters: settings.chapters || [],
          duration: Date.now() - (settings.createdAt || Date.now()),
          createdAt: settings.createdAt || Date.now(),
          finishedAt: null,
          sortAt: Date.now(), // 並べ替え用（終了時刻ではない）
          status: 'in-progress',
          currentQuestion: roomSnap.child('currentIndex').val() || 0,
          savedAt: Date.now()
        });
      }
    });

    // createdAt で降順ソート
    logs.sort((a, b) => b.createdAt - a.createdAt);

    return res.json({ logs: logs.slice(0, limit) });
  } catch (e) {
    console.error('getGameLogs error', e);
    return res.status(500).json({ error: 'internal' });
  }
});
