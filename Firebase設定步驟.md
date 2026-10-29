# Firebase 設定步驟（做一次就好）

約 10 分鐘。全部在電腦上用瀏覽器做，用你的 Google 帳號登入。

## 1. 建立專案
1. 打開 https://console.firebase.google.com
2. 按「建立專案」，名稱填 `taxi-calendar`
3. 問要不要啟用 Google Analytics → 關掉，按「建立專案」

## 2. 開啟登入功能
1. 左邊選單「建構」→「Authentication」→「開始使用」
2. 「登入方式」分頁 → 選「電子郵件/密碼」→ 打開第一個開關 →「儲存」
3. 「使用者」分頁 →「新增使用者」→ 填你的 Email 和一組密碼（自己記好，不要跟其他網站一樣）
4. 「設定」分頁 →「授權網域」→「新增網域」→ 填 `mmh4972.github.io`
5. （建議）「設定」分頁 →「使用者動作」→ 取消勾選「啟用建立帳戶」→ 儲存。這樣別人就不能自己註冊帳號

## 3. 建立資料庫
1. 左邊選單「建構」→「Firestore Database」→「建立資料庫」
2. 位置選 `asia-east1 (Taiwan)`
3. 選「以正式版模式啟動」→「建立」
4. 上方「規則」分頁，把框框裡原本的內容全部刪掉，貼上下面這段，再按「發布」：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null
        && request.auth.token.email == 'mmh4972@gmail.com';
    }
  }
}
```

這段的意思是：只有用 mmh4972@gmail.com 登入的人，才能讀寫資料。第 2 步建立使用者時，請用這個 Email。

## 4. 拿到網頁設定
1. 左上角齒輪 →「專案設定」→「一般」分頁，往下拉到「你的應用程式」
2. 按 `</>`（網頁）圖示，暱稱填 `taxi-calendar`，**不要**勾 Firebase Hosting，按「註冊應用程式」
3. 畫面會出現一段 `const firebaseConfig = { ... }`，把整段複製下來貼給 Claude

這段設定不是密碼，放在公開網站上沒關係，資料的保護靠第 3 步的規則。
