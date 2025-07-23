// functions/index.js

// v2 Scheduler API を使う
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin           = require("firebase-admin");

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
