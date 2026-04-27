# ゲームログ機能 - 修正サマリー

## 修正対応内容

### 1. ✅ index.htmlからリンクを削除
- **削除項目**：「📊 ゲームログを見る」ボタン
- **効果**：ユーザー向けのUIからは見えなくなる
- **アクセス方法**：直接URLで `logs.html` にアクセス可能（管理者向け）

### 2. ✅ script.js - ログ記録をバックエンドのみに
- **修正点 1**：ゲーム終了時のログ
  - `localStorage` への保存を削除
  - サーバーへのログ送信のみ（非同期実行）
  - ユーザー体験への影響：**なし**

- **修正点 2**：途中終了時のログ
  - `localStorage` への保存を削除
  - サーバーへのログ送信のみ（非同期実行）
  - ユーザー体験への影響：**なし**

### 3. ✅ firebase.json - 変更なし
- **デプロイ対象**：
  - ✅ `kgs-test.web.app` （target: "newkgstest"）
  - ✅ `kgs-test-68924.web.app` （site: "kgs-test-68924"）
- **動作**：`firebase deploy` で両方のホストに同時にデプロイ可能

## ゲーム機能への影響
- ✅ ゲームの挙動：**変わらない**
- ✅ ゲームUI：**変わらない**
- ✅ 既存の関数：**影響なし**
- ✅ ユーザー体験：**変わらない**

## ログの永続化
- 📊 ゲーム終了時：Firebase Firestore の `gameLogs` コレクションに自動記録
- 📊 途中終了時：Firebase Firestore の `gameLogs` コレクションに自動記録
- 📊 ステータス：`finished` または `incomplete` で区別
- 📊 アクセス方法：`logs.html` に直接アクセス（管理者のみ）

## デプロイ方法
```bash
# 両方のホストに同時デプロイ
firebase deploy

# または、特定のホストのみにデプロイする場合：
firebase deploy --only hosting:newkgstest       # kgs-test.web.app のみ
firebase deploy --only hosting:kgs-test-68924   # kgs-test-68924.web.app のみ
```

## ログページへのアクセス
- **kgs-test.web.app**：`https://kgs-test.web.app/logs.html`
- **kgs-test-68924.web.app**：`https://kgs-test-68924.web.app/logs.html`

