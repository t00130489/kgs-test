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
  get, child,
  runTransaction // ← ここを追加
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
const createBtn   = document.getElementById('createBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomIdInput = document.getElementById('roomIdInput');
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

// 「第〇問」ラベル
const questionLabelEl = document.createElement('div');
questionLabelEl.id = 'questionLabel';
questionLabelEl.className = 'question-label';
questionLabelEl.style.visibility = 'hidden';
quizAppDiv.insertBefore(questionLabelEl, preCd);

// フィードバックオーバーレイ取得
const feedbackOverlay = document.getElementById('feedback-overlay');

// フィードバック表示
function showFeedback(isCorrect) {
  feedbackOverlay.textContent = isCorrect ? '〇' : '×';
  feedbackOverlay.classList.remove('hidden', 'correct', 'wrong');
  feedbackOverlay.classList.add(isCorrect ? 'correct' : 'wrong');
  setTimeout(() => {
    feedbackOverlay.classList.add('hidden');
  }, 800);
}

// 状態変数
let quizData = [], sequence = [], idx = 0;
let myNick = '', roomId = '', joinTs = 0;
let players = {}, scores = {}, wrongs = {};
let flowStarted = false, answered = false;
let questionStart = 0, remainingQTime = TEXT.questionTimeLimit;
const allEvents = [];

// タイマー＆タイプクリア
function clearTimers(){
  clearInterval(window._preInt);
  clearInterval(window._qInt);
  clearInterval(window._aInt);
  clearInterval(window._typeInt);
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
  const elapsed = (getServerTime() - questionStart) / 1000;
  remainingQTime = Math.max(0, TEXT.questionTimeLimit - elapsed).toFixed(1);
  qTimerEl.textContent = TEXT.labels.timeoutLabel + remainingQTime + TEXT.labels.secondsSuffix;
  if(remainingQTime <= 0 && !answered){
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
  statusEl.textContent = TEXT.labels.statusTimeUp + sequence[idx].answer;
  buzzBtn.disabled = true;
  answerArea.classList.add('hidden');
  qTimerEl.style.display = 'none';
  aTimerEl.style.display = 'none';
  nextBtn.disabled = false;
  remove(ref(db, `rooms/${roomId}/buzz`));
}

// 初期UI
createBtn.disabled = true;
answerArea.classList.add('hidden');
answerBtn.disabled = true;
buzzBtn.disabled = true; buzzBtn.classList.add('disabled-btn');
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
function watchPlayers(){
  onValue(ref(db,`rooms/${roomId}/players`), snap=>{
    players = snap.val()||{}; playersUl.innerHTML='';
    Object.keys(players).forEach(nick=>{
      const li = document.createElement('li');
      li.textContent = `${nick} (${scores[nick]||0}問正解)`;
      playersUl.appendChild(li);
    });
  });
}
function watchScores(){
  onValue(ref(db,`rooms/${roomId}/scores`), snap=>{ scores = snap.val()||{}; watchPlayers(); });
}
function watchWrongs(){
  onValue(ref(db,`rooms/${roomId}/wrongAnswers`), snap=>{
    wrongs = snap.val()||{};
    const total = Object.keys(players).length;
    if(!answered && Object.keys(wrongs).length >= total){
      clearTimers(); answered = true; flowStarted = false;
      questionEl.textContent = sequence[idx].question;
      statusEl.textContent = TEXT.labels.statusAllWrong + sequence[idx].answer;
      qTimerEl.style.display = 'none'; aTimerEl.style.display = 'none';
      answerArea.classList.add('hidden'); buzzBtn.disabled = true;
      nextBtn.disabled = false; remove(ref(db,`rooms/${roomId}/buzz`));
    }
    updateBuzzState();
  });
}
function watchSettings(){
  onValue(ref(db,`rooms/${roomId}/settings`), snap=>{
    const s = snap.val()||{};
    roomRange.textContent = (s.chapters||[]).map(c=>["序章","第一章","第二章","第三章","第四章","第五章","第六章","第七章"][c]).join('、');
    totalNum.textContent = s.count||0;
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
  });
}
function watchEvents(){
  onChildAdded(ref(db,`rooms/${roomId}/events`), snap=>{
    const ev = snap.val(); if(ev.timestamp <= joinTs) return;
    allEvents.push(ev);
    if(ev.correct){
      clearTimers(); answered = true; flowStarted = false;
      questionEl.textContent = sequence[idx].question;
      statusEl.textContent = `${ev.nick} さんが正解！🎉 正解： ${ev.answer}`;
      qTimerEl.style.display = 'none'; aTimerEl.style.display = 'none';
      nextBtn.disabled = false; updateBuzzState();
    } else if(ev.type==='wrongGuess' || ev.type==='answerTimeout'){
      clearTimers();
      const disp = ev.type==='wrongGuess'?ev.guess:'時間切れ';
      statusEl.textContent = `${ev.nick} さんが不正解（${disp}）`;
      flowStarted = true;
      questionStart = ev.timestamp;
      window._qInt = setInterval(tickQ,100);
      resumeTypewriter(); updateBuzzState();
    }
  });
}
function watchBuzz(){
  onValue(ref(db,`rooms/${roomId}/buzz`), snap=>{
    const b = snap.val();
    if(b && flowStarted && !answered){
      flowStarted = false; clearInterval(window._qInt); pauseTypewriter();
      statusEl.textContent = `${b.nick} さんが押しました`;
      if(b.nick===myNick){
        answerArea.classList.remove('hidden'); answerBtn.disabled=false; startAnswerTimer();
      }
      updateBuzzState();
    } else if(!b && flowStarted && !answered){
      statusEl.textContent=''; answerArea.classList.add('hidden');
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

// ルーム作成
createBtn.addEventListener('click',async()=>{
  if(!quizData.length){ alert('読み込み中…'); return; }
  const chs=[...chapterCbs].filter(cb=>cb.checked).map(cb=>+cb.value);
  const cnt=parseInt(roomCount.value,10);
  if(!chs.length||cnt<1){ alert('範囲と数を指定'); return; }
  const nick=prompt('ニックネーム（ルームホスト）'); if(!nick) return;
  myNick=nick; joinTs=getServerTime(); roomId=await genId();
  await set(ref(db,`rooms/${roomId}/settings`),{chapters:chs,count:cnt,createdAt:getServerTime()});
  sequence=quizData.filter(q=>chs.includes(+q.chapter)).sort(()=>Math.random()-.5).slice(0,cnt);
  await set(ref(db,`rooms/${roomId}/sequence`),sequence);
  await set(ref(db,`rooms/${roomId}/currentIndex`),0);
  await set(ref(db,`rooms/${roomId}/players/${myNick}`),{joinedAt:joinTs});
  homeDiv.classList.add('hidden'); quizAppDiv.classList.remove('hidden');
  currentRoom.textContent=roomId; startBtn.style.display='block';
  watchPlayers(); watchScores(); watchWrongs();
  watchSettings(); watchSequence(); watchIndex();
  watchEvents(); watchBuzz(); watchPreStart();
});

// ルーム参加
joinRoomBtn.addEventListener('click',async()=>{
  const inputId=roomIdInput.value.trim(); if(!inputId){ alert('ルームIDを入力してください'); return; }
  const snap=await get(child(ref(db,'rooms'),inputId)); if(!snap.exists()){ alert('ルームが存在しません'); return; }
  roomId=inputId; const nick=prompt('ニックネーム'); if(!nick) return;
  myNick=nick; joinTs=getServerTime();
  await set(ref(db,`rooms/${roomId}/players/${myNick}`),{joinedAt:joinTs});
  homeDiv.classList.add('hidden'); quizAppDiv.classList.remove('hidden');
  currentRoom.textContent=roomId;
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
  clearTimers(); flowStarted=false; answered=false;
  statusEl.textContent=''; answerArea.classList.add('hidden'); answerInput.value='';
  qTimerEl.style.display='none'; aTimerEl.style.display='none'; questionEl.style.visibility='hidden';
  questionLabelEl.style.visibility='visible';
  questionLabelEl.textContent=`${TEXT.labels.questionLabelPrefix}${idx+1}${TEXT.labels.questionLabelSuffix}`;
  nextBtn.disabled=true;
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
function showQuestion(){
  currentText=sequence[idx].question; typePos=0;
  questionEl.textContent=''; questionEl.style.visibility='visible';
  clearInterval(window._typeInt);
  window._typeInt=setInterval(()=>{
    if(typePos<currentText.length) questionEl.textContent+=currentText[typePos++];
    else clearInterval(window._typeInt);
  }, TEXT.typeSpeed);
  currentNum.textContent=idx+1;
  clearInterval(window._qInt); qTimerEl.style.display='block';
  questionStart=getServerTime(); remainingQTime=TEXT.questionTimeLimit;
  window._qInt=setInterval(tickQ,100); updateBuzzState();
}
function pauseTypewriter(){ clearInterval(window._typeInt); }
function resumeTypewriter(){
  clearInterval(window._typeInt);
  window._typeInt=setInterval(()=>{
    if(typePos<currentText.length) questionEl.textContent+=currentText[typePos++];
    else clearInterval(window._typeInt);
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

// 早押しボタン処理（トランザクション＋楽観的UI反映）
buzzBtn.addEventListener('click', async () => {
  if (!canBuzz()) return;
  clearInterval(window._qInt);
  pauseTypewriter();

  // 楽観的UI反映
  statusEl.textContent = `${myNick} さんが押しました（判定中…）`;

  const buzzRef = ref(db, `rooms/${roomId}/buzz`);
  await runTransaction(buzzRef, current => {
    if (current === null) {
      return {
        nick: myNick,
        time: getServerTime()
      };
    }
    return;
  }).then(result => {
    if (!result.committed) {
      // 失敗時ロールバック
      // 先に押した人の名前を取得して表示
      get(buzzRef).then(snap => {
        const buzzData = snap.val();
        const who = buzzData && buzzData.nick ? buzzData.nick : '誰か';
        statusEl.textContent = `${who} さんが先に押しました…`;
      });
      // 回答欄・ボタン・タイマーを非表示にし、状態をリセット
      answerArea.classList.add('hidden');
      answerBtn.disabled = true;
      aTimerEl.style.display = 'none';
      answerInput.value = '';
      // 早押し未参加状態に戻す
      answered = false;
      // タイムアップ誤答等の処理は行わない
    }
    // 成功時はwatchBuzzでUI確定
  });
});

// 解答提出
answerBtn.addEventListener('click',async()=>{
  answerBtn.disabled = true;
  const guess = answerInput.value.trim();
  if (!guess) { alert('回答を入力してください'); answerBtn.disabled = false; return; }
  const corr = sequence[idx].answer.trim();
  const isCorrect = (guess === corr);

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
  if (!isCorrect) {
    ev.type = 'wrongGuess';
  }

  // Firebase に送信
  await push(ref(db, `rooms/${roomId}/events`), ev);

  if (isCorrect) {
    // 正解処理
    const sr = ref(db, `rooms/${roomId}/scores/${myNick}`);
    const snap = await get(sr), prev = snap.exists() ? snap.val() : 0;
    await set(sr, prev + 1);

    clearTimers();
    answered = true;
    flowStarted = false;

    questionEl.textContent = sequence[idx].question;
    statusEl.textContent = `${myNick} さんが正解！🎉 正解： ${corr}`;
    buzzBtn.disabled = true;
    answerArea.classList.add('hidden');
    qTimerEl.style.display = 'none';
    aTimerEl.style.display = 'none';
    nextBtn.disabled = false;

    await remove(ref(db, `rooms/${roomId}/buzz`));
    updateBuzzState();
  } else {
    // 誤答処理
    clearTimers();
    await set(ref(db, `rooms/${roomId}/wrongAnswers/${myNick}`), true);
    answerArea.classList.add('hidden');
    answerInput.value = '';
    await remove(ref(db, `rooms/${roomId}/buzz`));
    // 問題タイマーを再開（他の人の早押し待ち状態に戻す）
    if (flowStarted) {
      window._qInt = setInterval(tickQ, 100);
    }
  }
});

// 次へ
nextBtn.addEventListener('click',async()=>{
  if(nextBtn.disabled) return;
  clearTimers();
  questionEl.textContent=''; questionEl.style.visibility='hidden';
  statusEl.textContent=''; qTimerEl.style.display='none'; aTimerEl.style.display='none';
  questionLabelEl.style.visibility='hidden';
  if(idx+1<sequence.length){
    await set(ref(db,`rooms/${roomId}/currentIndex`),idx+1);
    await set(ref(db,`rooms/${roomId}/settings/preStart`),getServerTime());
  } else {
    showResults();
  }
});

// 結果表示
async function showResults(){
  quizAppDiv.classList.add('hidden');
  resultsDiv.classList.remove('hidden');
  allowUnload = true;

  const ps = await get(ref(db,`rooms/${roomId}/players`));
  const sc = await get(ref(db,`rooms/${roomId}/scores`));
  players = ps.val() || {};
  scores = sc.val() || {};

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
    html += `<div><h4>第${i+1}問： ${q.question}</h4><p>正解： ${q.answer}</p><ul>`;
    const win = allEvents.filter(e => e.questionIndex === i && e.correct).map(e => e.nick);
    html += `<li>${TEXT.labels.correctLabel}${win.length ? win.join('、') : 'なし'}</li>`;
    const los = allEvents.filter(e => e.questionIndex === i && !e.correct);
    los.forEach(e => {
      html += `<li>${TEXT.labels.incorrectLabel}${e.nick}（${e.guess || '時間切れ'}）</li>`;
    });
    html += `</ul></div>`;
  });
  html += `<button id="backBtn" class="btn-primary">${TEXT.labels.returnHome}</button>`;

  resultsDiv.innerHTML = html;
  document.getElementById('backBtn').addEventListener('click', () => {
    allowUnload = true;
    location.reload();
  });
}

// 離脱後削除
window.addEventListener('unload',()=>{ remove(ref(db,`rooms/${roomId}/players/${myNick}`)); });
