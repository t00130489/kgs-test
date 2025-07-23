// timer.js
import { getServerTime } from './firebase.js';

let preInt, qInt, aInt, typeInt;
let currentText = '', typePos = 0;

// 全タイマー停止
export function clearTimers() {
  clearInterval(preInt);
  clearInterval(qInt);
  clearInterval(aInt);
  clearInterval(typeInt);
}

// タイプライター表示（問題文）
export function startTypewriter(textEl, text, speed) {
  currentText = text;
  typePos = 0;
  textEl.textContent = '';
  clearInterval(typeInt);
  typeInt = setInterval(() => {
    if (typePos < currentText.length) {
      textEl.textContent += currentText[typePos++];
    } else {
      clearInterval(typeInt);
    }
  }, speed);
}

// タイプライター一時停止／再開
export function pauseTypewriter() {
  clearInterval(typeInt);
}
export function resumeTypewriter(textEl, speed) {
  clearInterval(typeInt);
  typeInt = setInterval(() => {
    if (typePos < currentText.length) {
      textEl.textContent += currentText[typePos++];
    } else {
      clearInterval(typeInt);
    }
  }, speed);
}

// プリカウントダウン
//   onTick(rem)  → rem を画面に表示
//   onFinish()   → カウントダウン完了後の処理
export function startPreCountdown(startTs, preSec, onTick, onFinish) {
  clearTimers();
  function tick() {
    const rem = preSec - Math.floor((getServerTime() - startTs) / 1000);
    if (rem > 0) {
      onTick(rem);
    } else {
      clearInterval(preInt);
      onFinish();
    }
  }
  tick();
  preInt = setInterval(tick, 200);
}

// 質問タイマー（制限時間30秒など）
//   onTick(rem.toFixed(1))  
//   onTimeout()               → 時間切れ処理
export function startQuestionTimer(startTs, limitSec, onTick, onTimeout) {
  clearInterval(qInt);
  function tick() {
    const elapsed = (getServerTime() - startTs) / 1000;
    const rem = Math.max(0, limitSec - elapsed).toFixed(1);
    onTick(rem);
    if (rem <= 0) {
      clearTimers();
      onTimeout();
    }
  }
  tick();
  qInt = setInterval(tick, 100);
}

// 解答タイマー（15秒など）
//   onTick(sec)  
//   onTimeout()  
export function startAnswerTimer(limitSec, onTick, onTimeout) {
  clearInterval(aInt);
  let s = limitSec;
  onTick(s);
  aInt = setInterval(() => {
    s--;
    onTick(s);
    if (s < 0) {
      clearInterval(aInt);
      onTimeout();
    }
  }, 1000);
}
