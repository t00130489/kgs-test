// ui.js

// ——————————————————————————
// ① DOM 要素まとめて取得
// ——————————————————————————
export const elements = {
  createBtn:    document.getElementById('createBtn'),
  joinRoomBtn:  document.getElementById('joinRoomBtn'),
  roomIdInput:  document.getElementById('roomIdInput'),
  homeDiv:      document.getElementById('home'),
  quizAppDiv:   document.getElementById('quiz-app'),
  resultsDiv:   document.getElementById('results'),
  currentRoom:  document.getElementById('currentRoomId'),
  chapterCbs:   document.querySelectorAll('#chapter-selection input[type=checkbox][value]'),
  gradCb:       document.getElementById('grad-range'),
  allCb:        document.getElementById('all-range'),
  roomCount:    document.getElementById('room-count'),
  roomRange:    document.getElementById('room-range'),
  currentNum:   document.getElementById('currentNum'),
  totalNum:     document.getElementById('totalNum'),
  playersUl:    document.getElementById('players'),
  statusEl:     document.getElementById('status'),
  preCd:        document.getElementById('pre-countdown'),
  questionLabelEl: document.getElementById('question-label'),
  questionEl:   document.getElementById('question'),
  qTimerEl:     document.getElementById('question-timer'),
  buzzBtn:      document.getElementById('buzzBtn'),
  answerArea:   document.getElementById('answer-area'),
  answerInput:  document.getElementById('answerInput'),
  answerBtn:    document.getElementById('answerBtn'),
  aTimerEl:     document.getElementById('answer-timer'),
  nextBtn:      document.getElementById('nextBtn'),
  startBtn:     document.getElementById('startBtn'),
  feedbackOverlay: document.getElementById('feedback-overlay')
};

// ——————————————————————————
// ② 初期 UI 設定
// ——————————————————————————
export function setInitialUI() {
  const e = elements;
  e.createBtn.disabled = true;
  e.answerArea.classList.add('hidden');
  e.answerBtn.disabled  = true;
  e.buzzBtn.disabled    = true; e.buzzBtn.classList.add('disabled-btn');
  e.startBtn.style.display = 'none';
  e.qTimerEl.style.display = 'none';
  e.aTimerEl.style.display = 'none';
  e.feedbackOverlay.classList.add('hidden');
}

// ——————————————————————————
// ③ ルーム作成ボタンの有効/無効
// ——————————————————————————
export function updateCreateBtn(quizData) {
  const hasData    = Boolean(quizData.length);
  const hasChapter = [...elements.chapterCbs].some(cb=>cb.checked);
  elements.createBtn.disabled = !(hasData && hasChapter);
}

// ——————————————————————————
// ④ 早押しボタンの有効/無効
// ——————————————————————————
export function updateBuzzState(canBuzz) {
  const btn = elements.buzzBtn;
  btn.disabled = !canBuzz;
  btn.classList.toggle('disabled-btn', !canBuzz);
}

// ——————————————————————————
// ⑤ フィードバック表示（〇×オーバーレイ）
// ——————————————————————————
export function showFeedback(isCorrect) {
  const over = elements.feedbackOverlay;
  over.textContent = isCorrect ? '〇' : '×';
  over.classList.remove('hidden','correct','wrong');
  over.classList.add(isCorrect ? 'correct':'wrong');
  setTimeout(()=> over.classList.add('hidden'), 800);
}

// ——————————————————————————
// ⑥ プレイヤーリスト更新
// ——————————————————————————
export function renderPlayers(players, scores) {
  const ul = elements.playersUl;
  ul.innerHTML = '';
  Object.keys(players).forEach(nick => {
    const li = document.createElement('li');
    li.textContent = `${nick} (${scores[nick]||0}問正解)`;
    ul.appendChild(li);
  });
}

// ——————————————————————————
// ⑦ ルーム設定表示（範囲・問題数）
// ——————————————————————————
export function renderSettings(settings) {
  const names = ["序章","第一章","第二章","第三章","第四章","第五章","第六章","第七章"];
  elements.roomRange.textContent = settings.chapters.map(c=>names[c]).join('、');
  elements.totalNum.textContent = settings.count;
}

// ——————————————————————————
// ⑧ 問題ヘッダー更新（第〇問・次ボタンラベル）
// ——————————————————————————
export function renderQuestionHeader(idx, total, labels) {
  elements.questionLabelEl.textContent = `${labels.questionLabelPrefix}${idx+1}${labels.questionLabelSuffix}`;
  elements.currentNum.textContent = idx+1;
  elements.nextBtn.textContent = idx+1>=total
    ? labels.finalResult
    : labels.nextQuestion;
}

// ——————————————————————————
// ⑨ 結果画面描画
// ——————————————————————————
export function renderResults(winners, scores, sequence, events, TEXT) {
  const e = elements;
  let html = `<h2>${TEXT.labels.resultsTitle}</h2>`;
  if (winners.length) {
    html += `<h3 class="champion-announcement">
               🏆 優勝者：${winners.join('、')}（${scores[winners[0]]}問正解）
             </h3>`;
  } else {
    html += `<h3 class="champion-announcement">🏆 優勝者なし</h3>`;
  }
  html += `<h3>${TEXT.labels.participantsHeader}</h3><ul>`;
  Object.keys(scores).forEach(nick=>{
    const cls = winners.includes(nick)?' class="winner"':'';
    html += `<li${cls}>${nick}：${scores[nick]||0}問正解</li>`;
  });
  html += `</ul><h3>${TEXT.labels.perQuestionHeader}</h3>`;
  sequence.forEach((q,i)=>{
    html += `<div><h4>第${i+1}問： ${q.question}</h4>
               <p>正解： ${q.answer}</p><ul>`;
    const win = events.filter(e=>e.questionIndex===i&&e.correct).map(e=>e.nick);
    html += `<li>${TEXT.labels.correctLabel}${win.length?win.join('、'):'なし'}</li>`;
    events.filter(e=>e.questionIndex===i&&!e.correct).forEach(ev=>{
      html += `<li>${TEXT.labels.incorrectLabel}${ev.nick}（${ev.guess||'時間切れ'}）</li>`;
    });
    html += `</ul></div>`;
  });
  html += `<button id="backBtn" class="btn-primary">${TEXT.labels.returnHome}</button>`;
  e.resultsDiv.innerHTML = html;
  document.getElementById('backBtn')
          .addEventListener('click', ()=> location.reload());
}
