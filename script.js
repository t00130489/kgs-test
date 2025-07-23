// script.js
import * as ui from './ui.js';
import * as timer from './timer.js';
import {
  db,
  getServerTime,
  genId,
  createRoom,
  joinRoomInDB,
  pushEventInDB,
  removeBuzz
} from './firebase.js';
import {
  ref,
  onValue,
  onChildAdded,
  get,
  child,
  set
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-database.js";

// 定数
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
    leaveConfirm: 'ゲームから離脱します。よろしいですか？',
    questionLabelPrefix: '第',
    questionLabelSuffix: '問'
  }
};

// 離脱確認
let allowUnload = false;
window.onbeforeunload = e => {
  if (!allowUnload) e.returnValue = TEXT.labels.leaveConfirm;
};

// 状態変数
let quizData = [];
let sequence = [];
let idx = 0;
let myNick = '';
let roomId = '';
let joinTs = 0;
let players = {};
let scores = {};
let wrongs = {};
let flowStarted = false;
let answered = false;
const allEvents = [];

// 初期UI
ui.setInitialUI();

// 範囲チェックハンドラ
ui.elements.gradCb.addEventListener('change', () => {
  ui.elements.chapterCbs.forEach(cb => {
    if (['0','1','4','7'].includes(cb.value)) cb.checked = ui.elements.gradCb.checked;
  });
  ui.updateCreateBtn(quizData);
});
ui.elements.allCb.addEventListener('change', () => {
  ui.elements.chapterCbs.forEach(cb => cb.checked = ui.elements.allCb.checked);
  ui.updateCreateBtn(quizData);
});
ui.elements.chapterCbs.forEach(cb =>
  cb.addEventListener('change', () => ui.updateCreateBtn(quizData))
);

// 問題データ取得
onValue(ref(db, 'questions'), snap => {
  quizData = Object.values(snap.val() || {}).filter(x => x);
  ui.updateCreateBtn(quizData);
});

// 共通関数
function updateBuzzState() {
  const can = flowStarted && !answered && !wrongs[myNick];
  ui.updateBuzzState(can);
}
function clearAllTimers() {
  timer.clearTimers();
}
function onQuestionTimeout() {
  clearAllTimers();
  answered = true;
  flowStarted = false;
  ui.elements.questionEl.textContent = sequence[idx].question;
  ui.elements.statusEl.textContent = TEXT.labels.statusTimeUp + sequence[idx].answer;
  updateBuzzState();
  ui.elements.answerArea.classList.add('hidden');
  ui.elements.qTimerEl.style.display = 'none';
  ui.elements.aTimerEl.style.display = 'none';
  ui.elements.nextBtn.disabled = false;
  removeBuzz(roomId);
}

// ルーム作成
ui.elements.createBtn.addEventListener('click', async () => {
  if (!quizData.length) { alert('読み込み中…'); return; }
  const chs = [...ui.elements.chapterCbs].filter(cb => cb.checked).map(cb => +cb.value);
  const cnt = parseInt(ui.elements.roomCount.value, 10);
  if (!chs.length || cnt < 1) { alert('範囲と数を指定'); return; }
  const nick = prompt('ニックネーム（ルームホスト）'); if (!nick) return;
  myNick = nick;
  joinTs = getServerTime();
  roomId = await genId();
  sequence = quizData
    .filter(q => chs.includes(+q.chapter))
    .sort(() => Math.random() - 0.5)
    .slice(0, cnt);
  await createRoom(roomId, chs, cnt, sequence, myNick, joinTs);
  ui.elements.homeDiv.classList.add('hidden');
  ui.elements.quizAppDiv.classList.remove('hidden');
  ui.elements.currentRoom.textContent = roomId;
  ui.elements.startBtn.style.display = 'block';
  startAllWatchers();
});

// ルーム参加
ui.elements.joinRoomBtn.addEventListener('click', async () => {
  const inputId = ui.elements.roomIdInput.value.trim();
  if (!inputId) { alert('ルームIDを入力してください'); return; }
  const snap = await get(child(ref(db, 'rooms'), inputId));
  if (!snap.exists()) { alert('ルームが存在しません'); return; }
  const nick = prompt('ニックネーム'); if (!nick) return;
  myNick = nick;
  joinTs = getServerTime();
  roomId = inputId;
  await joinRoomInDB(roomId, myNick, joinTs);
  ui.elements.homeDiv.classList.add('hidden');
  ui.elements.quizAppDiv.classList.remove('hidden');
  ui.elements.currentRoom.textContent = roomId;
  startAllWatchers();
});

// ゲーム開始（プリカウント設定）
ui.elements.startBtn.addEventListener('click', async () => {
  const now = getServerTime();
  await set(ref(db, `rooms/${roomId}/settings/preStart`), now);
});

// 各種ウォッチャー起動
function startAllWatchers() {
  // プレイヤー＆スコア
  onValue(ref(db, `rooms/${roomId}/players`), snap => {
    players = snap.val() || {};
    ui.renderPlayers(players, scores);
  });
  onValue(ref(db, `rooms/${roomId}/scores`), snap => {
    scores = snap.val() || {};
    ui.renderPlayers(players, scores);
  });
  // 誤答
  onValue(ref(db, `rooms/${roomId}/wrongAnswers`), snap => {
    wrongs = snap.val() || {};
    const total = Object.keys(players).length;
    if (!answered && Object.keys(wrongs).length >= total) {
      clearAllTimers();
      answered = true;
      flowStarted = false;
      ui.elements.questionEl.textContent = sequence[idx].question;
      ui.elements.statusEl.textContent = TEXT.labels.statusAllWrong + sequence[idx].answer;
      ui.elements.qTimerEl.style.display = 'none';
      ui.elements.aTimerEl.style.display = 'none';
      ui.elements.answerArea.classList.add('hidden');
      ui.elements.nextBtn.disabled = false;
      removeBuzz(roomId);
    }
    updateBuzzState();
  });
  // 設定表示
  onValue(ref(db, `rooms/${roomId}/settings`), snap => {
    const s = snap.val() || {};
    ui.renderSettings(s);
  });
  // 問題シーケンス
  onValue(ref(db, `rooms/${roomId}/sequence`), snap => {
    sequence = Object.values(snap.val() || {}).filter(x => x);
  });
  // インデックス
  onValue(ref(db, `rooms/${roomId}/currentIndex`), snap => {
    idx = snap.val() || 0;
    ui.renderQuestionHeader(idx, sequence.length, TEXT.labels);
    ui.elements.nextBtn.disabled = true;
    set(ref(db, `rooms/${roomId}/wrongAnswers`), null);
  });
  // イベント（正解・誤答再開）
  onChildAdded(ref(db, `rooms/${roomId}/events`), snap => {
    const ev = snap.val();
    if (ev.timestamp <= joinTs) return;
    allEvents.push(ev);
    if (ev.correct) {
      clearAllTimers();
      answered = true;
      flowStarted = false;
      ui.elements.questionEl.textContent = sequence[idx].question;
      ui.elements.statusEl.textContent = `${ev.nick} さんが正解！🎉 正解： ${ev.answer}`;
      ui.elements.qTimerEl.style.display = 'none';
      ui.elements.aTimerEl.style.display = 'none';
      ui.elements.nextBtn.disabled = false;
      updateBuzzState();
    } else if (ev.type === 'wrongGuess' || ev.type === 'answerTimeout') {
      clearAllTimers();
      ui.elements.statusEl.textContent = `${ev.nick} さんが不正解（${ev.guess || '時間切れ'}）`;
      flowStarted = true;
      timer.startQuestionTimer(
        ev.timestamp,
        TEXT.questionTimeLimit,
        rem => ui.elements.qTimerEl.textContent = TEXT.labels.timeoutLabel + rem + TEXT.labels.secondsSuffix,
        onQuestionTimeout
      );
      updateBuzzState();
    }
  });
  // 早押し監視
  onValue(ref(db, `rooms/${roomId}/buzz`), snap => {
    const b = snap.val();
    if (b && flowStarted && !answered) {
      flowStarted = false;
      timer.clearTimers();
      timer.pauseTypewriter();
      ui.elements.statusEl.textContent = `${b.nick} さんが押しました`;
      if (b.nick === myNick) {
        ui.elements.answerArea.classList.remove('hidden');
        ui.elements.answerBtn.disabled = false;
        timer.startAnswerTimer(
          TEXT.answerTimeLimit,
          s => ui.elements.aTimerEl.textContent = TEXT.labels.timeoutLabel + s + TEXT.labels.secondsSuffix,
          async () => {
            await pushEventInDB(roomId, {
              nick: myNick,
              correct: false,
              guess: '時間切れ',
              answer: sequence[idx].answer,
              type: 'answerTimeout',
              questionIndex: idx,
              timestamp: getServerTime()
            });
            await set(ref(db, `rooms/${roomId}/wrongAnswers/${myNick}`), true);
            ui.elements.answerArea.classList.add('hidden');
            removeBuzz(roomId);
          }
        );
      }
      updateBuzzState();
    } else if (!b && flowStarted && !answered) {
      ui.elements.statusEl.textContent = '';
      ui.elements.answerArea.classList.add('hidden');
      ui.elements.answerInput.value = '';
      ui.elements.answerBtn.disabled = true;
      updateBuzzState();
    }
  });
  // プリカウント
  onValue(ref(db, `rooms/${roomId}/settings/preStart`), snap => {
    const ts = snap.val();
    if (ts) {
      ui.elements.startBtn.style.display = 'none';
      timer.startPreCountdown(
        ts,
        TEXT.preCountdownSec,
        rem => ui.elements.preCd.textContent = rem,
        () => {
          ui.elements.questionEl.style.visibility = 'visible';
          timer.startTypewriter(ui.elements.questionEl, sequence[idx].question, TEXT.typeSpeed);
          flowStarted = true;
          timer.startQuestionTimer(
            getServerTime(),
            TEXT.questionTimeLimit,
            rem2 => ui.elements.qTimerEl.textContent = TEXT.labels.timeoutLabel + rem2 + TEXT.labels.secondsSuffix,
            onQuestionTimeout
          );
        }
      );
    }
  });
}

// 早押し送信
ui.elements.buzzBtn.addEventListener('click', () => {
  if (!(flowStarted && !answered && !wrongs[myNick])) return;
  timer.clearTimers();
  timer.pauseTypewriter();
  set(ref(db, `rooms/${roomId}/buzz`), { nick: myNick, time: getServerTime() });
});

// 解答送信
ui.elements.answerBtn.addEventListener('click', async () => {
  ui.elements.answerBtn.disabled = true;
  const guess = ui.elements.answerInput.value.trim();
  if (!guess) { alert('回答を入力して'); ui.elements.answerBtn.disabled = false; return; }
  const corr = sequence[idx].answer.trim();
  const isCorrect = (guess === corr);
  ui.showFeedback(isCorrect);
  const ev = {
    nick: myNick,
    correct: isCorrect,
    guess,
    answer: corr,
    questionIndex: idx,
    timestamp: getServerTime()
  };
  if (!isCorrect) ev.type = 'wrongGuess';
  await pushEventInDB(roomId, ev);
  if (isCorrect) {
    const sr = ref(db, `rooms/${roomId}/scores/${myNick}`);
    const snap = await get(sr);
    const prev = snap.exists() ? snap.val() : 0;
    await set(sr, prev + 1);
    clearAllTimers();
    answered = true;
    flowStarted = false;
    ui.elements.questionEl.textContent = sequence[idx].question;
    ui.elements.statusEl.textContent = `${myNick} さんが正解！🎉 正解： ${corr}`;
    updateBuzzState();
    ui.elements.answerArea.classList.add('hidden');
    ui.elements.nextBtn.disabled = false;
    removeBuzz(roomId);
  } else {
    clearAllTimers();
    await set(ref(db, `rooms/${roomId}/wrongAnswers/${myNick}`), true);
    ui.elements.answerArea.classList.add('hidden');
    ui.elements.answerInput.value = '';
    removeBuzz(roomId);
  }
});

// 次の問題へ
ui.elements.nextBtn.addEventListener('click', async () => {
  if (ui.elements.nextBtn.disabled) return;
  clearAllTimers();
  ui.elements.questionEl.textContent = '';
  ui.elements.questionEl.style.visibility = 'hidden';
  ui.elements.statusEl.textContent = '';
  ui.elements.qTimerEl.style.display = 'none';
  ui.elements.aTimerEl.style.display = 'none';
  ui.elements.questionLabelEl.style.visibility = 'hidden';
  if (idx + 1 < sequence.length) {
    await set(ref(db, `rooms/${roomId}/currentIndex`), idx + 1);
    await set(ref(db, `rooms/${roomId}/settings/preStart`), getServerTime());
  } else {
    showResults();
  }
});

// 結果表示
async function showResults() {
  ui.elements.quizAppDiv.classList.add('hidden');
  ui.elements.resultsDiv.classList.remove('hidden');
  allowUnload = true;
  const ps = await get(ref(db, `rooms/${roomId}/players`));
  const sc = await get(ref(db, `rooms/${roomId}/scores`));
  players = ps.val() || {};
  scores = sc.val() || {};
  const scoreVals = Object.values(scores).map(v => v || 0);
  const maxScore = scoreVals.length ? Math.max(...scoreVals) : 0;
  const winners = maxScore > 0
    ? Object.keys(scores).filter(n => scores[n] === maxScore)
    : [];
  ui.renderResults(winners, scores, sequence, allEvents, TEXT);
}

// 退出時にプレイヤー削除
window.addEventListener('unload', () => {
  set(ref(db, `rooms/${roomId}/players/${myNick}`), null);
});
