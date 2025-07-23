// firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getDatabase, ref, set, push,
  onValue, onChildAdded, remove,
  get, child
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

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

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// サーバ時刻オフセット取得
let serverTimeOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => serverTimeOffset = s.val() || 0);
export const getServerTime = () => Date.now() + serverTimeOffset;
