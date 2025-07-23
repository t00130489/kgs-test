// state.js

import { TEXT } from './constants.js';
import { getServerTime } from './firebase.js';
import { qTimerEl, buzzBtn, createBtn, chapterCbs } from './dom.js';

// 状態変数
export let quizData = [], sequence = [], idx = 0;
export let myNick = '', roomId = '', joinTs = 0;
export let players = {}, scores = {}, wrongs = {};
export let flowStarted = false, answered = false;
export let questionStart = 0, remainingQTime = TEXT.questionTimeLimit;
export const allEvents = [];

// タイマー＆タイプクリア
export function clearTimers(){
  clearInterval(window._preInt);
  clearInterval(window._qInt);
  clearInterval(window._aInt);
  clearInterval(window._typeInt);
}

export function canBuzz(){ return flowStarted && !answered && !wrongs[myNick]; }

export function updateBuzzState(){
  buzzBtn.disabled = !canBuzz();
  buzzBtn.classList.toggle('disabled-btn', !canBuzz());
}

export function updateCreateBtn(){
  createBtn.disabled = !quizData.length || ![...chapterCbs].some(cb=>cb.checked);
}

// 質問タイマー
export function tickQ(){
  if(!flowStarted) return;
  const elapsed = (getServerTime() - questionStart) / 1000;
  remainingQTime = Math.max(0, TEXT.questionTimeLimit - elapsed).toFixed(1);
  qTimerEl.textContent = TEXT.labels.timeoutLabel + remainingQTime + TEXT.labels.secondsSuffix;
  if(remainingQTime <= 0 && !answered){
    clearTimers();
    onQuestionTimeout();
  }
}

// タイムアップ：問題制限時間
export function onQuestionTimeout(){
  clearTimers();
  answered = true;
  flowStarted = false;
}
