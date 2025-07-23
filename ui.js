// ui.js

import { feedbackOverlay } from './dom.js';

// フィードバック表示
export function showFeedback(isCorrect) {
  feedbackOverlay.textContent = isCorrect ? '〇' : '×';
  feedbackOverlay.classList.remove('hidden', 'correct', 'wrong');
  feedbackOverlay.classList.add(isCorrect ? 'correct' : 'wrong');
  setTimeout(() => {
    feedbackOverlay.classList.add('hidden');
  }, 800);
}
