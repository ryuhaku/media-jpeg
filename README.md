# media-jpeg — SillyTavern拡張: 画像投入時の自動JPEG変換

SillyTavernでチャットに画像を添付（またはその他ルートで画像を保存）したとき、
**アップロード直前にブラウザ側でJPEG再符号化**するクライアント拡張です。

## 動作

- STの画像保存API（`POST /api/images/upload`）を`fetch`経由でインターセプトし、対象にのみ変換を適用します。
  - 対象: **PNG ≥ 900KB** または **JPEG ≥ 2.2MB**（GIF/WebP/小型画像は素通し）
  - 変換: JPEG q0.78、**ピクセル寸法は変更しない**（長辺8192px超過時のみ安全上の縮小があり得る）
  - **ファイル名・URLは不変**（`.png`名のままJPEGバイトを保存 — 拡張名を変えないことで既存のチャット参照を保持）
  - 変換失敗時はそのままアップロードする（fail-open — 画像添付を妨げない）
- 有効化: インストール後、STの拡張メニュー（🧩 → Install and manage extensions）でトグルON → ページ再読込。
  導入状態はブラウザのDevToolsコンソールに `[media-jpeg] auto-convert installed...` と表示されます。

## 背景（この拡張が生まれた理由）

SillyTavern本体には「投入時の自動圧縮」機能がありません（アップロードエンドポイントはバイト列をそのまま保存するだけ。
生成時のリサイズ `compressImage` は特定プロバイダ限定で、`custom` API接続では発火しない）。
一方、OpenAI互換バックエンドの中にはHTTPリクエストボディ上限が低いものがあり（例: ローカル推論エンジンStrata ≈12MiB）、
チャットの画像は何度も再送されるため、大きなPNGを複数添付すると上限で拒否されます。
本拡張は「貼った瞬間に小さくなる」ことでこの問題を手作業なしに恒久解決します。

## インストール

### 方法A: STの拡張マネージャ（推奨・更新ボタンで更新できる）
1. STの拡張メニュー → Install Extension → URL にこのリポジトリのHTTPS/SSH URLを貼る
2. Installed Extensions一覧で **Media JPEG Auto-Convert** を有効化 → ページ再読込

### 方法B: 手動コピー
このリポジトリの `manifest.json` と `index.js` を
`<STデータフォルダ>/default-user/extensions/media-jpeg/` にコピーし、拡張メニューで有効化する。

## 設定項目（index.js 冒頭の定数）

| 定数 | 既定値 | 意味 |
|---|---|---|
| `THRESHOLD_PNG_BYTES` | 900KB | PNGの変換しきい値 |
| `THRESHOLD_JPEG_BYTES` | 2.2MB | 既存JPEGの再符号化しきい値 |
| `JPEG_QUALITY` | 0.78 | 変換品質 |
| `MAX_EDGE` | 8192px | 安全上限（通常発火しない） |

## 注意点

- `/api/images/upload`はギャラリー・背景・画像生成拡張なども共有するため、
  上記サイズ条件を満たす大きな画像はどのルートでも変換対象になります（実害は「小さくなる」だけ）。
  チャット添付だけに限定したい場合は、上传bodyの`ch_name`による絞り込み条件を追加してください。
- 削除（アンインストール）: 拡張トグルOFF、または `extensions/media-jpeg` フォルダ削除のみ。
  変換済みの既存画像ファイルは元に戻りません（元画像はアップロード前の手元ファイルにあります）。

## 検証例（PowerShell）

```powershell
# 直近保存ファイルがJPEGバイトになっているか（マジックバイト確認）
$b = [System.IO.File]::ReadAllBytes('<ST>\data\default-user\user\images\<最新ファイル>')
'{0:X2}{1:X2}' -f $b[0], $b[1]   # FF D8 = JPEG
```

## License

MIT License（リポジトリルートの [LICENSE](LICENSE) を参照）
