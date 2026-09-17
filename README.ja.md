# dsh-fal-imagegen

**言語:** [English](README.md) · [中文](README.zh.md) · [Español](README.es.md) · [العربية](README.ar.md) · [Français](README.fr.md) · **日本語** · [한국어](README.ko.md)

DeepSeek Harness (DSH) 向けの [fal.ai](https://fal.ai) ネイティブ画像生成プラグイン：FAL_KEY とデフォルト設定のためのバイリンガル設定カードと、fal のプロトコルをエンドツーエンドで話すエージェントツールを提供します — OpenAI 互換ゲートウェイは一切挟みません。

## 主な機能

- **fal ネイティブプロトコル** — `Authorization: Key <key_id>:<key_secret>` 付きで `POST https://queue.fal.run/<slug>`、キュー管理チケット（`status_url` → `response_url`）をポーリングし、`{ images: [{ url, width, height }] }` を消費します。
- **デフォルトで非同期生成** — `fal_generate_image` はジョブを fal キューに送信し、即座に `task_id` を返します。バックグラウンドコレクタが完了まで処理し、`fal_get_image_task` で進捗を確認・完成画像を受け取れます（クエリごとに最大 120 秒待機可能）。従来の同期待ちが好みなら `wait=true` を渡してください。
- **バイリンガル設定カード** — 設定 → プラグイン の「fal 生図」/「fal imagegen」：マスタースイッチ、FAL_KEY、デフォルトの文生成/図生成エンドポイント、デフォルトサイズ、品質、出力形式、タイムアウト、出力ディレクトリ、システムプロンプト告知スイッチ。組み込みプラグインカードと同じ外観・操作（折りたたみ、未保存タグ、フィールドごとのリセット、保存/破棄）で、GUI の言語を自動検出 — カード内の「中文 / English」切替スイッチはリロード後も記憶されます。
- **エージェントツール**：

  | ツール | 役割 |
  | --- | --- |
  | `fal_generate_image` | テキスト→画像（デフォルト非同期）：`prompt` / `model` / `size` / `quality` / `count` / `wait` → `task_id` を返す |
  | `fal_get_image_task` | バックグラウンドタスク照会：進捗・待機・完成画像（`task_id` か fal の `request_id` で指定。両方省略で最近のタスク一覧） |
  | `fal_edit_image` | 画像→画像（同期）：`prompt` + 参照元（添付参照 or ディスク上の `image_path`） |
  | `fal_list_image_models` | 組み込みエイリアス・現在のデフォルト・出力ディレクトリを一覧表示 |

- **再利用可能な成果物** — すべての画像は会話に添付され（ツール呼び出しの横に表示）、さらに `<DSH_HOME>/fal-imagegen` 配下にディスクへ書き出されます。返った `path` はそのまま `fal_edit_image` の `image_path` に渡せます。
- **検証済みモデルエイリアス** — 組み込みエイリアスはすべて fal 公式エンドポイントスキーマと照合済み。「/」を含む未知の slug はそのまま透過し、文生成 slug を編集に使うと壊れたリクエストを送る代わりに明確に拒否します。

## 非同期生成の流れ

`fal_generate_image` はもうエージェントのターンを fal キューで塞ぎません：

1. ツールはジョブをキューへ送信し、fal が受け付けた時点で `{ status: "queued", task_id, request_id, message, next_action, images: [] }` を返します。
2. 切り離されたコレクタがキューをポーリングし、画像をダウンロードして添付として保存し、出力ディレクトリへコピーします — すべてバックグラウンドで。
3. `fal_get_image_task`（`task_id` 必須、または fal の `request_id`）は `queued / running / completed / failed` を返します。`wait_seconds`（0–120）を付けると最大その秒数だけブロックします。`completed` になると、結果に添付 ID + ローカル `path` 付きの完全な `images[]` が入り、ツール呼び出しの横に画像が表示されます。
4. ID を省略すると最近のタスクの一覧（`task_id`・状態・モデル・画像数）を返します。

注記：タスク記録は現在のホストプロセス内に保持されます（約 6 時間、新しい順に 64 件）。バックグラウンド待機がタイムアウトしたタスクは、次のクエリ時に自動的に再試行されます。`fal_edit_image` は結果が次のステップの入力になることが多いため同期のままです。

## モデルエイリアス

| エイリアス | 文生成エンドポイント | 図生成エンドポイント | サイズパラメータ | quality |
| --- | --- | --- | --- | --- |
| `gpt-image-2.5-flare`（デフォルト。`gpt-image-2.5` / `gpt-image-2.5-flash` も可） | `openai/gpt-image-2.5/flare/text-to-image` | `openai/gpt-image-2.5/flare/edit` | `image_size` | 対応 |
| `gpt-image-2.5-sunburst` | `openai/gpt-image-2.5/sunburst/text-to-image` | `openai/gpt-image-2.5/sunburst/edit` | `image_size` | 対応 |
| `gpt-image-2` | `openai/gpt-image-2` | `openai/gpt-image-2/edit` | `image_size` | 対応 |
| `gpt-image-1.5` | `fal-ai/gpt-image-1.5` | `fal-ai/gpt-image-1.5/edit` | `image_size` | 対応 |
| `nano-banana-2` | `fal-ai/nano-banana-2` | `fal-ai/nano-banana-2/edit` | `aspect_ratio` | 省略 |
| `gemini-25-flash-image` | `fal-ai/gemini-25-flash-image` | `fal-ai/gemini-25-flash-image/edit` | `aspect_ratio` | 省略 |
| `flux-2-flash` | `fal-ai/flux-2/flash` | `fal-ai/flux-2/flash/edit` | `image_size` | 省略 |

## 設定

| フィールド | デフォルト | 意味 |
| --- | --- | --- |
| `enabled` | `true` | マスタースイッチ（ツール + プロンプト告知） |
| `falKey` | 空 | FAL_KEY（`key_id:key_secret` の形式。fal.ai → Keys から完全な文字列をコピー） |
| `defaultTextToImageModel` | `openai/gpt-image-2.5/flare/text-to-image` | デフォルトの文生成エンドポイント |
| `defaultImageToImageModel` | `openai/gpt-image-2.5/flare/edit` | デフォルトの図生成エンドポイント |
| `defaultImageSize` | `1:1` | `1:1 / 4:3 / 3:4 / 3:2 / 2:3 / 16:9 / 9:16 / 21:9`、`WxH` のピクセル指定、または `auto` |
| `quality` | `high` | `auto / low / medium / high / xhigh / max`（対応していないエンドポイントでは自動的に省略） |
| `outputFormat` | `png` | `png / jpeg / webp` |
| `timeoutSeconds` | `300` | 1 リクエストの総予算（送信 + 待機 + 取得） |
| `saveDir` | 空 | 出力ディレクトリ。空 = `<DSH_HOME>/fal-imagegen` |
| `announceToAgent` | `true` | 各エージェントのシステムプロンプトでプラグインを告知するか |

設定カードは `~/.dsh/settings.yaml` の `dsh-fal-imagegen:` セクションと同じ設定を読み書きします。FAL_KEY はパスワードフィールドです：空欄のままなら現在のキーを維持します（キーはすべてのネットワークビューで伏せられます）。

## インストール

### npm（推奨）

`dsh-fal-imagegen@0.2.0` が公開されています：

```sh
# CLI 管理プロファイル（web / headless / カスタム）：
dsh plugin --profile web add dsh-fal-imagegen
# その後、対応するプロセスを再起動
```

**desktop プロファイル** は DSH Desktop アプリが独占管理します（`dsh plugin --profile desktop` は拒否されます）：設定 → プラグイン → マーケットでインストールするか、`~/.dsh/profiles/desktop/package.json`（依存関係 + `dsh.profile.bundles` への `dsh-fal-imagegen` 追加）に手動登録し、DSH Desktop を完全に再起動してください。

インストール後、設定 → プラグイン → 插件配置 の「fal 生図」カードで FAL_KEY を入力するか、`~/.dsh/settings.yaml` の `dsh-fal-imagegen:` セクションに記入します。

### git から（代替手段）

```sh
dsh plugin --profile web add github:Enchanted0911/dsh-fal-imagegen
```

### ソースから

```sh
git clone https://github.com/Enchanted0911/dsh-fal-imagegen
# プロファイルに link: する（依存関係 + dsh.profile.bundles エントリ）→ DSH Desktop を再起動
```

ランタイムパッケージ（`@deepseek-ai/dsh-tools`、`dsh-attachment`、`dsh-settings`、`schemastery`）はハーネスから供給されます。ソースツリーの `node_modules/` はオフラインテストをハーネス外で動かすためだけに存在します。

## 開発

オフラインテスト（キー不要・ネットワーク不要）：

```sh
node tests/fal-manifest-test.mjs             # マニフェスト契約：patch 行、exports、dsh.client、wrapper id
node tests/fal-client-test.mjs               # ブラウザ側：スロット登録、カード状態、保存操作、言語切替
node tests/fal-settings-roundtrip-test.mjs   # 両側の接合：カード書込 → ホスト読込、リセット、トグル
node tests/fal-schema-test.mjs               # ツールのパラメータと出力スキーマ
node tests/fal-tasks-test.mjs                # 非同期経路：送信 → バックグラウンド完了 → 照会（フェイクの fal キュー使用）
```

実呼び出しテスト（fal クレジットを消費）：

```sh
FAL_KEY='<key_id>:<key_secret>' node tests/fal-host-test.mjs   # ホストシミュレーション：生成 + 編集 + 添付/保存 + 失敗系
FAL_KEY='<key_id>:<key_secret>' node tests/fal-smoke.mjs       # fal クライアントのみ（1 回生成）
```

リンクインストールでの変更反映：ブラウザ側（`lib/client.js`）はページ更新で反映。ホスト側コードと `package.json` マニフェストの変更は DSH Desktop の再起動が必要です。

## マーケットプレイスカタログソース

DSH コミュニティマーケットにはデフォルトのソースがありません。このリポジトリは `catalog/`（データソースは `catalog/entry.mjs`）に v1 契約準拠のカタログソースを同梱しています。Cloudflare Pages 版をデプロイし、設定 → プラグイン → マーケット → ソース にマニフェスト URL を登録してください：

```sh
npx wrangler pages deploy catalog/pages --project-name dsh-fal-imagegen-catalog
# その後 https://dsh-fal-imagegen-catalog.pages.dev/catalog-source.json をソースとして追加
```

## 既知の制限

- `aspect_ratio` しか公開していないエンドポイント（nano-banana / gemini）では、明示的なピクセルサイズは `auto` に格下げされます。
- 生成は fal クレジットを消費し、画像コンテンツは fal 側のモデルが生成します。