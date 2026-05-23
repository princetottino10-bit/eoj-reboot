# 異能学園総選挙 Reboot

異能を持つ高校生たちが「票」を奪い合う、2人用対戦カードゲーム **異能学園総選挙** のリポジトリです。

- **`card-gen/`** — 印刷用カードPDFを生成するツール（Python + fpdf2）
- **`game/`** — ブラウザで遊べるゲーム実装（TypeScript + Vite）

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
just md         # カードリストMarkdownを生成 (data/cards.md)
```

`just` だけで全コマンド一覧を表示します。

## ファイル構成

```
eoj-reboot/
├── data/
│   ├── cards.json          # カードデータ（キャラクター・アイテム）
│   └── cards.schema.json   # cards.json の JSON スキーマ
├── card-gen/
│   ├── generate_cards.py   # 印刷用 PDF 生成スクリプト
│   └── generate_card_md.py # カードリスト Markdown 生成スクリプト
├── game/
│   ├── src/engine/         # ゲームロジック（TypeScript）
│   ├── src/ui/             # ブラウザ UI
│   └── tests/              # vitest テスト
├── data/
│   └── rulebook.md         # ゲームエンジン向けルール抜粋
├── docs/
│   ├── EOJR_Rulebook.md    # 公式ルールブック（全文）
│   └── cards.md            # カードリスト（生成済み）
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
