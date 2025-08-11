// PCでEnterキーで早押し・次の問題へボタンを押せるように
document.addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.repeat) {
    const t = e.target;
    // 入力系要素内での Enter はグローバル処理しない（回答送信やフォーム用途専用）
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    // 早押しボタン優先
    if (!buzzBtn.disabled && buzzBtn.offsetParent !== null) {
      buzzBtn.click();
      e.preventDefault();
      return;
    }
    // 次の問題へボタン
    if (!nextBtn.disabled && nextBtn.offsetParent !== null) {
      nextBtn.click();
      e.preventDefault();
      return;
    }
  }
});
// script.js

// セクション：定数
const TEXT = {
  preCountdownSec: 3,
  questionTimeLimit: 30,
  answerTimeLimit: 15,
  typeSpeed: 100,
  labels: {
    timeoutLabel: '残り ',
    secondsSuffix: '秒',
    statusAllWrong: '全員誤答… 正解： ',
    statusTimeUp: '時間切れ！ 正解： ',
    statusCorrect: '正解！🎉',
    statusWrong: guess => `不正解（${guess}）`,
    nextQuestion: '次の問題へ',
    finalResult: '最終結果へ',
    returnHome: 'トップページに戻る',
    resultsTitle: '結果',
    participantsHeader: 'メンバーと正解数',
    perQuestionHeader: '問題別 回答一覧',
    correctLabel: '正解者： ',
    incorrectLabel: '不正解者： ',
    timeoutLabelList: 'タイムアウト',
    leaveConfirm: 'ゲームから離脱します。よろしいですか？',
    questionLabelPrefix: '第',
    questionLabelSuffix: '問'
  }
};

// 離脱確認制御
let allowUnload = false;
window.onbeforeunload = e => {
  if (!allowUnload) e.returnValue = TEXT.labels.leaveConfirm;
};

// Firebase 初期化
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getDatabase, ref, set, push,
  onValue, onChildAdded, remove,
  get, child, update,
  runTransaction, onDisconnect
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

initializeApp({
  apiKey: "AIzaSyBYWW8Ldgtow1fxctSqIZynLpxFwRAcc-c",
  authDomain: "kgs-test-68924.firebaseapp.com",
  databaseURL: "https://kgs-test-68924-default-rtdb.firebaseio.com",
  projectId: "kgs-test-68924",
  storageBucket: "kgs-test-68924.appspot.com",
  messagingSenderId: "806988019711",
  appId: "1:806988019711:web:3859c3fa8182371761d9ca",
  measurementId: "G-QEP0467K9D"
});
const db = getDatabase();

// サーバ時刻オフセット取得
let serverTimeOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), s => serverTimeOffset = s.val() || 0);
const getServerTime = () => Date.now() + serverTimeOffset;

// DOM取得

const roomCountInput = document.getElementById('room-count');
const createBtn   = document.getElementById('createBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomIdInput = document.getElementById('roomIdInput');
joinRoomBtn.disabled = true;
// モード選択ラジオボタン取得
const modeInputRadio = document.getElementById('mode-input');
const modeSelectRadio = document.getElementById('mode-select');


// バリデーション用エラー表示

function showInputError(input, message) {
  input.setCustomValidity(message);
  input.reportValidity();
}

// 出題問題数バリデーション

roomCountInput.addEventListener('input', () => {
  const val = roomCountInput.value;
  if (!val.match(/^[0-9]{1,3}$/) || val < 1 || val > 999) {
    showInputError(roomCountInput, '1～999の数字を入力してください');
    createBtn.disabled = true;
  roomCountInput.classList.remove('valid-input');
  } else {
    showInputError(roomCountInput, '');
    createBtn.disabled = false;
  roomCountInput.classList.add('valid-input');
  }
});
roomIdInput.addEventListener('input', () => {
  const val = roomIdInput.value;
  if (val.match(/^[0-9]{5}$/)) {
    showInputError(roomIdInput, '');
    joinRoomBtn.disabled = false;
    roomIdInput.classList.add('valid-input');
  } else {
    showInputError(roomIdInput, '5桁の数字のみ入力してください');
    joinRoomBtn.disabled = true;
    roomIdInput.classList.remove('valid-input');
  }
});
// Enter キーで参加ボタンを押下可能に
roomIdInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !joinRoomBtn.disabled) {
    e.preventDefault();
    joinRoomBtn.click();
  }
});
window.addEventListener('DOMContentLoaded', () => {
  roomIdInput.classList.remove('valid-input');
  roomCountInput.classList.remove('valid-input');
});
const homeDiv     = document.getElementById('home');
const quizAppDiv  = document.getElementById('quiz-app');
const resultsDiv  = document.getElementById('results');
const currentRoom = document.getElementById('currentRoomId');
const chapterCbs  = document.querySelectorAll('#chapter-selection input[type=checkbox][value]');
const gradCb      = document.getElementById('grad-range');
const allCb       = document.getElementById('all-range');
const roomCount   = document.getElementById('room-count');
const roomRange   = document.getElementById('room-range');
const currentNum  = document.getElementById('currentNum');
const totalNum    = document.getElementById('totalNum');
const roomMode    = document.getElementById('room-mode');
const playersUl   = document.getElementById('players');
const statusEl    = document.getElementById('status');
const preCd       = document.getElementById('pre-countdown');
const questionEl  = document.getElementById('question');
const qTimerEl    = document.getElementById('question-timer');
const buzzBtn     = document.getElementById('buzzBtn');
const answerArea  = document.getElementById('answer-area');
const answerInput = document.getElementById('answerInput');
const answerBtn   = document.getElementById('answerBtn');
const aTimerEl    = document.getElementById('answer-timer');
const nextBtn     = document.getElementById('nextBtn');
const startBtn    = document.getElementById('startBtn');
const choiceArea  = document.getElementById('choice-area');

// ホスト用キャプション
const hostCaption = document.createElement('div');
hostCaption.id = 'host-caption';
hostCaption.textContent = '参加者が揃ったら問題スタート！';
hostCaption.style = 'color:#222; font-size:0.95rem; margin-top:1.2rem; margin-bottom:1.2rem; text-align:center; display:block;';

// ホスト用キャプションとボタンを縦並び中央揃えでラップするdiv
const hostWrap = document.createElement('div');
hostWrap.id = 'host-caption-wrap';
hostWrap.style = 'display:flex; flex-direction:column; align-items:center; width:100%;';

// 参加者用キャプション
const waitCaption = document.createElement('div');
waitCaption.id = 'wait-caption';
waitCaption.textContent = 'ルームホストが問題をスタートするのを待っています...';
waitCaption.style = 'color:#222; font-size:0.95rem; margin-bottom:12rem; text-align:center;';

// ニックネーム入力モーダル生成
const nicknameModal = document.createElement('div');
nicknameModal.id = 'nickname-modal';
nicknameModal.style = `
  position: fixed; left: 0; top: 0; width: 100vw; height: 100vh; z-index: 2000;
  background: rgba(0,0,0,0.35); display: none; align-items: center; justify-content: center;
  overflow: auto;
`;
nicknameModal.innerHTML = `
  <div style="background: #fff; border-radius: 12px; padding: 2rem 1.5rem; min-width: 280px; box-shadow: 0 4px 24px rgba(0,0,0,0.18); text-align: center;">
    <div style="font-size: 1.1rem; margin-bottom: 1rem;">あなたのニックネームを入力してください</div>
    <input id="nickname-input" type="text" maxlength="15" style="width: 90%; font-size: 1.1rem; padding: 0.5rem; border-radius: 6px; border: 1px solid #ccc; margin-bottom: 1.2rem;" autocomplete="off">
    <br>
    <button id="nickname-ok" class="btn-primary" style="font-size: 1.1rem; padding: 0.6rem 1.5rem; margin-right: 1.2rem;">OK</button>
    <button id="nickname-cancel" class="btn-secondary" style="font-size: 1.1rem; padding: 0.6rem 1.5rem; background: #e0e0e0; color: #555; border: 1px solid #ccc;">キャンセル</button>
  </div>
`;
document.body.appendChild(nicknameModal);

function showNicknameModal() {
  return new Promise(resolve => {
    const modal = nicknameModal;
    const input = modal.querySelector('#nickname-input');
    const okBtn = modal.querySelector('#nickname-ok');
    const cancelBtn = modal.querySelector('#nickname-cancel');
    modal.style.display = 'flex';
    input.value = '';
    setTimeout(() => {
      input.focus();
      // スマホで中央にスクロール
      if (window.innerWidth <= 600) {
        setTimeout(() => {
          input.scrollIntoView({behavior:'smooth', block:'center'});
        }, 300);
      }
    }, 50);
    function close(val) {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      resolve(val);
    }
    function onOk() {
      const val = input.value.trim();
      if(val) close(val);
      else input.focus();
    }
    function onCancel() {
      close(null);
    }
    function onKey(e) {
      if(e.key==='Enter') onOk();
      if(e.key==='Escape') onCancel();
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
  });
}

// 「第〇問」ラベル
const questionLabelEl = document.getElementById('question-label');
const questionCardBlock = document.getElementById('question-card-block');
// questionElは既に上部で宣言済みなので再宣言しない

// フィードバックオーバーレイ取得
const feedbackOverlay = document.getElementById('feedback-overlay');

// フィードバック表示（アニメーションをスムーズに）
function showFeedback(isCorrect) {
  feedbackOverlay.textContent = isCorrect ? '〇' : '×';
  feedbackOverlay.classList.remove('hidden', 'correct', 'wrong', 'animating');
  // 強制再描画でアニメーションリセット
  void feedbackOverlay.offsetWidth;
  feedbackOverlay.classList.add(isCorrect ? 'correct' : 'wrong', 'animating');
  feedbackOverlay.classList.remove('hidden');
  // 触覚フィードバック
  if (window.navigator.vibrate) {
    window.navigator.vibrate(isCorrect ? [30, 30, 30] : [80, 40, 80]);
  }
  setTimeout(() => {
    feedbackOverlay.classList.remove('animating');
    feedbackOverlay.classList.add('hidden');
  }, 700);
}

// 状態変数
let quizData = [], sequence = [], idx = 0;
let myNick = '', roomId = '', joinTs = 0;
let players = {}, scores = {}, wrongs = {};
// タイマー表示最適化用（直前表示した残り秒：ceil値）
let lastDisplayedQSec = null;
let flowStarted = false, answered = false;
let questionStart = 0, remainingQTime = TEXT.questionTimeLimit;
const allEvents = [];
let nextBtnCountdownTimer = null;
let nextBtnCountdownRemain = 0;
let roomModeValue = 'input';
let pressedCorrectButLost = false;
let alreadyScoredForThisQuestion = false;
let alreadyHandledCorrectEvent = false;
let handledCorrectFor = new Set();
// 追加: 早押し中断での残り時間とタイプ同期解除関数
let pausedRemainingQTime = null; // 秒
let detachTypeSync = null; // onValue の unsubscribe
let heartbeatTimer = null; // 接続維持用ハートビート

// タイマー＆タイプクリア
function clearTimers(){
  clearInterval(window._preInt);
  clearInterval(window._qInt);
  clearInterval(window._aInt);
  clearInterval(window._typeInt);
  clearNextBtnCountdown();
}
function clearNextBtnCountdown() {
  if (nextBtnCountdownTimer) {
    clearInterval(nextBtnCountdownTimer);
    nextBtnCountdownTimer = null;
    nextBtnCountdownRemain = 0;
    // ボタンのラベルを元に戻す
    if (nextBtn) {
      const isFinal = idx+1>=sequence.length;
      nextBtn.textContent = isFinal ? TEXT.labels.finalResult : TEXT.labels.nextQuestion;
      nextBtn.style.minWidth = '';
      // ボタン色リセット
      if (isFinal) {
        nextBtn.classList.add('btn-danger');
        nextBtn.classList.remove('btn-primary');
      } else {
        nextBtn.classList.remove('btn-danger');
        nextBtn.classList.add('btn-primary');
      }
    }
  }
}
function canBuzz(){ return flowStarted && !answered && !wrongs[myNick]; }
function updateBuzzState(){
  buzzBtn.disabled = !canBuzz();
  buzzBtn.classList.toggle('disabled-btn', !canBuzz());
}
function updateCreateBtn(){
  createBtn.disabled = !quizData.length || ![...chapterCbs].some(cb=>cb.checked);
}

// 質問タイマー
function tickQ(){
  if(!flowStarted) return;
  const now = getServerTime();
  const elapsedSec = (now - questionStart) / 1000;
  const remain = Math.max(0, TEXT.questionTimeLimit - elapsedSec);
  remainingQTime = remain; // float 秒保持
  const remainInt = Math.ceil(remain);
  if (lastDisplayedQSec !== remainInt) {
    lastDisplayedQSec = remainInt;
    qTimerEl.textContent = TEXT.labels.timeoutLabel + remainInt + TEXT.labels.secondsSuffix;
  }
  if(remain <= 0 && !answered){
    clearTimers();
    onQuestionTimeout();
  }
}

// タイムアップ：問題制限時間
function onQuestionTimeout(){
  clearTimers();
  answered = true;
  flowStarted = false;
  questionEl.textContent = sequence[idx].question;
  qTimerEl.textContent = '正解：' + sequence[idx].answer;
  qTimerEl.classList.add('show-answer');
  qTimerEl.style.display = 'block';
  statusEl.textContent = '時間切れ！';
  buzzBtn.disabled = true;
  answerArea.classList.add('hidden');
  aTimerEl.style.display = 'none';
  nextBtn.disabled = false;
  startNextBtnCountdown();
  remove(ref(db, `rooms/${roomId}/buzz`));
  pausedRemainingQTime = null;
  if (roomModeValue === 'select') {
    Array.from(choiceArea.children).forEach(b => {
      if (b.dataset.isAnswer === '1') {
        b.classList.add('btn-danger');
      } else {
        b.classList.add('disabled-btn');
      }
      b.disabled = true;
    });
  }
}

// 初期状態
createBtn.disabled = true;
answerArea.classList.add('hidden');
answerBtn.disabled = true;
if (typeof roomModeValue === 'undefined') roomModeValue = 'input';
if (roomModeValue === 'select') {
  buzzBtn.style.display = 'none';
  choiceArea.classList.add('hidden');
} else {
  buzzBtn.disabled = true; buzzBtn.classList.add('disabled-btn');
  buzzBtn.style.display = '';
  choiceArea.classList.add('hidden');
}
startBtn.style.display = 'none';
qTimerEl.style.display = 'none';
aTimerEl.style.display = 'none';

// 範囲プリセット
gradCb.addEventListener('change', ()=>{ chapterCbs.forEach(cb=>{ if(['0','1','4','7'].includes(cb.value)) cb.checked=gradCb.checked; }); updateCreateBtn(); });
allCb.addEventListener('change', ()=>{ chapterCbs.forEach(cb=>cb.checked=allCb.checked); updateCreateBtn(); });
chapterCbs.forEach(cb=>cb.addEventListener('change',updateCreateBtn));

// 問題ロード（最初だけ取得、以降は監視しない）
get(ref(db,'questions')).then(snap => {
  quizData = Object.values(snap.val()||{}).filter(x=>x);
  updateCreateBtn();
});

// ウォッチャー
function updatePlayerList(){
  playersUl.innerHTML='';
  Object.keys(players).forEach(nick=>{
    const li = document.createElement('li');
    li.textContent = `${nick} (${scores[nick]||0}問正解)`;
    playersUl.appendChild(li);
  });
}
function watchPlayers(){
  onValue(ref(db,`rooms/${roomId}/players`), snap=>{
    players = snap.val()||{};
    updatePlayerList();
  });
}
function watchScores(){
  onValue(ref(db,`rooms/${roomId}/scores`), snap=>{
    scores = snap.val()||{};
    updatePlayerList();
  });
}
function watchWrongs(){
  onValue(ref(db,`rooms/${roomId}/wrongAnswers`), snap=>{
    wrongs = snap.val()||{};
    const total = Object.keys(players).length;
    if(!answered && Object.keys(wrongs).length >= total){
      clearTimers(); answered = true; flowStarted = false;
      questionEl.textContent = sequence[idx].question;
      qTimerEl.textContent = '正解：' + sequence[idx].answer;
      qTimerEl.classList.add('show-answer');
      qTimerEl.style.display = 'block';
      statusEl.textContent = '全員誤答…';
      aTimerEl.style.display = 'none';
      answerArea.classList.add('hidden'); buzzBtn.disabled = true;
      nextBtn.disabled = false; remove(ref(db,`rooms/${roomId}/buzz`));
      startNextBtnCountdown();
    }
    updateBuzzState();
  });
}
function watchSettings(){
  onValue(ref(db,`rooms/${roomId}/settings`), snap=>{
    const s = snap.val()||{};
    roomRange.textContent = (s.chapters||[]).map(c=>["序章","第一章","第二章","第三章","第四章","第五章","第六章","第七章"][c]).join('、');
    totalNum.textContent = s.count||0;
    // モード表示
    if (roomMode) {
      roomMode.textContent = s.mode === 'select' ? '選択' : '入力';
    }
  });
}
function watchSequence(){
  onValue(ref(db,`rooms/${roomId}/sequence`), snap=>{ sequence = Object.values(snap.val()||{}).filter(x=>x); });
}
function watchIndex(){
  onValue(ref(db,`rooms/${roomId}/currentIndex`), snap=>{
    idx = snap.val()||0;
    questionLabelEl.textContent = `${TEXT.labels.questionLabelPrefix}${idx+1}${TEXT.labels.questionLabelSuffix}`;
    nextBtn.textContent = idx+1>=sequence.length?TEXT.labels.finalResult:TEXT.labels.nextQuestion;
    set(ref(db,`rooms/${roomId}/wrongAnswers`),null);
  // ---- フラグ/状態リセット（全クライアントで新問開始時に同期） ----
  alreadyHandledCorrectEvent = false;
  alreadyScoredForThisQuestion = false;
  pressedCorrectButLost = false;
  answered = false;
  flowStarted = false;
  clearTimers();
    // 選択モードでは即座に旧選択肢を消しておく（カウントダウン中に表示残りを防止）
    if (roomModeValue === 'select') {
      if (choiceArea) {
        Array.from(choiceArea.children).forEach(b=>b.disabled=true);
        choiceArea.classList.add('hidden');
        choiceArea.innerHTML='';
      }
    }
  // （旧問題のタイピング進捗監視解除は clearTimers でtypeInterval解除済）
  });
}
function watchEvents(){
  onChildAdded(ref(db,`rooms/${roomId}/events`), snap=>{
    const ev = snap.val(); if(ev.timestamp <= joinTs) return;
    allEvents.push(ev);
    if(ev.correct){
      if (handledCorrectFor.has(ev.questionIndex)) return;
      handledCorrectFor.add(ev.questionIndex);
      clearTimers(); answered = true; flowStarted = false;
      questionEl.textContent = sequence[idx].question;
      statusEl.textContent = `${ev.nick} さんが正解！🎉`;
      // スコア加算はサーバ側 Cloud Function (onCorrectEvent) に任せ、
      // scores の同期は watchScores() で行う。
      qTimerEl.textContent = '正解：' + ev.answer;
      qTimerEl.classList.add('show-answer');
      qTimerEl.style.display = 'block';
      aTimerEl.style.display = 'none';
      nextBtn.disabled = false; updateBuzzState();
      startNextBtnCountdown();
      if (roomModeValue === 'select') {
        Array.from(choiceArea.children).forEach(b => {
          if (b.dataset.isAnswer === '1') {
            b.classList.add('btn-danger');
          } else {
            b.classList.add('disabled-btn');
          }
          b.disabled = true;
        });
      }
    } else if(ev.type==='wrongGuess' || ev.type==='answerTimeout'){
      // 誤答 / 回答時間切れ: 問題再開。元の questionStart は維持し残り時間補正
      clearTimers();
  let disp = ev.type==='wrongGuess'?ev.guess:'時間切れ';
  if (ev.type==='wrongGuess' && (!disp || disp==='')) disp = '空欄';
  statusEl.textContent = `${ev.nick} さんが不正解（${disp}）`;
      flowStarted = true;
      // pausedRemainingQTime に基づき questionStart を再計算
      if (pausedRemainingQTime != null) {
        const remain = pausedRemainingQTime; // 秒
        questionStart = getServerTime() - (TEXT.questionTimeLimit - remain) * 1000;
      }
      currentText = sequence[idx].question;
      if (questionEl.textContent.length < currentText.length) {
        typePos = questionEl.textContent.length;
        resumeTypewriter();
      }
      if (typeof typeSyncRef === 'object' && typeSyncRef) {
        get(typeSyncRef).then(snap => {
          const synced = snap.val() || 0;
          typePos = Math.max(questionEl.textContent.length, synced);
          resumeTypewriter();
        });
      } else if (questionEl.textContent.length < currentText.length) {
        typePos = questionEl.textContent.length;
        resumeTypewriter();
      }
  lastDisplayedQSec = null;
  window._qInt = setInterval(tickQ,250);
      pausedRemainingQTime = null; // 再開後クリア
      updateBuzzState();
    }
  });
}

function watchBuzz(){
  onValue(ref(db,`rooms/${roomId}/buzz`), snap=>{
    const b = snap.val();
    if(b && flowStarted && !answered){
      flowStarted = false; clearInterval(window._qInt); pauseTypewriter();
      statusEl.textContent = `${b.nick} さんが押しました`;
  pausedRemainingQTime = remainingQTime; // 中断時の残り時間を記録 (float 秒)
      if(b.nick===myNick){
        answerArea.classList.remove('hidden'); answerBtn.disabled=false; startAnswerTimer();
      }
      updateBuzzState();
    } else if(!b && flowStarted && !answered){
      // コメントは消さず、他UIのみリセット
      answerArea.classList.add('hidden');
      answerInput.value=''; answerBtn.disabled=true; updateBuzzState();
    }
  });
}
function watchPreStart(){
  onValue(ref(db,`rooms/${roomId}/settings/preStart`), snap=>{
    const ts=snap.val(); if(ts){ startBtn.style.display='none'; startPreCountdown(ts); }
  });
}

// ルームID生成
async function genId(){
  const roomsRef = ref(db,'rooms');
  let id, exists=true;
  while(exists){
    id = String(10000 + Math.floor(Math.random()*90000));
    exists = (await get(child(roomsRef,id))).exists();
  }
  return id;
}

// ハートビート開始（lastActive 更新）
function startHeartbeat(){
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(()=>{
    if (!roomId || !myNick) return;
    set(ref(db,`rooms/${roomId}/players/${myNick}/lastActive`), getServerTime()).catch(()=>{});
  },15000); // 15秒間隔
}

// ビジビリティで即時反映
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible' && roomId && myNick){
    set(ref(db,`rooms/${roomId}/players/${myNick}/lastActive`), getServerTime()).catch(()=>{});
  }
});

// ルーム作成
createBtn.addEventListener('click',async()=>{
  if(!quizData.length){ alert('読み込み中…'); return; }
  const chs=[...chapterCbs].filter(cb=>cb.checked).map(cb=>+cb.value);
  const cnt=parseInt(roomCount.value,10);
  // モード取得
  const mode = modeInputRadio.checked ? 'input' : 'select';
  roomModeValue = mode; // ここでグローバル変数にもセット
  if(!chs.length||cnt<1){ alert('範囲と数を指定'); return; }
  const nick = await showNicknameModal();
  if(!nick) return;
  myNick=nick; joinTs=getServerTime(); roomId=await genId();
  await set(ref(db,`rooms/${roomId}/settings`),{chapters:chs,count:cnt,mode:mode,createdAt:getServerTime()});
  const pool = quizData.filter(q=>chs.includes(+q.chapter));
  // Fisher-Yatesシャッフル
  for(let i=pool.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [pool[i],pool[j]]=[pool[j],pool[i]];
  }
  // 選択肢順同期用: 各問題にchoicesOrderを付与
  if (mode === 'select') {
    pool.forEach(q => {
      // 0:answer, 1:ng1, 2:ng2, 3:ng3, 4:ng4
      let order = [0,1,2,3,4];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      q.choicesOrder = order;
    });
  }
  sequence=pool.slice(0,cnt);
  await set(ref(db,`rooms/${roomId}/sequence`),sequence);
  await set(ref(db,`rooms/${roomId}/currentIndex`),0);
  const playerRef = ref(db,`rooms/${roomId}/players/${myNick}`);
  await set(playerRef,{joinedAt:joinTs,lastActive:getServerTime()});
  await runTransaction(ref(db,`rooms/${roomId}/scores/${myNick}`), cur => cur === null ? 0 : cur);
  try { onDisconnect(playerRef).remove(); } catch(e) {}
  startHeartbeat();
  homeDiv.classList.add('hidden'); quizAppDiv.classList.remove('hidden');
  currentRoom.textContent=roomId; startBtn.style.display='block';
  // ホスト用キャプションとボタンを縦並び中央揃えでラップ
  let wrap = document.getElementById('host-caption-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = 'host-caption-wrap';
    wrap.style = 'display:flex; flex-direction:column; align-items:center; width:100%';
    startBtn.parentNode.insertBefore(wrap, startBtn);
  }
  // 必ずキャプション→ボタンの順でラップ内に配置
  if (!wrap.contains(hostCaption)) wrap.appendChild(hostCaption);
  if (!wrap.contains(startBtn)) wrap.appendChild(startBtn);
  // 参加者用キャプションは消す
  if (document.getElementById('wait-caption')) {
    waitCaption.remove();
  }
  // ここで選択モードならbuzzBtnを非表示
  if (roomModeValue === 'select') {
    buzzBtn.style.display = 'none';
    choiceArea.classList.add('hidden');
  } else {
    buzzBtn.style.display = '';
    choiceArea.classList.add('hidden');
  }
  watchPlayers(); watchScores(); watchWrongs();
  watchSettings(); watchSequence(); watchIndex();
  watchEvents(); watchBuzz(); watchPreStart();
});

// ルーム参加
joinRoomBtn.addEventListener('click',async()=>{
  const inputId=roomIdInput.value.trim();
  if(!inputId){ alert('ルームIDを入力してください'); return; }
  const snap=await get(child(ref(db,'rooms'),inputId));
  if(!snap.exists()){ alert('ルームが存在しません'); return; }
  roomId=inputId;
  // ルームのモード取得
  const settingsSnap = await get(ref(db,`rooms/${roomId}/settings`));
  const settingsObj = settingsSnap.val() || {};
  roomModeValue = settingsObj.mode || 'input';
  const nick = await showNicknameModal();
  if(!nick) return;
  // 既存参加者と同じニックネームは不可
  const playersSnap = await get(ref(db,`rooms/${roomId}/players`));
  const playersObj = playersSnap.val() || {};
  if (Object.keys(playersObj).includes(nick)) {
    alert('その名前は既に使われています。他の名前を入力してください。');
    return;
  }
  myNick=nick; joinTs=getServerTime();
  const playerRef = ref(db,`rooms/${roomId}/players/${myNick}`);
  await set(playerRef,{joinedAt:joinTs,lastActive:getServerTime()});
  await runTransaction(ref(db,`rooms/${roomId}/scores/${myNick}`), cur => cur === null ? 0 : cur);
  try { onDisconnect(playerRef).remove(); } catch(e) {}
  startHeartbeat();
  homeDiv.classList.add('hidden'); quizAppDiv.classList.remove('hidden');
  currentRoom.textContent=roomId;
  // 早押しボタンの上に参加者用キャプションを挿入
  if (!document.getElementById('wait-caption')) {
    buzzBtn.parentNode.insertBefore(waitCaption, buzzBtn);
  }
  // ホスト用キャプションは消す
  // ホスト用キャプションとラップは消す
  if (document.getElementById('host-caption')) {
    hostCaption.remove();
  }
  if (document.getElementById('host-caption-wrap')) {
    document.getElementById('host-caption-wrap').remove();
  }
  // ここで選択モードならbuzzBtnを非表示
  if (roomModeValue === 'select') {
    buzzBtn.style.display = 'none';
    choiceArea.classList.add('hidden');
  } else {
    buzzBtn.style.display = '';
    choiceArea.classList.add('hidden');
  }
  watchPlayers(); watchScores(); watchWrongs();
  watchSettings(); watchSequence(); watchIndex();
  watchEvents(); watchBuzz(); watchPreStart();
});

// プリカウント→出題
startBtn.addEventListener('click',async()=>{
  const now=getServerTime(); await set(ref(db,`rooms/${roomId}/settings/preStart`),now);
});

// ローカルで残り秒数を先行描画
function updateLocalCountdown(startTs) {
  const tick = () => {
    const rem = TEXT.preCountdownSec - Math.floor((getServerTime() - startTs) / 1000);
    if (rem > 0) preCd.textContent = rem;
    else {
      clearInterval(window._preInt);
      preCd.textContent = '';
    }
  };
  tick();
  window._preInt = setInterval(tick, 200);
}

function startPreCountdown(startTs){
  clearTimers(); flowStarted=false; answered=false; pausedRemainingQTime = null;
  statusEl.textContent=''; answerArea.classList.add('hidden'); answerInput.value='';
  qTimerEl.style.display='none'; aTimerEl.style.display='none'; questionEl.style.visibility='hidden';
  // カードブロックを表示、ラベル・カウントダウンをセット
  questionCardBlock.classList.remove('hidden');
  questionLabelEl.style.visibility='visible';
  questionLabelEl.textContent = `${TEXT.labels.questionLabelPrefix}${idx+1}${TEXT.labels.questionLabelSuffix}`;
  document.getElementById('pre-countdown').style.display = 'block';
  document.getElementById('question').style.display = 'none';
  document.getElementById('question-timer').style.display = 'none';
  nextBtn.disabled=true;
  // 選択モード時：カウントダウン表示中は選択肢を隠しておく（ホスト以外で残留する不具合対策）
  if (roomModeValue === 'select' && choiceArea) {
    Array.from(choiceArea.children).forEach(b=>b.disabled=true);
    choiceArea.classList.add('hidden');
  }
  // キャプションを消す
  // キャプションとラップを消す
  if (document.getElementById('host-caption')) hostCaption.remove();
  if (document.getElementById('host-caption-wrap')) document.getElementById('host-caption-wrap').remove();
  if (document.getElementById('wait-caption')) waitCaption.remove();
  // まずローカルで先行描画
  const localStartTs = getServerTime();
  updateLocalCountdown(localStartTs);
  // DBイベント到着で正確なstartTsに調整
  onValue(ref(db,`rooms/${roomId}/settings/preStart`), snap => {
    const dbStartTs = snap.val();
    if (dbStartTs) {
      clearInterval(window._preInt);
      // 正確なタイミングで再カウント
      const tick = () => {
        const rem = TEXT.preCountdownSec - Math.floor((getServerTime() - dbStartTs) / 1000);
        if (rem > 0) preCd.textContent = rem;
        else {
          clearInterval(window._preInt);
          preCd.textContent = '';
          questionStart = dbStartTs + TEXT.preCountdownSec * 1000;
          flowStarted = true;
          showQuestion();
        }
      };
      tick();
      window._preInt = setInterval(tick, 200);
    }
  }, { onlyOnce: true });
}

// タイプ制御
let typePos=0, currentText='';
let typeSyncRef = null;
// --- typePosバッチ送信用 ---
let typePosSendBuffer = null;
let typePosBatchTimer = null;
function showQuestion(){
  // 旧リスナー解除
  if (detachTypeSync) { try { detachTypeSync(); } catch(e) {} detachTypeSync = null; }
  currentText = sequence[idx].question; typePos = 0;
  questionEl.textContent = '';
  questionEl.style.visibility = 'visible';
  questionCardBlock.classList.remove('hidden');
  document.getElementById('pre-countdown').style.display = 'none';
  document.getElementById('question').style.display = 'block';
  const qt = document.getElementById('question-timer');
  qt.classList.remove('show-answer');
  qt.style.display = 'block';
  clearInterval(window._typeInt);
  typeSyncRef = ref(db, `rooms/${roomId}/typePos/${idx}`);
  let lastTypePos = 0;
  window._typeInt = setInterval(() => {
    if (typePos < currentText.length) {
      questionEl.textContent += currentText[typePos++];
      if (myNick === Object.keys(players)[0]) {
        if (typePos > lastTypePos) {
          // バッファに最新値を保存
          typePosSendBuffer = typePos;
        }
      }
    } else {
      clearInterval(window._typeInt);
    }
  }, TEXT.typeSpeed);
  // --- バッチ送信タイマー ---
  if (typePosBatchTimer) clearInterval(typePosBatchTimer);
  if (myNick === Object.keys(players)[0]) {
    typePosBatchTimer = setInterval(() => {
      if (typePosSendBuffer !== null) {
        set(typeSyncRef, typePosSendBuffer);
        typePosSendBuffer = null;
      }
    }, 200);
  }
  if (typePosBatchTimer) { clearInterval(typePosBatchTimer); typePosBatchTimer = null; }
  if (myNick !== Object.keys(players)[0]) {
    detachTypeSync = onValue(typeSyncRef, snap => {
      const synced = snap.val() || 0;
      if (synced > typePos && typePos < currentText.length) {
        questionEl.textContent += currentText.slice(typePos, synced);
        typePos = synced;
      }
    });
  }
  currentNum.textContent=idx+1;
  clearInterval(window._qInt); qTimerEl.style.display='block';
  questionStart=getServerTime(); remainingQTime=TEXT.questionTimeLimit; pausedRemainingQTime = null;
  lastDisplayedQSec = null;
  window._qInt=setInterval(tickQ,250); 
  // --- 選択モード分岐 ---
  if (roomModeValue === 'select') {
    buzzBtn.style.display = 'none';
    answerArea.classList.add('hidden');
    choiceArea.classList.remove('hidden');
    // 選択肢生成（answer, ng1～ng4）
    const q = sequence[idx];
    let baseChoices = [q.answer, q.ng1, q.ng2, q.ng3, q.ng4];
    let choices;
    if (q.choicesOrder && Array.isArray(q.choicesOrder) && q.choicesOrder.length === 5) {
      choices = q.choicesOrder.map(i => ({c: baseChoices[i], i}));
    } else {
      // 旧データや入力モード用: ローカルシャッフル
      choices = baseChoices.map((c, i) => ({c, i}));
      for (let i = choices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [choices[i], choices[j]] = [choices[j], choices[i]];
      }
    }
    // 選択肢一着判定用のリセット
    if (roomModeValue === 'select') {
      // 問題ごとに一着判定用のselectBuzzをリセット
      remove(ref(db, `rooms/${roomId}/selectBuzz`));
    }
    choiceArea.innerHTML = '';
    choices.forEach(obj => {
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.textContent = obj.c;
      btn.style.fontSize = '1.15em';
      btn.style.padding = '0.7em 0.5em';
      btn.style.marginBottom = '0.2em';
      btn.dataset.choiceIdx = obj.i;
      btn.dataset.isAnswer = (obj.i === 0 ? '1' : '0');
      btn.disabled = false;
      // 選択肢ボタン押下時の処理
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        // 正解ボタン
        if (btn.dataset.isAnswer === '1') {
          // 一着判定（トランザクション）
          const selectRef = ref(db, `rooms/${roomId}/selectBuzz`);
          btn.disabled = true;
          btn.classList.add('disabled-btn');
          // 楽観的UI
          statusEl.textContent = `${myNick} さんが押しました（判定中…）`;
          await runTransaction(selectRef, current => {
            if (current === null) {
              return {
                nick: myNick,
                time: getServerTime()
              };
            }
            return;
          }).then(async result => {
            if (!result.committed) {
              // 失敗時ロールバック
              // 先に押した人の名前を取得して表示
              get(selectRef).then(snap => {
                const selectData = snap.val();
                const who = selectData && selectData.nick ? selectData.nick : '他のプレイヤー';
                if (who === myNick) {
                  statusEl.textContent = `正解！🎉`;
                  showFeedback(true);
                } else {
                  statusEl.textContent = `${who} さんが先に押しました…`;
                }
                // 全ボタン無効化
                Array.from(choiceArea.children).forEach(b => b.disabled = true);
              });
            } else {
              // 一着で正解した場合
              statusEl.textContent = `正解！🎉`;
              showFeedback(true);
              Array.from(choiceArea.children).forEach(b => b.disabled = true);
              // 正解イベント送信
              await push(ref(db, `rooms/${roomId}/events`), {
                nick: myNick,
                correct: true,
                guess: btn.textContent,
                answer: sequence[idx].answer,
                questionIndex: idx,
                timestamp: getServerTime(),
                type: 'selectCorrect'
              });
              // タイマー停止・次の問題へボタン有効化等はwatchEventsで処理
            }
          });
        } else {
          // 誤答ボタン
          btn.disabled = true;
          btn.classList.add('disabled-btn');
          btn.style.background = '#e0e0e0';
          btn.style.color = '#888';
          // 不正解フィードバック
          showFeedback(false);
          // 全ボタン無効化
          Array.from(choiceArea.children).forEach(b => b.disabled = true);
          // イベント送信
          await push(ref(db, `rooms/${roomId}/events`), {
            nick: myNick,
            correct: false,
            guess: btn.textContent,
            answer: sequence[idx].answer,
            questionIndex: idx,
            timestamp: getServerTime(),
            type: 'wrongGuess'
          });
          await set(ref(db,`rooms/${roomId}/wrongAnswers/${myNick}`), true);
        }
      });
      choiceArea.appendChild(btn);
    });
  } else {
    buzzBtn.style.display = '';
    choiceArea.classList.add('hidden');
    updateBuzzState();
  }
}
function pauseTypewriter(){ clearInterval(window._typeInt); }
function resumeTypewriter(){
  clearInterval(window._typeInt);
  typePos = questionEl.textContent.length;
  let lastTypePos = typePos;
  window._typeInt = setInterval(() => {
    if (typePos < currentText.length) {
      questionEl.textContent += currentText[typePos++];
      if (myNick === Object.keys(players)[0]) {
        if (typePos > lastTypePos) {
          set(typeSyncRef, typePos);
          lastTypePos = typePos;
        }
      }
    } else {
      clearInterval(window._typeInt);
    }
  }, TEXT.typeSpeed);
}

// 解答タイマー
function startAnswerTimer(){
  clearInterval(window._aInt);
  let s=TEXT.answerTimeLimit;
  aTimerEl.style.display='block';
  aTimerEl.textContent=TEXT.labels.timeoutLabel+s+TEXT.labels.secondsSuffix;
  window._aInt=setInterval(async()=>{
    s--;
    if(s<0){
      clearInterval(window._aInt);
      // 解答時間切れイベント
      await push(ref(db,`rooms/${roomId}/events`),{
        nick:myNick,correct:false,guess:'時間切れ',
        answer:sequence[idx].answer,type:'answerTimeout',
        questionIndex:idx,timestamp:getServerTime()
      });
      await set(ref(db,`rooms/${roomId}/wrongAnswers/${myNick}`),true);
      answerArea.classList.add('hidden'); answerInput.value='';
      remove(ref(db,`rooms/${roomId}/buzz`));
    } else {
      aTimerEl.textContent=TEXT.labels.timeoutLabel+s+TEXT.labels.secondsSuffix;
    }
  },1000);
}

// 次の問題へボタンのカウントダウン＆自動遷移
function startNextBtnCountdown() {
  clearNextBtnCountdown();
  nextBtnCountdownRemain = 5;
  const isFinal = idx+1>=sequence.length;
  const origLabel = isFinal ? TEXT.labels.finalResult : TEXT.labels.nextQuestion;
  nextBtn.textContent = `${origLabel}（${nextBtnCountdownRemain}）`;
  nextBtn.style.minWidth = '8.5em';
  // ボタン色切り替え
  if (isFinal) {
    nextBtn.classList.add('btn-danger');
    nextBtn.classList.remove('btn-primary');
  } else {
    nextBtn.classList.remove('btn-danger');
    nextBtn.classList.add('btn-primary');
  }
  nextBtnCountdownTimer = setInterval(() => {
    nextBtnCountdownRemain--;
    if (nextBtnCountdownRemain > 0) {
      nextBtn.textContent = `${origLabel}（${nextBtnCountdownRemain}）`;
    } else {
      clearNextBtnCountdown();
      // 自動でボタン押下処理
      if (!nextBtn.disabled) nextBtn.click();
    }
  }, 1000);
}

// 早押しボタン処理（トランザクション＋楽観的UI反映）
buzzBtn.addEventListener('click', async (e) => {
  if (!canBuzz()) return;
  createRipple(e);
  if (window.navigator.vibrate) window.navigator.vibrate(50);
  clearInterval(window._qInt);
  pauseTypewriter();
  pausedRemainingQTime = remainingQTime;
  statusEl.textContent = `${myNick} さんが押しました（判定中…）`;
  const buzzRef = ref(db, `rooms/${roomId}/buzz`);
  await runTransaction(buzzRef, current => {
    if (current === null) {
      return { nick: myNick, time: getServerTime() };
    }
    return;
  }).then(result => {
    if (!result.committed) {
      get(buzzRef).then(snap => {
        const buzzData = snap.val();
        const who = buzzData && buzzData.nick ? buzzData.nick : '他のプレイヤー';
        statusEl.textContent = `${who} さんが先に押しました…`;
      });
      answerArea.classList.add('hidden');
      answerBtn.disabled = true;
      aTimerEl.style.display = 'none';
      answerInput.value = '';
      answered = false;
      // 失敗したのでタイプ再開 & タイマー再開
      if (!flowStarted) {
        flowStarted = true;
        if (pausedRemainingQTime != null) {
          questionStart = getServerTime() - (TEXT.questionTimeLimit - pausedRemainingQTime) * 1000;
        }
  lastDisplayedQSec = null;
  window._qInt = setInterval(tickQ,250);
        resumeTypewriter();
      }
    } else {
      setTimeout(() => {
        if (document.activeElement !== answerInput) answerInput.focus();
        if (window.innerWidth <= 600) {
          setTimeout(() => { answerInput.scrollIntoView({behavior:'smooth', block:'center'}); }, 300);
        }
      }, 100);
    }
  });
});

// リップルエフェクト生成
function createRipple(e) {
  const btn = buzzBtn;
  let ripple = btn.querySelector('.ripple');
  if (ripple) ripple.remove();
  ripple = document.createElement('span');
  ripple.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  const x = e.clientX - rect.left - size / 2;
  const y = e.clientY - rect.top - size / 2;
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  btn.appendChild(ripple);
  setTimeout(() => ripple.remove(), 600);
}

// 解答提出

// 解答ボタンのクリック・Enter対応
async function submitAnswer() {
  answerBtn.disabled = true;
  const guess = answerInput.value.trim();
  // 空欄でも回答可能にし、不正解として処理
  const corr = sequence[idx].answer.trim();
  const isCorrect = (guess === corr && guess !== '');

  // フィードバック表示
  showFeedback(isCorrect);

  // イベントオブジェクト作成
  const ev = {
    nick: myNick,
    correct: isCorrect,
    guess: guess,
    answer: corr,
    questionIndex: idx,
    timestamp: getServerTime()
  };
  if (!isCorrect) ev.type = 'wrongGuess';
  await push(ref(db, `rooms/${roomId}/events`), ev);

  if (isCorrect) {
    // 正解処理（スコア加算はwatchEventsで行う）
    clearTimers();
    answered = true;
    flowStarted = false;
    pausedRemainingQTime = null;

    questionEl.textContent = sequence[idx].question;
    qTimerEl.textContent = '正解：' + corr;
    qTimerEl.style.display = 'block';
    buzzBtn.disabled = true;
    answerArea.classList.add('hidden');
    aTimerEl.style.display = 'none';
    nextBtn.disabled = false;

    await remove(ref(db, `rooms/${roomId}/buzz`));
    updateBuzzState();
    startNextBtnCountdown();
  } else {
    // 誤答処理
    clearTimers();
    await set(ref(db, `rooms/${roomId}/wrongAnswers/${myNick}`), true);
    answerArea.classList.add('hidden');
    answerInput.value = '';
    await remove(ref(db, `rooms/${roomId}/buzz`));
    // 再開は watchEvents の wrongGuess で処理
    // 入力モードでは誤答者本人にも体感遅延なく再開させる（イベント往復待ちを避ける）
    if (roomModeValue === 'input') {
      // 全員誤答時はローカル再開をスキップ（正答表示を上書きしない）
      if (answered || !flowStarted) return;
      try {
        // watchEvents の wrongGuess 再開処理を軽量コピー
        if (pausedRemainingQTime != null) {
          const remain = pausedRemainingQTime;
          questionStart = getServerTime() - (TEXT.questionTimeLimit - remain) * 1000;
        }
        flowStarted = true;
        // タイプ再開（既に全部出ていない場合）
        currentText = sequence[idx].question;
        if (questionEl.textContent.length < currentText.length) {
          typePos = questionEl.textContent.length;
          resumeTypewriter();
        }
        // タイマー再開
        lastDisplayedQSec = null;
        clearInterval(window._qInt);
        window._qInt = setInterval(tickQ,250);
        pausedRemainingQTime = null;
        updateBuzzState();
      } catch(e){ /* noop */ }
    }
  }
}
// 回答ボタン/Enter キーイベント（入力モード用）※ Enter のバブリングで次問へ飛ばないよう停止
if (answerBtn && answerInput) {
  answerBtn.addEventListener('click', submitAnswer);
  answerInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !answerBtn.disabled) {
      e.preventDefault();
      e.stopPropagation();
      submitAnswer();
    }
  });
}
// 回答ボタン/Enter キーイベント（復旧）
answerBtn.addEventListener('click', submitAnswer);
answerInput.addEventListener('keydown', e => {
  if (!answerBtn.disabled && e.key === 'Enter') submitAnswer();
});
// 次へ
nextBtn.addEventListener('click', async () => {
  if (nextBtn.disabled) return;
  clearNextBtnCountdown();
  clearTimers();
  questionEl.textContent = '';
  questionEl.style.visibility = 'hidden';
  statusEl.textContent = '';
  qTimerEl.style.display = 'none';
  aTimerEl.style.display = 'none';
  questionLabelEl.style.visibility = 'hidden';
  if (choiceArea) {
    choiceArea.classList.add('hidden');
    choiceArea.innerHTML = '';
  }
  pressedCorrectButLost = false;
  alreadyScoredForThisQuestion = false;
  alreadyHandledCorrectEvent = false;
  if (idx + 1 < sequence.length) {
    await set(ref(db, `rooms/${roomId}/currentIndex`), idx + 1);
    await set(ref(db, `rooms/${roomId}/settings/preStart`), getServerTime());
  } else {
    showResults();
  }
});

// 結果表示
async function showResults(){
  window.scrollTo({top: 0, left: 0, behavior: 'auto'});
  quizAppDiv.classList.add('hidden');
  resultsDiv.classList.remove('hidden');
  allowUnload = true;
  // 最新プレイヤー/スコア/イベントを取得（途中参加対策でリアルタイム蓄積に依存しない）
  const [ps, sc, evSnap] = await Promise.all([
    get(ref(db,`rooms/${roomId}/players`)),
    get(ref(db,`rooms/${roomId}/scores`)),
    get(ref(db,`rooms/${roomId}/events`))
  ]);
  players = ps.val() || {};
  scores = sc.val() || {};
  const eventsObj = evSnap.val() || {};
  const eventsArr = Object.values(eventsObj).filter(Boolean).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
  const scoreValues = Object.values(scores).map(v => v || 0);
  const maxScore = scoreValues.length ? Math.max(...scoreValues) : 0;
  const winners = maxScore > 0
    ? Object.keys(scores).filter(nick => (scores[nick] || 0) === maxScore)
    : [];

  let html = `<h2>${TEXT.labels.resultsTitle}</h2>`;
  if(winners.length){
    html += `<h3 class="champion-announcement">🏆 優勝者：${winners.join('、')}（${maxScore}問正解）</h3>`;
  } else {
    html += `<h3 class="champion-announcement">🏆 優勝者なし</h3>`;
  }
  html += `<h3>${TEXT.labels.participantsHeader}</h3><ul>`;
  Object.keys(players).forEach(nick => {
    const score = scores[nick] || 0;
    const cls = winners.includes(nick) ? ' class="winner"' : '';
    html += `<li${cls}>${nick}：${score}問正解</li>`;
  });
  html += `</ul><h3>${TEXT.labels.perQuestionHeader}</h3>`;
  sequence.forEach((q, i) => {
    html += `<div class="result-question-card"><h4>第${i+1}問： ${q.question}</h4><p>正解： ${q.answer}</p><ul>`;
    const qEvents = eventsArr.filter(e => e.questionIndex === i);
    const win = qEvents.filter(e=>e.correct).map(e=>e.nick);
    html += `<li>${TEXT.labels.correctLabel}${win.length ? win.join('、') : 'なし'}</li>`;
    qEvents.filter(e=>!e.correct).forEach(e=>{
      let disp='';
      if (e.guess === '' && e.type === 'wrongGuess') disp = '空欄';
      else if (!e.guess || e.guess === '時間切れ' || e.type === 'answerTimeout') disp = '時間切れ';
      else disp = e.guess;
      html += `<li>${TEXT.labels.incorrectLabel}${e.nick}（${disp}）</li>`;
    });
    html += `</ul></div>`;
  });
  html += `<button id="backBtn" class="btn-primary">${TEXT.labels.returnHome}</button>`;

  resultsDiv.innerHTML = html;
  document.getElementById('backBtn').addEventListener('click', () => {
    allowUnload = true;
    window.scrollTo({top: 0, left: 0, behavior: 'auto'});
    location.reload();
  });
}



// 離脱後削除
window.addEventListener('unload',()=>{ remove(ref(db,`rooms/${roomId}/players/${myNick}`)); });

// --- 最終結果画面の空欄回答と時間切れの区別 ---
// 回答一覧表示部分を修正
function getAnswerDisplay(ans, timedOut) {
  if (timedOut) return '時間切れ';
  if (ans === '') return '（空欄）';
  return ans;
}

// statusElにテキストをセット。空の場合は全角スペースで高さ維持
function setStatus(text) {
  statusEl.textContent = text && text.trim() ? text : '　';
}
