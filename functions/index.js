// functions/index.js

// v2 Scheduler API / Realtime DB Triggers を使用
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onValueCreated } = require("firebase-functions/v2/database");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.database();

/**
 * 毎日 24 時間ごとに、createdAt から 24 時間以上経過した古いルームを削除
 */
exports.scheduledCleanupRooms = onSchedule(
  /* cron 形式でも指定可能ですが、シンプルに */ 
  "every 24 hours",
  async (event) => {
    const cutoff   = Date.now() - 24 * 60 * 60 * 1000; // 今から24h 前
    const roomsRef = db.ref("rooms");
    const snap     = await roomsRef.once("value");
    const updates  = {};

    snap.forEach((roomSnap) => {
      const settings = roomSnap.child("settings").val();
      if (settings && settings.createdAt < cutoff) {
        // 24h 過ぎていれば削除対象
        updates[roomSnap.key] = null;
      }
    });

    if (Object.keys(updates).length) {
      await roomsRef.update(updates);
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
