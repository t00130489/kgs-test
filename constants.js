// constants.js

export const TEXT = {
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
