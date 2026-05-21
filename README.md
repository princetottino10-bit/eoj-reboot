# 異能学園総選挙 (eoj-reboot)

異能を持つ高校生たちが「票」を奪い合う、2人用対戦カードゲーム **異能学園総選挙** の印刷用カードPDFを生成するツールです。

## 必要環境

- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Noto CJK フォント（日本語表示に必要）

```bash
# Linux / WSL
sudo apt install fonts-noto-cjk
```

## セットアップ

```bash
uv sync
```

## 使い方

```bash
# cards.pdf を生成（デフォルト出力先）
uv run generate_cards.py

# 出力先を指定する場合
uv run generate_cards.py path/to/output.pdf
```

生成されるPDFはA4サイズで、1ページあたり3×3枚（63×88mm）のカードを配置します。

## ファイル構成

| ファイル | 説明 |
|---|---|
| `generate_cards.py` | PDF生成スクリプト |
| `cards.json` | カードデータ（キャラクター・アイテム） |
| `cards.schema.json` | `cards.json` のJSONスキーマ |
| `EOJR_Rulebook.md` | 公式ルールブック |
| `EOJR_Card.md` | カードリスト（全カードのテキスト） |

## カードデータの編集

`cards.json` を編集してカードを追加・変更できます。スキーマ定義は `cards.schema.json` を参照してください。

**キャラクターID形式:** `{faction}_v2_{連番2桁}` （例: `aggro_v2_01`）

**派閥:** `aggro` / `tank` / `control` / `synergy` / `snipe` / `trick`

**属性:** `拳` / `念` / `光` / `闇` / `虚`

**攻撃範囲 (`attack_cells`):**
- `[[row, col], ...]` — 相対座標（row正=前方、col正=右）
- `"all"` — 全域（魔法）
- `null` — 攻撃不可
