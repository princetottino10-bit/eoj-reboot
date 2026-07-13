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
│   ├── cards.json               # カードデータ（キャラクター・アイテム）
│   ├── cards.schema.json        # cards.json の JSON スキーマ
│   ├── card-change-history.json # カード変更履歴
│   ├── card-review-notes.json   # カードレビューメモ
│   └── rulebook.md              # ゲームエンジン向けルール抜粋
├── card-gen/
│   ├── generate_cards.py        # 印刷用 PDF 生成スクリプト
│   ├── generate_card_md.py      # カードリスト Markdown 生成スクリプト
│   └── pyproject.toml           # Python 依存定義（uv）
├── game/
│   ├── src/engine/              # ゲームロジック（TypeScript）
│   ├── src/ui/                  # ブラウザ UI
│   ├── src/data/               # ゲーム用データ読み込み
│   ├── src/firebase/           # Firebase 連携
│   └── tests/                   # vitest テスト
├── scripts/                     # ビルド・変換・シミュレーション各種スクリプト
│   ├── explore-stat-curves.cjs  # バランス調整用シミュレーション（主）
│   ├── generate-print-kit.ts    # 印刷キット生成
│   └── （他: カード/エンジン更新・レポート生成など多数）
├── docs/
│   ├── README.md                # docs索引（バランス設計ドキュメントの入口）
│   ├── balance-*.md             # バランス設計（overview / roadmap ほか）
│   ├── baselines/               # シミュ結果・凍結スナップショット（SHA記録つき）
│   ├── cards.md                 # カードリスト（just md で生成）
│   └── EOJR_Rulebook.md         # 旧ルールブック（正本は RULE_SPEC.md）
├── run-sim.ts                   # シミュレーション実行エントリ
├── firebase.json / firestore.rules  # Firebase 設定
└── justfile                     # タスクランナー定義
```

> 注: ルート直下には `sim-results-*.json` やシミュ実行ログ（`*.log`）など、シミュレーションの生成物も置かれる。

## カードデータの編集

`data/cards.json` を編集してカードを追加・変更できます。スキーマ定義は `data/cards.schema.json` を参照してください。

**キャラクターID形式:** `{属性英名}_{連番3桁}` （例: `fire_001`）

**派閥:** `cip` / `aggro` / `spell` / `inheritance` / `mobility` / `defense` / `meta`

**属性:** `火` / `水` / `土` / `木` / `無`

> 注: テーマ移行（→ 3x3 Duel／式神テーマ、属性 地水火風空）を進行中。上記は現行 `data/cards.json` の値。正本ルールは RULE_SPEC.md 側で新テーマに移行済みだが、カードデータ・ゲーム実装への反映は今後のフェーズで行う。

**攻撃範囲 (`attack_cells`):**
- `[[row, col], ...]` — 相対座標（row正=前方、col正=右）
- `"all"` — 全域（魔法）
- `null` — 攻撃不可
