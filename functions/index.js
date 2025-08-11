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
      console.log("Deleted rooms:", Object.keys(updates));
    } else {
      console.log("No old rooms to delete");
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
exports.onCorrectEvent = onValueCreated("/rooms/{roomId}/events/{eventId}", async (event) => {
  try {
    const val = event.data.val();
    if (!val || !val.correct) return; // 不正解 or 型不正は無視
    const roomId = event.params.roomId;
    const questionIndex = val.questionIndex;
    if (typeof questionIndex !== 'number') return; // ガード

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
});
