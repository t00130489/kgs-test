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
// モード選択スイッチ取得（未チェック=入力, チェック=選択）
const modeSwitch = document.getElementById('mode-switch');
if (modeSwitch) {
  // 既定は入力（未チェック）。ARIAの状態同期
  modeSwitch.checked = false;
  modeSwitch.setAttribute('aria-checked', String(modeSwitch.checked));
  modeSwitch.addEventListener('change', () => {
    modeSwitch.setAttribute('aria-checked', String(modeSwitch.checked));
  });
}


// バリデーション用エラー表示

function showInputError(input, message) {
  input.setCustomValidity(message);
  input.reportValidity();
}

// 出題問題数バリデーション

roomCountInput.addEventListener('input', () => {
  const val = roomCountInput.value;
  const n = Number(val);
  if (!val.match(/^[0-9]{1,3}$/) || !Number.isFinite(n) || n < 1 || n > 999) {
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
  if (val.match(/^[0-9]{4}$/)) {
    showInputError(roomIdInput, '');
    joinRoomBtn.disabled = false;
    roomIdInput.classList.add('valid-input');
  } else {
    showInputError(roomIdInput, '4桁の数字のみ入力してください');
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

// --- 軽量トースト ---
const toastContainer = document.createElement('div');
toastContainer.className = 'toast-container';
document.body.appendChild(toastContainer);
function showToast(message, actionLabel, onAction, timeout=3000) {
  const el = document.createElement('div');
  el.className = 'toast';
  const msg = document.createElement('div');
  msg.className = 'toast-msg';
  msg.textContent = message;
  el.appendChild(msg);
  let timer;
  if (actionLabel && onAction) {
    const act = document.createElement('div');
    act.className = 'toast-action';
    act.textContent = actionLabel;
    act.addEventListener('click', () => { try { onAction(); } catch(_){}; close(); });
    el.appendChild(act);
  }
  function close(){
    clearTimeout(timer);
    if (el.parentNode) el.parentNode.removeChild(el);
  }
  toastContainer.appendChild(el);
  if (timeout > 0) timer = setTimeout(close, timeout);
  return close;
}

// --- セッション永続化（再参加用） ---
const SESSION_KEY = 'kgs.session';
function saveSession() {
  try {
    if (!roomId || !myNick) return;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ roomId, myNick }));
  } catch(_) {}
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch(_) {}
}
function loadSession() {
  try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch(_) { return null; }
}

async function tryAutoRejoin() {
  const s = loadSession();
  if (!s || !s.roomId || !s.myNick) return false;
  // すでに入室済みなら何もしない
  if (roomId && myNick) return true;
  // ルームが存在し、ニックネームが未使用なら再参加を案内
  const snap = await get(child(ref(db,'rooms'), s.roomId)).catch(()=>null);
  if (!snap || !snap.exists()) { clearSession(); return false; }
  const [playersSnap, settingsSnap] = await Promise.all([
    get(ref(db,`rooms/${s.roomId}/players`)).catch(()=>null),
    get(ref(db,`rooms/${s.roomId}/settings`)).catch(()=>null)
  ]);
  const playersObj = (playersSnap && playersSnap.val()) || {};
  const playersCount = Object.keys(playersObj).length;
  const finishedAt = settingsSnap && settingsSnap.val() && settingsSnap.val().finishedAt;
  if (playersCount === 0 || finishedAt) {
    // 無人または終了済みは案内を出さず終了
    return false;
  }
  const nameTaken = Object.keys(playersObj).includes(s.myNick);
  if (!nameTaken) {
    showToast(`前回のルーム ${s.roomId} を再開できます`, '再参加', async () => {
      await rejoinWithSession(s);
    }, 7000);
    return true;
  }
  // 同名が残っている（onDisconnect未発火等）場合は案内のみ
  showToast(`ルーム ${s.roomId} に再参加できます（要:別名）`, '参加', () => {
    roomIdInput.value = s.roomId; roomIdInput.dispatchEvent(new Event('input'));
  }, 7000);
  return true;
}

async function rejoinWithSession(s){
  // 参加フローを簡略化して再参加
  roomId = s.roomId; myNick = s.myNick; joinTs = getServerTime();
  showLoading('ルームへ再参加中...');
  try {
    // 再参加可否チェック（無人 or 終了済みは不可）
    const [playersSnap0, settingsSnap0] = await Promise.all([
      get(ref(db,`rooms/${roomId}/players`)),
      get(ref(db,`rooms/${roomId}/settings`))
    ]);
    const playersObj0 = playersSnap0.val() || {};
    const playersCount0 = Object.keys(playersObj0).length;
    const settingsObj0 = settingsSnap0.val() || {};
    if (playersCount0 === 0 || settingsObj0.finishedAt) {
      hideLoading();
      showToast('このルームへは再参加できません（無人または終了済み）', null, null, 3000);
      return;
    }
    const playerRef = ref(db,`rooms/${roomId}/players/${myNick}`);
    await set(playerRef,{joinedAt:joinTs,lastActive:getServerTime()});
    try { onDisconnect(playerRef).remove(); } catch(e) {}
    startHeartbeat();
    homeDiv.classList.add('hidden'); quizAppDiv.classList.remove('hidden');
    currentRoom.textContent=roomId;
    // モード取得
    const settingsSnap = await get(ref(db,`rooms/${roomId}/settings`));
    const settingsObj = settingsSnap.val() || {};
    roomModeValue = settingsObj.mode || 'input';
    // 現在の問題番号を先に取得（観戦UIのラベルに反映）
    try {
      const idxSnap = await get(ref(db,`rooms/${roomId}/currentIndex`));
      const v = idxSnap && idxSnap.val();
      if (typeof v === 'number') idx = v;
    } catch(_) {}
    // preStart 状態に応じてUI分岐
    const preStartSnap = await get(ref(db,`rooms/${roomId}/settings/preStart`));
    const preTs = preStartSnap.val();
    const elapsedFromPre = preTs ? (getServerTime() - preTs) : null;
    if (preTs && elapsedFromPre >= TEXT.preCountdownSec * 1000) {
      spectatorUntilNext = true; preStartSkipTs = preTs; showSpectatorBanner();
      // 観戦UIを即時表示（問題カード＆番号を出し、本文/タイマーは隠す）
      try { questionCardBlock.classList.remove('hidden'); } catch(_) {}
      if (questionLabelEl) {
        questionLabelEl.style.visibility = 'visible';
        questionLabelEl.textContent = `${TEXT.labels.questionLabelPrefix}${idx+1}${TEXT.labels.questionLabelSuffix}`;
      }
      const pre = document.getElementById('pre-countdown'); if (pre) pre.style.display = 'none';
      const q = document.getElementById('question'); if (q) q.style.display = 'none';
      const qt = document.getElementById('question-timer'); if (qt) qt.style.display = 'none';
    } else if (preTs && elapsedFromPre < TEXT.preCountdownSec * 1000) {
      // カウントダウン進行中に復帰/参加
      spectatorUntilNext = false;
      // ホストUIは出さない（すでにカウントダウン中）
      if (startBtn) startBtn.style.display = 'none';
      try { clearInterval(window._preInt); } catch(_) {}
      startPreCountdown(preTs);
    } else {
      // preStart 未設定（出題前の待機中）
      spectatorUntilNext = false;
      if (settingsObj.host === myNick) {
        if (startBtn) startBtn.style.display = 'block';
        if (document.getElementById('wait-caption')) { try { waitCaption.remove(); } catch(_){} }
        let wrap = document.getElementById('host-caption-wrap');
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.id = 'host-caption-wrap';
          wrap.style = 'display:flex; flex-direction:column; align-items:center; width:100%';
          startBtn.parentNode.insertBefore(wrap, startBtn);
        }
        if (!wrap.contains(hostCaption)) wrap.appendChild(hostCaption);
      }
    }
    // 選択モードUI
    if (roomModeValue === 'select') { buzzBtn.style.display = 'none'; choiceArea.classList.add('hidden'); }
    else { buzzBtn.style.display = ''; choiceArea.classList.add('hidden'); }
    // 監視開始
    watchPlayers(); watchScores(); watchWrongs();
    watchSettings(); watchSequence(); watchIndex();
    watchEvents(); watchAwards(); watchBuzz(); watchPreStart();
    showToast('再参加しました', null, null, 2000);
  } catch(e) {
    showToast('再参加に失敗しました', null, null, 2500);
  } finally { hideLoading(); }
}
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
  <button id="nickname-ok" class="btn-primary" style="font-size: 1.1rem; padding: 0.6rem 1.5rem; margin-right: 1.2rem;" disabled>OK</button>
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
    okBtn.disabled = true;
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
      input.removeEventListener('input', onInput);
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
    function onInput() {
      const has = input.value.trim().length > 0;
      okBtn.disabled = !has;
    }
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    input.addEventListener('input', onInput);
  });
}

// 「第〇問」ラベル
const questionLabelEl = document.getElementById('question-label');
const questionCardBlock = document.getElementById('question-card-block');
// questionElは既に上部で宣言済みなので再宣言しない

// フィードバックオーバーレイ取得
const feedbackOverlay = document.getElementById('feedback-overlay');
// Confetti canvas
const confettiCanvas = document.getElementById('confetti-canvas');
let confettiCtx = null;
if (confettiCanvas) {
  const resize = () => {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  };
  resize();
  window.addEventListener('resize', resize);
  confettiCtx = confettiCanvas.getContext('2d');
}

// Sound disabled by request
function playJingle() { /* disabled */ }

// Confetti particle system (very small, single burst)
function burstConfetti({x=window.innerWidth/2, y=window.innerHeight*0.35, count=90}={}) {
  if (!confettiCtx || !confettiCanvas) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#ff5252','#ffb300','#ffd54f','#4dd0e1','#81c784','#ba68c8'];
  const parts = Array.from({length: Math.max(20, Math.min(200, count))}, () => ({
    x, y,
    vx: (Math.random()*2-1) * 6,
    vy: (Math.random()*-1) * (6+Math.random()*6) - 4,
    size: 3 + Math.random()*4,
    rot: Math.random()*Math.PI*2,
    vr: (Math.random()*2-1) * 0.2,
    color: colors[(Math.random()*colors.length)|0],
    life: 700 + Math.random()*500
  }));
  const start = performance.now();
  let last = start;
  const grav = 0.18;
  function frame(t) {
    const dt = t - last; last = t;
    confettiCtx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
    let alive = false;
    for (const p of parts) {
      p.life -= dt;
      if (p.life <= 0) continue;
      alive = true;
      p.vy += grav;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rot);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.size/2, -p.size/2, p.size, p.size);
      confettiCtx.restore();
    }
    if (alive && t - start < 1600) requestAnimationFrame(frame);
    else confettiCtx.clearRect(0,0,confettiCanvas.width, confettiCanvas.height);
  }
  requestAnimationFrame(ts => { last = ts; frame(ts); });
}

// Floating score bubble
function floatScore(text='+1') {
  const el = document.createElement('div');
  el.className = 'float-score';
  // split into styled spans for richer look
  el.innerHTML = `<span class="fs-text">${text}</span><span class="fs-spark">✨</span>`;
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 1100);
}

function celebrateCorrect(options={}) {
  try {
    // subtle card glow
    const card = document.getElementById('question-card-block');
    if (card) {
      card.classList.remove('celebrate-glow');
      // force reflow to restart animation
      void card.offsetWidth;
      card.classList.add('celebrate-glow');
    }
    burstConfetti({ count: options.count || 100 });
    playJingle(options.pitch || 880);
    floatScore(options.scoreText || '+1');
  } catch(_) {}
}

// 簡易ローディングオーバーレイ
let loadingOverlay;
function showLoading(text){
  if (!loadingOverlay) {
    loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.style = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;z-index:2500;color:#fff;font-size:1.2rem;';
    const box = document.createElement('div');
    box.style = 'background:rgba(0,0,0,0.7);padding:1rem 1.5rem;border-radius:10px;min-width:200px;text-align:center;box-shadow:0 4px 18px rgba(0,0,0,0.25)';
    const spinner = document.createElement('div');
    spinner.style = 'width:28px;height:28px;border:3px solid #fff;border-top-color:transparent;border-radius:50%;margin:0 auto 0.6rem;animation:spin 0.8s linear infinite;';
    const label = document.createElement('div');
    label.id = 'loading-label';
    label.textContent = text || '読み込み中...';
    box.appendChild(spinner); box.appendChild(label);
    loadingOverlay.appendChild(box);
    document.body.appendChild(loadingOverlay);
    const style = document.createElement('style');
    style.textContent = '@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
  } else {
    const label = loadingOverlay.querySelector('#loading-label');
    if (label) label.textContent = text || '読み込み中...';
    loadingOverlay.style.display = 'flex';
  }
}
function hideLoading(){ if (loadingOverlay) loadingOverlay.style.display = 'none'; }

// 観戦バナー（カード内）
function showSpectatorBanner() {
  const wrap = document.querySelector('#question-card-block .question-card-center');
  if (!wrap) return;
  let banner = document.getElementById('spectator-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'spectator-banner';
    banner.textContent = '次の問題から参加します...';
    banner.style = 'margin:0.4rem auto; color:#555; font-weight:bold; background:#f5f7fa; border:1px dashed #bbb; border-radius:8px; padding:0.5rem 0.8rem;';
    wrap.appendChild(banner);
  }
}
function hideSpectatorBanner() {
  const b = document.getElementById('spectator-banner');
  if (b && b.parentNode) b.parentNode.removeChild(b);
}

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
let settingsCache = {};
// タイマー表示最適化用（直前表示した残り秒：0.1秒単位の文字列）
let lastDisplayedQTenth = null;
let lastDisplayedQSec = null;
let flowStarted = false, answered = false;
let questionStart = 0, remainingQTime = TEXT.questionTimeLimit;
let nextBtnCountdownTimer = null;
let nextBtnCountdownRemain = 0;
let roomModeValue = 'input';
let handledCorrectFor = new Set();
// 自分がこの問題で誤答（または解答時間切れ）したかどうかのローカルフラグ
// DBの反映前でも自分だけは早押しボタンを再有効化しないために使用
let iAmWrongLocal = false;
// 追加: 早押し中断での残り時間とタイプ同期解除関数
let pausedRemainingQTime = null; // 秒
let detachTypeSync = null; // onValue の unsubscribe
let heartbeatTimer = null; // 接続維持用ハートビート
let unsubs = []; // onValue等の解除関数を保持
// 途中参加者向け観戦モード（現在進行中の問題はスキップし、次の問題から同期）
let spectatorUntilNext = false;
let preStartSkipTs = null; // スキップ対象の preStart タイムスタンプ
// 現在の問題の preStart タイムスタンプ（全員誤答判定で観戦者を除外するために使用）
let currentPreStartTs = null;

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

// タイプを即時に全文表示し、タイプ同期も解除（余計な追記防止）
function revealFullQuestionAndStopSync() {
  try { clearInterval(window._typeInt); } catch (e) {}
  if (typeof detachTypeSync === 'function' && detachTypeSync) {
    try { detachTypeSync(); } catch (e) {}
  }
  detachTypeSync = null;
  currentText = sequence[idx] && sequence[idx].question ? sequence[idx].question : (currentText || '');
  if (typeof currentText !== 'string') currentText = '';
  questionEl.textContent = currentText;
  typePos = currentText.length;
}
function canBuzz(){ return flowStarted && !answered && !wrongs[myNick] && !iAmWrongLocal; }
function updateBuzzState(){
  const disabled = spectatorUntilNext ? true : !canBuzz();
  buzzBtn.disabled = disabled;
  buzzBtn.classList.toggle('disabled-btn', disabled);
}
function updateCreateBtn(){
  const hasChapters = [...chapterCbs].some(cb=>cb.checked);
  const val = roomCountInput.value;
  const n = Number(val);
  const validCount = (/^[0-9]{1,3}$/.test(val) && Number.isFinite(n) && n>=1 && n<=999);
  createBtn.disabled = !(hasChapters && validCount);
}

// 質問タイマー（0.1秒単位表示）
function tickQ(){
  if(!flowStarted) return;
  const now = getServerTime();
  const elapsedSec = (now - questionStart) / 1000;
  const remain = Math.max(0, TEXT.questionTimeLimit - elapsedSec);
  remainingQTime = remain; // float 秒保持
  // 0.1秒単位で切り上げ表示（0.0 になるまで 0.1 単位で減少）
  const remainTenth = Math.ceil(remain * 10) / 10;
  const disp = remainTenth.toFixed(1);
  if (lastDisplayedQTenth !== disp) {
    lastDisplayedQTenth = disp;
    qTimerEl.textContent = TEXT.labels.timeoutLabel + disp + TEXT.labels.secondsSuffix;
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
  revealFullQuestionAndStopSync();
  if (!spectatorUntilNext) {
    qTimerEl.textContent = '正解：' + sequence[idx].answer;
    qTimerEl.classList.add('show-answer');
    qTimerEl.style.display = 'block';
    statusEl.textContent = '時間切れ！';
  } else {
    // 観戦者は表示を抑止
    qTimerEl.textContent = '';
    qTimerEl.classList.remove('show-answer');
    qTimerEl.style.display = 'none';
    setStatus('');
  }
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

// 事前の全件取得は行わず、作成時にCloud Functionsから取得する
updateCreateBtn();

// ウォッチャー
function renderPlayers(){
  playersUl.innerHTML='';
  const names = Object.keys(players);
  names.forEach(nick=>{
    const li = document.createElement('li');
    li.textContent = `${nick} (${(scores && scores[nick])||0}問正解)`;
    playersUl.appendChild(li);
  });
}
function watchPlayers(){
  const off = onValue(ref(db,`rooms/${roomId}/players`), snap=>{
    players = snap.val()||{};
    renderPlayers();
    // 自分のエントリが消えていたら再参加導線を提示
    if (myNick && (!players || !players[myNick])) {
      const s = loadSession();
      if (s && s.roomId === roomId && s.myNick === myNick) {
        showToast('接続が切断されました', '再参加', () => {
          rejoinWithSession(s);
        }, 6000);
      }
    }
  });
  unsubs.push(off);
}
function watchScores(){
  const off = onValue(ref(db,`rooms/${roomId}/scores`), snap=>{
    scores = snap.val()||{};
    renderPlayers();
  });
  unsubs.push(off);
}
function watchWrongs(){
  const off = onValue(ref(db,`rooms/${roomId}/wrongAnswers`), snap=>{
    wrongs = snap.val()||{};
  // 観戦モード中はUI更新を行わない（解答表示・ステータス非表示）
  if (spectatorUntilNext) { updateBuzzState(); return; }
    // 観戦者除外: 現在の問題開始時点（currentPreStartTs）以前に参加したプレイヤーのみを対象
    let totalActive;
    if (currentPreStartTs && typeof currentPreStartTs === 'number') {
      totalActive = Object.values(players).filter(p => p && typeof p.joinedAt === 'number' && p.joinedAt <= currentPreStartTs).length;
    } else {
      totalActive = Object.keys(players).length;
    }
    if(!answered && Object.keys(wrongs).length >= totalActive && totalActive > 0){
      clearTimers(); answered = true; flowStarted = false;
      revealFullQuestionAndStopSync();
      if (!spectatorUntilNext) {
        qTimerEl.textContent = '正解：' + sequence[idx].answer;
        qTimerEl.classList.add('show-answer');
        qTimerEl.style.display = 'block';
        statusEl.textContent = '全員誤答…';
        // 選択モード時は時間切れと同様に正解を赤、その他を無効化
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
      } else {
        qTimerEl.textContent = '';
        qTimerEl.classList.remove('show-answer');
        qTimerEl.style.display = 'none';
        setStatus('');
      }
      aTimerEl.style.display = 'none';
      answerArea.classList.add('hidden'); buzzBtn.disabled = true;
      nextBtn.disabled = false; remove(ref(db,`rooms/${roomId}/buzz`));
      startNextBtnCountdown();
    }
    updateBuzzState();
  });
  unsubs.push(off);
}
function watchSettings(){
  const off = onValue(ref(db,`rooms/${roomId}/settings`), snap=>{
    const s = snap.val()||{};
    settingsCache = s;
    roomRange.textContent = (s.chapters||[]).map(c=>["序章","第一章","第二章","第三章","第四章","第五章","第六章","第七章"][c]).join('、');
    totalNum.textContent = s.count||0;
    // モード表示
    if (roomMode) {
      roomMode.textContent = s.mode === 'select' ? '選択' : '入力';
    }
  });
  unsubs.push(off);
}
function watchSequence(){
  const off = onValue(ref(db,`rooms/${roomId}/sequence`), snap=>{ sequence = Object.values(snap.val()||{}).filter(x=>x); });
  unsubs.push(off);
}
function watchIndex(){
  const off = onValue(ref(db,`rooms/${roomId}/currentIndex`), snap=>{
    idx = snap.val()||0;
    questionLabelEl.textContent = `${TEXT.labels.questionLabelPrefix}${idx+1}${TEXT.labels.questionLabelSuffix}`;
    nextBtn.textContent = idx+1>=sequence.length?TEXT.labels.finalResult:TEXT.labels.nextQuestion;
    set(ref(db,`rooms/${roomId}/wrongAnswers`),null);
    // ---- フラグ/状態リセット（全クライアントで新問開始時に同期） ----
  answered = false;
  flowStarted = false;
    handledCorrectFor.clear();
  clearTimers();
    // 新しい問題に入ったらローカル誤答フラグを解除
    iAmWrongLocal = false;
    // 選択モードでは即座に旧選択肢を消しておく（カウントダウン中に表示残りを防止）
    if (roomModeValue === 'select') {
      if (choiceArea) {
        Array.from(choiceArea.children).forEach(b=>b.disabled=true);
        choiceArea.classList.add('hidden');
        choiceArea.innerHTML='';
      }
    }
  // （旧問題のタイピング進捗監視解除は clearTimers でtypeInterval解除済）
    // 参加直後のレース対策: preStart カウントダウン中に currentIndex 更新で clearTimers された場合、再度カウントダウンを開始
    // ここで最新の preStart を取得し、未経過なら startPreCountdown を呼び出す
    get(ref(db,`rooms/${roomId}/settings/preStart`)).then(s => {
      const ts = s && s.val();
      if (typeof ts === 'number') {
        const elapsed = getServerTime() - ts;
        if (elapsed < TEXT.preCountdownSec * 1000) {
          startPreCountdown(ts);
        }
      }
    }).catch(()=>{});
  });
  unsubs.push(off);
}
function watchEvents(){
  const off = onChildAdded(ref(db,`rooms/${roomId}/events`), snap=>{
  const ev = snap.val(); if(ev.timestamp <= joinTs) return;
  if (spectatorUntilNext) return; // 観戦モード中は進行・UI更新を行わない
    if(ev.correct){
      // 正解確定は awards を唯一のソースにするため、events.correct ではUI確定しない
      return;
    } else if(ev.type==='wrongGuess' || ev.type==='answerTimeout'){
      // 誤答 / 回答時間切れ: 問題再開。元の questionStart は維持し残り時間補正
      clearTimers();
  let disp = ev.type==='wrongGuess'?ev.guess:'時間切れ';
  if (ev.type==='wrongGuess' && (!disp || disp==='')) disp = '空欄';
  statusEl.textContent = `${ev.nick} さんが不正解（${disp}）`;
      // 自分の誤答/時間切れなら、ローカルでも即時に誤答フラグON（再有効化を防ぐ）
      if (ev.nick === myNick) {
        iAmWrongLocal = true;
      }
      // すでに正解が確定している場合は再開しない（レース回避）
      if (handledCorrectFor.has(ev.questionIndex)) return;
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
  lastDisplayedQSec = null; // 互換のため残すが未使用
  lastDisplayedQTenth = null;
  window._qInt = setInterval(tickQ,100);
  tickQ();
      pausedRemainingQTime = null; // 再開後クリア
  updateBuzzState();
    }
  });
  unsubs.push(off);
}

// 正解確定ウォッチャ（awards/{idx} が書かれたら一着確定としてUI反映）
function watchAwards(){
  const off = onValue(ref(db,`rooms/${roomId}/awards`), snap => {
    const awardsObj = snap.val() || {};
    const aw = awardsObj[idx];
    if (!aw) return;
    if (handledCorrectFor.has(idx)) return;
    handledCorrectFor.add(idx);
    clearTimers(); answered = true; flowStarted = false;
    revealFullQuestionAndStopSync();
    const winner = aw.nick || '誰か';
    statusEl.textContent = `${winner} さんが正解！🎉`;
    const mine = (winner === myNick);
    celebrateCorrect({ count: mine ? 140 : 100, pitch: mine ? 988 : 880, scoreText: mine ? '+1!' : '+1' });
    const ans = sequence[idx] && sequence[idx].answer ? sequence[idx].answer : '';
    if (!spectatorUntilNext) {
  // 正解フィードバック（◯オーバーレイ）を表示
  try { showFeedback(true); } catch(_) {}
      qTimerEl.textContent = '正解：' + ans;
      qTimerEl.classList.add('show-answer');
      qTimerEl.style.display = 'block';
    } else {
      qTimerEl.textContent = '';
      qTimerEl.style.display = 'none';
      setStatus('');
    }
    aTimerEl.style.display = 'none';
    nextBtn.disabled = false; updateBuzzState();
    startNextBtnCountdown();
    // 選択モードなら正解を赤、他を無効化
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
    // 早押し状態は解除
    try { remove(ref(db, `rooms/${roomId}/buzz`)); } catch(_) {}
  });
  unsubs.push(off);
}

function watchBuzz(){
  const off = onValue(ref(db,`rooms/${roomId}/buzz`), snap=>{
    const b = snap.val();
  if (spectatorUntilNext) return; // 観戦モード中はUIを動かさない
    if(b && flowStarted && !answered){
      flowStarted = false; clearInterval(window._qInt); pauseTypewriter();
      statusEl.textContent = `${b.nick} さんが押しました`;
  pausedRemainingQTime = remainingQTime; // 中断時の残り時間を記録 (float 秒)
      if(b.nick===myNick){
        answerArea.classList.remove('hidden'); answerBtn.disabled=false; startAnswerTimer();
        // フォーカスしてIME（日本語キーボード）を確実に起動
        setTimeout(() => {
          try { answerInput.focus(); } catch(_) {}
          if (window.innerWidth <= 600) {
            setTimeout(() => { try { answerInput.scrollIntoView({behavior:'smooth', block:'center'}); } catch(_) {} }, 150);
          }
        }, 0);
      }
      updateBuzzState();
    } else if(!b && flowStarted && !answered){
      // コメントは消さず、他UIのみリセット
      answerArea.classList.add('hidden');
      answerInput.value=''; answerBtn.disabled=true; updateBuzzState();
    }
  });
  unsubs.push(off);
}
function watchPreStart(){
  const off = onValue(ref(db,`rooms/${roomId}/settings/preStart`), snap=>{
    const ts=snap.val(); if(ts){ startBtn.style.display='none'; startPreCountdown(ts); }
  });
  unsubs.push(off);
}

// ルームID生成
async function genId(){
  const roomsRef = ref(db,'rooms');
  let id, exists=true;
  while(exists){
  id = String(1000 + Math.floor(Math.random()*9000));
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
  if (!roomId || !myNick) return;
  const playerRefBase = ref(db,`rooms/${roomId}/players/${myNick}`);
  if(document.visibilityState==='visible'){
    // 復帰時: 最終アクティブを即時更新し、表示のキャッチアップを行う
    // プレイヤーノードが消えていた場合は joinedAt を含めて再参加として復元
    get(playerRefBase).then(async snap => {
      const now = getServerTime();
      if (!snap.exists() || typeof (snap.val()||{}).joinedAt !== 'number') {
        const joined = (typeof joinTs === 'number' && joinTs) ? joinTs : now;
        await set(playerRefBase, { joinedAt: joined, lastActive: now });
        try { onDisconnect(playerRefBase).remove(); } catch(e) {}
      } else {
        await set(ref(db,`rooms/${roomId}/players/${myNick}/lastActive`), now);
      }
    }).catch(()=>{});
  showToast('復帰しました', null, null, 1500);
    // 質問タイマーを元の 100ms に戻し、即時1回更新
    if (flowStarted && !answered) {
      try { clearInterval(window._qInt); } catch(e) {}
      window._qInt = setInterval(tickQ, 100);
      try { tickQ(); } catch(e) {}
    }
    // 非ホストはタイプ同期を1回だけ強制取得して先行反映（リスナーは別途動作）
    const isHost = settingsCache && settingsCache.host && myNick === settingsCache.host;
    if (!isHost && typeof typeSyncRef === 'object' && typeSyncRef) {
      get(typeSyncRef).then(snap => {
        const synced = snap.val() || 0;
        if (typeof currentText === 'string' && synced > (typePos||0)) {
          const from = Math.max(0, questionEl.textContent.length);
          if (from < Math.min(synced, currentText.length)) {
            questionEl.textContent += currentText.slice(from, Math.min(synced, currentText.length));
            typePos = Math.max(typePos||0, Math.min(synced, currentText.length));
          }
        }
      }).catch(()=>{});
    }
  } else {
    // バックグラウンド時: タイマーの更新頻度を軽減
    if (flowStarted && !answered) {
      try { clearInterval(window._qInt); } catch(e) {}
      window._qInt = setInterval(tickQ, 500);
    }
  }
});

// ページロード時に再参加案内を試行
try { setTimeout(() => { tryAutoRejoin(); }, 200); } catch(_) {}

// ルーム作成
createBtn.addEventListener('click',async()=>{
  const chs=[...chapterCbs].filter(cb=>cb.checked).map(cb=>+cb.value);
  const cnt=parseInt(roomCount.value,10);
  // モード取得（スイッチ：未チェック→input、チェック→select）
  const mode = modeSwitch && modeSwitch.checked ? 'select' : 'input';
  roomModeValue = mode; // ここでグローバル変数にもセット
  if(!chs.length||cnt<1){ alert('範囲と数を指定'); return; }
  const nick = await showNicknameModal();
  if(!nick) return;
  myNick=nick; joinTs=getServerTime(); roomId=await genId();
  showLoading('ルームを作成中...');
  createBtn.disabled = true;
  try {
    await set(ref(db,`rooms/${roomId}/settings`),{chapters:chs,count:cnt,mode:mode,createdAt:getServerTime(),host:nick});
    // Cloud Functionsでシーケンス生成（章フィルタ＋件数＋選択モード）
    try {
      const resp = await fetch(`https://us-central1-kgs-test-68924.cloudfunctions.net/generateSequence`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ chapters: chs, count: cnt, mode })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data && data.error || 'generateSequence failed');
      sequence = Array.isArray(data.sequence) ? data.sequence : [];
    } catch(e) {
      // フォールバック: RTDBから生成
      const snap = await get(ref(db,'questions'));
      const all = Object.values(snap.val()||{}).filter(Boolean);
      const pool = all.filter(q=>chs.includes(+q.chapter));
      for(let i=pool.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [pool[i],pool[j]]=[pool[j],pool[i]];
      }
      if (mode === 'select') {
        pool.forEach(q => {
          let order = [0,1,2,3,4];
          for (let i = order.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [order[i], order[j]] = [order[j], order[i]];
          }
          q.choicesOrder = order;
        });
      }
      sequence = pool.slice(0,cnt);
    }
    await set(ref(db,`rooms/${roomId}/sequence`),sequence);
    await set(ref(db,`rooms/${roomId}/currentIndex`),0);
    const playerRef = ref(db,`rooms/${roomId}/players/${myNick}`);
    await set(playerRef,{joinedAt:joinTs,lastActive:getServerTime()});
    // scores はサーバのみが更新（UI側では未定義を0扱い）
    try { onDisconnect(playerRef).remove(); } catch(e) {}
    startHeartbeat();
    homeDiv.classList.add('hidden'); quizAppDiv.classList.remove('hidden');
    currentRoom.textContent=roomId; startBtn.style.display='block';
  saveSession();
  showToast(`ルーム ${roomId} を作成しました`, null, null, 2000);
  } catch(err) {
    alert('ルーム作成に失敗しました。時間をおいて再度お試しください。');
    return;
  } finally {
    hideLoading();
    createBtn.disabled = false;
  }
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
  watchEvents(); watchAwards(); watchBuzz(); watchPreStart();
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
  // 参加可否: 無人 or 終了済みは参加不可
  const playersSnap0 = await get(ref(db,`rooms/${roomId}/players`));
  const playersObj0 = playersSnap0.val() || {};
  const playersCount0 = Object.keys(playersObj0).length;
  if (playersCount0 === 0 || settingsObj.finishedAt) {
    alert('このルームには参加できません（無人または終了済み）');
    return;
  }
  roomModeValue = settingsObj.mode || 'input';
  const nick = await showNicknameModal();
  if(!nick) return;
  // ここから参加処理はローディングを表示
  showLoading('ルームへ参加中...');
  joinRoomBtn.disabled = true;
  try {
  // 途中参加判定: preStart の状態に応じてUI分岐
    const preStartSnap = await get(ref(db,`rooms/${roomId}/settings/preStart`));
    const preTs = preStartSnap.val();
  const elapsedFromPre = preTs ? (getServerTime() - preTs) : null;
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
    // scores はサーバのみが更新
    try { onDisconnect(playerRef).remove(); } catch(e) {}
    startHeartbeat();
    homeDiv.classList.add('hidden'); quizAppDiv.classList.remove('hidden');
    currentRoom.textContent=roomId;
    // 現在の問題番号を先に取得（観戦UIのラベルに反映）
    try {
      const idxSnap = await get(ref(db,`rooms/${roomId}/currentIndex`));
      const v = idxSnap && idxSnap.val();
      if (typeof v === 'number') idx = v;
    } catch(_) {}
    // 途中参加UI: 状態に応じて
    if (preTs && elapsedFromPre >= TEXT.preCountdownSec * 1000) {
      spectatorUntilNext = true;
      preStartSkipTs = preTs;
      // カード内に観戦バナーを表示
      showSpectatorBanner();
      // 観戦UIを即時表示（問題カード＆番号を出し、本文/タイマーは隠す）
      try { questionCardBlock.classList.remove('hidden'); } catch(_) {}
      if (questionLabelEl) {
        questionLabelEl.style.visibility = 'visible';
        questionLabelEl.textContent = `${TEXT.labels.questionLabelPrefix}${idx+1}${TEXT.labels.questionLabelSuffix}`;
      }
      const pre = document.getElementById('pre-countdown'); if (pre) pre.style.display = 'none';
      const q = document.getElementById('question'); if (q) q.style.display = 'none';
      const qt = document.getElementById('question-timer'); if (qt) qt.style.display = 'none';
    } else if (preTs && elapsedFromPre < TEXT.preCountdownSec * 1000) {
      // カウントダウン進行中に参加（観戦ではない）
      spectatorUntilNext = false;
      if (startBtn) startBtn.style.display = 'none';
      try { clearInterval(window._preInt); } catch(_) {}
      startPreCountdown(preTs);
    }
  // ホストが参加で、まだ出題前（preStartなし）のみ開始ボタンを出す（カウントダウン中は出さない）
  if (settingsObj.host === nick && !preTs) {
      spectatorUntilNext = false;
      if (startBtn) startBtn.style.display = 'block';
      // 待機キャプションをホスト用に差し替え
      if (document.getElementById('wait-caption')) { try { waitCaption.remove(); } catch(_){} }
      let wrap = document.getElementById('host-caption-wrap');
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'host-caption-wrap';
        wrap.style = 'display:flex; flex-direction:column; align-items:center; width:100%';
        startBtn.parentNode.insertBefore(wrap, startBtn);
      }
      if (!wrap.contains(hostCaption)) wrap.appendChild(hostCaption);
    }
    // 参加者用キャプションは観戦中は出さない（誤解防止）
    if (!spectatorUntilNext) {
      if (!document.getElementById('wait-caption')) {
        buzzBtn.parentNode.insertBefore(waitCaption, buzzBtn);
      }
    } else {
      if (document.getElementById('wait-caption')) { try { waitCaption.remove(); } catch(_){} }
    }
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
  watchEvents(); watchAwards(); watchBuzz(); watchPreStart();
  saveSession();
  showToast(`ルーム ${roomId} に参加しました`, null, null, 2000);
  } catch (err) {
    alert('ルーム参加に失敗しました。時間をおいて再度お試しください。');
    return;
  } finally {
    hideLoading();
    joinRoomBtn.disabled = false;
  }
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
  // 新しい preStart を受信したら、観戦モードを解除（1問だけスキップの想定）
  if (spectatorUntilNext && preStartSkipTs && startTs !== preStartSkipTs) {
    spectatorUntilNext = false;
    preStartSkipTs = null;
    try { hideSpectatorBanner(); } catch(_) {
      const b = document.getElementById('spectator-banner'); if (b) b.remove();
    }
    const preEl = document.getElementById('pre-countdown');
    if (preEl) { preEl.style.display = 'block'; preCd.textContent = ''; }
  }
  // この問題の開始基準時刻を保存
  currentPreStartTs = startTs;
  const elapsedMs = getServerTime() - startTs;
  const remain = TEXT.preCountdownSec - Math.floor(elapsedMs / 1000);

  // すでにカウントダウンが終わっている（=出題中）の場合は、カウントダウンUIを経由せずに即座に問題表示へ遷移
  if (remain <= 0) {
    // 既存の進行を壊さないよう、プリカウントのみに関わるUIだけ触る
    try { clearInterval(window._preInt); } catch(e) {}
    const preEl = document.getElementById('pre-countdown');
    if (preEl) { preEl.style.display = spectatorUntilNext ? 'none' : 'block'; preCd.textContent = ''; }
    // 観戦中でも問題カードは表示し、番号と観戦バナーを出す
    questionCardBlock.classList.remove('hidden');
    if (questionLabelEl) {
      questionLabelEl.style.visibility = 'visible';
      questionLabelEl.textContent = `${TEXT.labels.questionLabelPrefix}${idx+1}${TEXT.labels.questionLabelSuffix}`;
    }
    // 本文とタイマーは非表示のまま
    document.getElementById('question').style.display = 'none';
    document.getElementById('question-timer').style.display = 'none';
    if (spectatorUntilNext) {
      try { showSpectatorBanner(); } catch(_) {}
    }
    questionStart = startTs + TEXT.preCountdownSec * 1000;
    if (!spectatorUntilNext) {
      flowStarted = true;
      showQuestion();
    } else {
      flowStarted = false;
    }
    return;
  }

  // ここからはカウントダウン中の通常ルート
  clearTimers(); flowStarted=false; answered=false; pausedRemainingQTime = null;
  statusEl.textContent=''; answerArea.classList.add('hidden'); answerInput.value='';
  qTimerEl.style.display='none'; aTimerEl.style.display='none'; questionEl.style.visibility='hidden';
  questionCardBlock.classList.remove('hidden');
  questionLabelEl.style.visibility='visible';
  questionLabelEl.textContent = `${TEXT.labels.questionLabelPrefix}${idx+1}${TEXT.labels.questionLabelSuffix}`;
  if (currentNum) currentNum.textContent = idx + 1;
  document.getElementById('pre-countdown').style.display = spectatorUntilNext ? 'none' : 'block';
  if (spectatorUntilNext) preCd.textContent = '';
  document.getElementById('question').style.display = 'none';
  document.getElementById('question-timer').style.display = 'none';
  nextBtn.disabled=true;
  if (roomModeValue === 'select' && choiceArea) {
    Array.from(choiceArea.children).forEach(b=>b.disabled=true);
    choiceArea.classList.add('hidden');
  }
  if (document.getElementById('host-caption')) hostCaption.remove();
  if (document.getElementById('host-caption-wrap')) document.getElementById('host-caption-wrap').remove();
  if (document.getElementById('wait-caption')) waitCaption.remove();

  const tick = () => {
    const r = TEXT.preCountdownSec - Math.floor((getServerTime() - startTs) / 1000);
    if (r > 0) preCd.textContent = r;
    else {
      clearInterval(window._preInt);
      preCd.textContent = '';
      questionStart = startTs + TEXT.preCountdownSec * 1000;
      if (!spectatorUntilNext) {
        flowStarted = true; showQuestion();
      } else {
        flowStarted = false;
      }
    }
  };
  tick();
  window._preInt = setInterval(tick, 200);
}

// タイプ制御
let typePos=0, currentText='';
let typeSyncRef = null;
function showQuestion(){
  if (spectatorUntilNext) {
    // 途中参加者は現在の問題を開始しない
    questionEl.textContent = '';
    qTimerEl.style.display = 'none';
    return;
  }
  // 旧リスナー解除
  if (detachTypeSync) { try { detachTypeSync(); } catch(e) {} detachTypeSync = null; }
  currentText = sequence[idx].question; typePos = 0;
  questionEl.textContent = '';
  questionEl.style.visibility = 'visible';
  questionCardBlock.classList.remove('hidden');
  document.getElementById('pre-countdown').style.display = 'none';
  document.getElementById('question').style.display = 'block';
  const qt = document.getElementById('question-timer');
  // タイマーの表示を初期化（前問の正解表示や残秒が残らないように）
  qt.classList.remove('show-answer');
  qt.textContent = `${TEXT.labels.timeoutLabel}${TEXT.questionTimeLimit}${TEXT.labels.secondsSuffix}`;
  qt.style.display = 'block';
  clearInterval(window._typeInt);
  typeSyncRef = ref(db, `rooms/${roomId}/typePos/${idx}`);
  let lastTypePos = 0;
  // Hostのみタイプ進行を同期送信（hostはsettings.hostで安定判定）
  const isHost = settingsCache && settingsCache.host && myNick === settingsCache.host;
  let lastSentAt = 0;
  window._typeInt = setInterval(() => {
    if (typePos < currentText.length) {
      questionEl.textContent += currentText[typePos++];
      if (isHost && typePos > lastTypePos) {
        // デバウンス: 50ms以上経過か3文字以上進んだら送信
        const now = performance.now();
        if (now - lastSentAt > 50 || typePos - lastTypePos >= 3) {
          set(typeSyncRef, typePos);
          lastTypePos = typePos;
          lastSentAt = now;
        }
      }
    } else {
      clearInterval(window._typeInt);
    }
  }, TEXT.typeSpeed);
  if (!isHost) {
    detachTypeSync = onValue(typeSyncRef, snap => {
      const synced = snap.val() || 0;
      if (synced > typePos && typePos < currentText.length) {
        questionEl.textContent += currentText.slice(typePos, synced);
        typePos = synced;
      }
    });
  }
  // currentNum の更新は startPreCountdown で行う
  clearInterval(window._qInt); qTimerEl.style.display='block';
  questionStart=getServerTime(); remainingQTime=TEXT.questionTimeLimit; pausedRemainingQTime = null;
  lastDisplayedQSec = null; // 互換のため残すが未使用
  lastDisplayedQTenth = null;
  window._qInt=setInterval(tickQ,100); 
  tickQ();
  // --- 選択モード分岐 ---
  if (roomModeValue === 'select') {
  buzzBtn.style.display = spectatorUntilNext ? '' : 'none';
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
  btn.disabled = spectatorUntilNext ? true : false;
      // 選択肢ボタン押下時の処理
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        if (btn.dataset.isAnswer === '1') {
          // 正解ボタン: 一着判定（トランザクション）
          const selectRef = ref(db, `rooms/${roomId}/selectBuzz`);
          btn.disabled = true;
          btn.classList.add('disabled-btn');
          statusEl.textContent = `${myNick} さんが押しました（判定中…）`;
          await runTransaction(selectRef, current => {
            if (current === null) {
              return { nick: myNick, time: getServerTime() };
            }
            return;
          }).then(async result => {
            if (!result.committed) {
              // 先着あり
              get(selectRef).then(snap => {
                const selectData = snap.val();
                const who = selectData && selectData.nick ? selectData.nick : '他のプレイヤー';
                // ここでは正解演出を行わず、awards確定を待つ
                statusEl.textContent = (who === myNick)
                  ? `判定済み…`
                  : `${who} さんが先に押しました…`;
                Array.from(choiceArea.children).forEach(b => b.disabled = true);
              });
            } else {
              // 一着確保: ここでは演出せずawardsを待つ
              statusEl.textContent = `判定中…`;
              Array.from(choiceArea.children).forEach(b => b.disabled = true);
              await push(ref(db, `rooms/${roomId}/events`), {
                nick: myNick,
                correct: true,
                guess: btn.textContent,
                answer: sequence[idx].answer,
                questionIndex: idx,
                timestamp: getServerTime(),
                type: 'selectCorrect'
              });
            }
          });
        } else {
          // 誤答ボタン
          btn.disabled = true;
          btn.classList.add('disabled-btn');
          btn.style.background = '#e0e0e0';
          btn.style.color = '#888';
          showFeedback(false);
          Array.from(choiceArea.children).forEach(b => b.disabled = true);
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
  const isHost = settingsCache && settingsCache.host && myNick === settingsCache.host;
  let lastSentAt = 0;
  window._typeInt = setInterval(() => {
    if (typePos < currentText.length) {
      questionEl.textContent += currentText[typePos++];
      if (isHost && typePos > lastTypePos) {
        const now = performance.now();
        if (now - lastSentAt > 50 || typePos - lastTypePos >= 3) {
          set(typeSyncRef, typePos);
          lastTypePos = typePos;
          lastSentAt = now;
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
  iAmWrongLocal = true; // ローカル即時反映
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
  // ここでは再開しない。他参加者同様、サーバからのwrongGuess/answerTimeoutイベントで再開を待つ
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
  const guess = normalizeJa(answerInput.value);
  // 空欄でも回答可能にし、不正解として処理
  const corr = normalizeJa(sequence[idx].answer);
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
  // 正解はawardsの確定を待ってUI反映（ここでは演出しない）
  try { clearInterval(window._aInt); } catch(_) {}
  aTimerEl.style.display = 'none';
  answerArea.classList.add('hidden');
  // ステータスは控えめに判定中表示
  statusEl.textContent = `${myNick} さんが押しました（判定中…）`;
  // buzzはawards確定時（watchAwards）で解除する
  } else {
    // 誤答処理
  // ローカル即時フラグで一瞬の再有効化を防ぐ
  iAmWrongLocal = true;
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
  lastDisplayedQSec = null; // 互換のため残すが未使用
        clearInterval(window._qInt);
  lastDisplayedQTenth = null;
  window._qInt = setInterval(tickQ,100);
  tickQ();
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
  // ルーム終了印（参加・再参加ブロック用）
  try { await set(ref(db,`rooms/${roomId}/settings/finishedAt`), getServerTime()); } catch(_) {}
  clearSession();
  // リスナー解除 & タイマー停止（リソース解放）
  try { unsubs.forEach(u=>{ if (typeof u === 'function') u(); }); } catch(e) {}
  unsubs = [];
  clearTimers();
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  // 最新プレイヤー/スコア/イベントを取得（途中参加対策でリアルタイム蓄積に依存しない）
  const [ps, sc, evSnap, awSnap] = await Promise.all([
    get(ref(db,`rooms/${roomId}/players`)),
    get(ref(db,`rooms/${roomId}/scores`)),
    get(ref(db,`rooms/${roomId}/events`)),
    get(ref(db,`rooms/${roomId}/awards`))
  ]);
  players = ps.val() || {};
  const eventsObj = evSnap.val() || {};
  const eventsArr = Object.values(eventsObj).filter(Boolean).sort((a,b)=>(a.timestamp||0)-(b.timestamp||0));
  const awardsObj = awSnap.val() || {};
  // 最終結果の正解数は DB の scores を参照
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
    const score = (scores && typeof scores[nick] === 'number') ? scores[nick] : 0;
    const cls = winners.includes(nick) ? ' class="winner"' : '';
    html += `<li${cls}>${nick}：${score}問正解</li>`;
  });
  html += `</ul><h3>${TEXT.labels.perQuestionHeader}</h3>`;
  sequence.forEach((q, i) => {
    html += `<div class="result-question-card"><h4>第${i+1}問： ${q.question}</h4><p>正解： ${q.answer}</p><ul>`;
    const qEvents = eventsArr.filter(e => Number(e.questionIndex) === i);
    const award = awardsObj[i];
    const winner = award && award.nick ? award.nick : null;
    html += `<li>${TEXT.labels.correctLabel}${winner ? winner : 'なし'}</li>`;
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
window.addEventListener('unload',()=>{ 
  try { unsubs.forEach(u=>{ if (typeof u === 'function') u(); }); } catch(e) {}
  unsubs = [];
  clearTimers();
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  // セッションは保持し、onDisconnect側に任せる（OSキル時の自動復帰導線を維持）
});

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

// 日本語の軽い正規化（全角/半角・前後空白・一般記号の除去）
function normalizeJa(s) {
  if (!s) return '';
  let t = (''+s).trim();
  // 全角英数字→半角、全角スペース→半角
  t = t.replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  t = t.replace(/　/g, ' ');
  // 句読点・記号など軽めに除去（必要に応じて拡張）
  t = t.replace(/[\s\u3000]+/g, ' ');
  t = t.replace(/[、。・,\.\-_/\(\)\[\]{}\u3001\u3002\u30fb]/g, '');
  // カタカナはそのまま。ひらがな⇔カタカナ変換は仕様次第。
  return t;
}
