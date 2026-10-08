# TOEIC 15分トレーニング

TOEIC L&R 800点を目指す個人用の学習PWA。「今日のセッション」ボタンを押すだけで、単語→Part2形式→ディクテーション→Part5形式が約15分で順番に出題される。完全オフラインで動作する。

画面上部のアイコンから、今日のセッション以外の機能にもアクセスできる。
- 🎧 リスニング練習：Part2形式・Part3/4形式・ディクテーションをそれぞれ単体で練習、聞き流しモード
- 📊 記録：連続学習日数、パート別正答率、苦手な単語・問題の一覧
- ⚙️ 設定：アクセント・速度、ディクテーション入力方式、データのバックアップ

## ローカルで動作確認する

ES Modules を使っているため `file://` では動かない（CORSで止まる）。簡易サーバーで開く。

```bash
cd C:\Projects\English_Language_Learning
python -m http.server 8080
```

ブラウザで `http://localhost:8080/` を開く。スマホから同一Wi-Fi内で確認する場合は `http://<PCのIPアドレス>:8080/` を開く。

初回読み込み後、機内モード（オフライン）にしてもう一度開き、「今日のセッション」が最後まで動くことを確認する。

## GitHub Pagesに公開する手順

ローカルの `git init` とコミットは済んでいる（リポジトリ名 `toeic-training` / Private を想定）。

1. https://github.com/new を開き、リポジトリ名を `toeic-training`、公開範囲を **Private** にして「Create repository」を押す（README等の初期ファイルは追加しない）。
   - 注意: Privateリポジトリでも、GitHub Pagesとして公開したURL自体は誰でもアクセスできる（URLを知っている人には見える）。アカウント範囲での非公開ではない。
2. 作成後に表示される「…or push an existing repository from the command line」のURLをコピーし、以下を実行する。
   ```bash
   cd C:\Projects\English_Language_Learning
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/toeic-training.git
   git push -u origin main
   ```
3. GitHubのリポジトリページで **Settings → Pages** を開く。
4. "Build and deployment" の **Source** を `Deploy from a branch` にし、Branch を `main` / `/ (root)` に設定して **Save**。
5. 数十秒〜数分待つと、`https://<ユーザー名>.github.io/toeic-training/` でアプリが公開される。
6. スマホのChromeでそのURLを開き、メニューから「ホーム画面に追加」を選ぶとアプリとして使える。

### 更新したとき
ファイルを変更して再度 `git add . && git commit -m "..." && git push` するだけで、Pagesは自動的に再デプロイされる。Service Workerのキャッシュが残っている場合、反映にはアプリを開き直す（タブを閉じて開く）操作が必要になることがある。`service-worker.js` の `CACHE_VERSION` を変更すると強制的にキャッシュが入れ替わる。

## データの引き継ぎ（スマホ⇄PC）

設定画面から「記録をエクスポート」でJSONファイルを書き出し、別の端末の設定画面で「記録をインポート」から読み込む。サーバーやアカウントは不要。

## ディレクトリ構成

```
index.html / manifest.json / service-worker.js
css/style.css
js/            アプリ本体（ESモジュール）
js/screens/    画面ごとのロジック
data/          問題・単語データ（JSON）
icons/         PWAアイコン
```

## 問題データを増やす・直す

`data/*.json` を編集するだけ。スキーマは各ファイル内のエントリを参照。IDは既存の連番の続きにする。
