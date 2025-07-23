// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getDatabase, ref, set, push, onValue, remove
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// ——————————————————————————
// ① Firebase初期化
// ——————————————————————————
const firebaseConfig = {
  apiKey: "AIzaSyBYWW8Ldgtow1fxctSqIZynLpxFwRAcc-c",
  authDomain: "kgs-test-68924.firebaseapp.com",
  databaseURL: "https://kgs-test-68924-default-rtdb.firebaseio.com",
  projectId: "kgs-test-68924",
  storageBucket: "kgs-test-68924.appspot.com",
  messagingSenderId: "806988019711",
  appId: "1:806988019711:web:3859c3fa8182371761d9ca",
  measurementId: "G-QEP0467K9D"
};
initializeApp(firebaseConfig);
const db = getDatabase();
export { db };

// ——————————————————————————
// ② サーバ時刻オフセット取得
// ——————————————————————————
let serverTimeOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => {
  serverTimeOffset = s.val() || 0;
});
export function getServerTime() {
  return Date.now() + serverTimeOffset;
}

// ——————————————————————————
// ③ ルームID生成
// ——————————————————————————
export async function genId() {
  const roomsRef = ref(db, 'rooms');
  let id, exists = true;
  while (exists) {
    id = String(10000 + Math.floor(Math.random() * 90000));
    // 存在確認
    exists = (await window.firebaseGet(window.firebaseChild(roomsRef, id))).exists();
  }
  return id;
}

// ——————————————————————————
// ④ ルーム作成／参加／イベント送信
// ——————————————————————————
export async function createRoom(roomId, chapters, count, sequence, nick, joinTs) {
  await set(ref(db, `rooms/${roomId}/settings`), { chapters, count, createdAt: getServerTime() });
  await set(ref(db, `rooms/${roomId}/sequence`), sequence);
  await set(ref(db, `rooms/${roomId}/currentIndex`), 0);
  await set(ref(db, `rooms/${roomId}/players/${nick}`), { joinedAt: joinTs });
}

export async function joinRoomInDB(roomId, nick, joinTs) {
  await set(ref(db, `rooms/${roomId}/players/${nick}`), { joinedAt: joinTs });
}

// ——————————————————————————
// ⑤ イベント送信／buzzクリア
// ——————————————————————————
export function pushEventInDB(roomId, ev) {
  return push(ref(db, `rooms/${roomId}/events`), ev);
}
export function removeBuzz(roomId) {
  // buzz を null にしてクリア
  return remove(ref(db, `rooms/${roomId}/buzz`));
}
