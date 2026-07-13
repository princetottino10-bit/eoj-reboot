# 異能学園総選挙 Reboot

異能を持つ高校生たちが「票」を奪い合う、2人用対戦カードゲーム **異能学園総選挙** のリポジトリです。

- **`card-gen/`** — 印刷用カードPDFを生成するツール（Python + fpdf2）
- **`game/`** — ブラウザで遊べるゲーム実装（TypeScript + Vite）
- **`scripts/`** — バランス調整用のシミュレーション（`explore-stat-curves.cjs`）
- **`docs/`** — バランス設計ドキュメント・シミュ結果・レポート（索引は [docs/README.md](docs/README.md)）

## バランス設計ドキュメント

ゲーム数値のバランス調整はシミュレーション主導で進めている。経緯・KPI・確定した数値・各検証レポートはすべて `docs/` にある。まずは以下から:

- [docs/README.md](docs/README.md) — docsフォルダ全体の索引
- [docs/balance-overview.md](docs/balance-overview.md) — 確定した数値・カーブ・KPIのチーム向けサマリー
- [docs/balance-roadmap.md](docs/balance-roadmap.md) — フェーズ計画と裁定の記録
- [docs/test-package-0718.md](docs/test-package-0718.md) — プレイテスト用のルール・数値パッケージ

生データと凍結スナップショット（再現コマンド・SHA記録つき）は `docs/baselines/` にある。

## 必要環境

- [just](https://github.com/casey/just)（タスクランナー）
- [uv](https://docs.astral.sh/uv/)（Python パッケージマネージャ）
- Node.js 18+
- Noto CJK フォント（PDF生成時の日本語表示に必要）

```bash
# Linux / WSL
sudo apt install fonts-noto-cjk
```

## セットアップ

```bash
just setup
```

## よく使うコマンド

```bash
just dev        # ブラウザゲームの開発サーバーを起動 (http://localhost:5173)
just test       # テストを実行
just pdf        # 印刷用PDFを生成 (card-gen/cards.pdf)
just md         # カードリストMarkdownを生成 (docs/cards.md)
just build      # プロダクションビルド (game/dist/)
just deploy     # ビルド → Firebase Hosting にデプロイ
```

`just` だけで全コマンド一覧を表示します。

## デプロイ

Firebase Hosting（プロジェクト: `inougakuen`）にデプロイします。

firebase-tools はバンドルサイズが大きいため devDependencies には含めず、グローバルインストールを前提としています。

```bash
# 初回のみ: Firebase CLI のインストール（どちらか）
npm install -g firebase-tools   # npm グローバル
volta install firebase-tools    # Volta を使っている場合

# ログインとデプロイ（ビルドも同時に実行）
firebase login
just deploy
```

デプロイ後は Firebase Hosting の URL でゲームにアクセスできます。

## ファイル構成

```
eoj-reboot/
├── data/
│   ├── cards.json          # カードデータ（キャラクター・アイテム）
│   ├── cards.schema.json   # cards.json の JSON スキーマ
│   └── rulebook.md         # ゲームエンジン向けルール抜粋
├── card-gen/
│   ├── generate_cards.py   # 印刷用 PDF 生成スクリプト
│   └── generate_card_md.py # カードリスト Markdown 生成スクリプト
├── game/
│   ├── src/engine/         # ゲームロジック（TypeScript）
│   ├── src/ui/             # ブラウザ UI
│   └── tests/              # vitest テスト
├── scripts/
│   └── explore-stat-curves.cjs  # バランス調整用シミュレーション
├── docs/
│   ├── README.md           # docs索引（バランス設計ドキュメントの入口）
│   ├── balance-*.md        # バランス設計（overview / roadmap ほか）
│   ├── baselines/          # シミュ結果・凍結スナップショット（SHA記録つき）
│   ├── cards.md            # カードリスト（just md で生成）
│   └── EOJR_Rulebook.md    # 旧ルールブック（正本は RULE_SPEC.md）
└── justfile                # タスクランナー定義
```

## カードデータの編集

`data/cards.json` を編集してカードを追加・変更できます。スキーマ定義は `data/cards.schema.json` を参照してください。

**キャラクターID形式:** `{faction}_v2_{連番2桁}` （例: `aggro_v2_01`）

**派閥:** `aggro` / `tank` / `control` / `synergy` / `snipe` / `trick`

**属性:** `拳` / `念` / `光` / `闇` / `虚`

**攻撃範囲 (`attack_cells`):**
- `[[row, col], ...]` — 相対座標（row正=前方、col正=右）
- `"all"` — 全域（魔法）
- `null` — 攻撃不可
