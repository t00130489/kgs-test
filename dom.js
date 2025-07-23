// dom.js

// DOM取得
export const createBtn   = document.getElementById('createBtn');
export const joinRoomBtn = document.getElementById('joinRoomBtn');
export const roomIdInput = document.getElementById('roomIdInput');
export const homeDiv     = document.getElementById('home');
export const quizAppDiv  = document.getElementById('quiz-app');
export const resultsDiv  = document.getElementById('results');
export const currentRoom = document.getElementById('currentRoomId');
export const chapterCbs  = document.querySelectorAll('#chapter-selection input[type=checkbox][value]');
export const gradCb      = document.getElementById('grad-range');
export const allCb       = document.getElementById('all-range');
export const roomCount   = document.getElementById('room-count');
export const roomRange   = document.getElementById('room-range');
export const currentNum  = document.getElementById('currentNum');
export const totalNum    = document.getElementById('totalNum');
export const playersUl   = document.getElementById('players');
export const statusEl    = document.getElementById('status');
export const preCd       = document.getElementById('pre-countdown');
export const questionEl  = document.getElementById('question');
export const qTimerEl    = document.getElementById('question-timer');
export const buzzBtn     = document.getElementById('buzzBtn');
export const answerArea  = document.getElementById('answer-area');
export const answerInput = document.getElementById('answerInput');
export const answerBtn   = document.getElementById('answerBtn');
export const aTimerEl    = document.getElementById('answer-timer');
export const nextBtn     = document.getElementById('nextBtn');
export const startBtn    = document.getElementById('startBtn');

// 「第〇問」ラベル
export const questionLabelEl = document.createElement('div');
questionLabelEl.id = 'questionLabel';
questionLabelEl.className = 'question-label';
questionLabelEl.style.visibility = 'hidden';
quizAppDiv.insertBefore(questionLabelEl, preCd);

// フィードバックオーバーレイ取得
export const feedbackOverlay = document.getElementById('feedback-overlay');
