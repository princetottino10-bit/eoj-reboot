# マスタ情報(正本)の所在と内容 — 2026-07-25 同期

> **重要**: 本プロジェクト(`C:\Projects\codex\eoj-reboot`)は**バランス調整の作業場**であり、正本ではない。
> ゲームルール・定数・カードデータの**正本(Source of Truth)は `fenril058/3x3_duel` リポジトリ**にある。
> 仕様の解釈で迷ったら必ず正本を参照すること。正本と本プロジェクトの記述が食い違う場合、**正本が正しい**。

## 1. 正本の所在

GitHub: `fenril058/3x3_duel`(private。`gh` 認証済みでアクセス可)

```bash
gh api repos/fenril058/3x3_duel/contents/design/game/RULE_SPEC.md --jq '.content' | base64 -d
gh api repos/fenril058/3x3_duel/contents/data/constants.json --jq '.content' | base64 -d
gh repo clone fenril058/3x3_duel   # 全体を見るならクローン
```

| 正本ファイル | 内容 |
|---|---|
| `design/game/RULE_SPEC.md` | **ゲームルール正本**(19章。改訂はここから) |
| `design/game/RULINGS.md` | 裁定集(同時誘発・撃破処理・召喚時効果順序など。確定/提案のラベル付き) |
| `design/game/terminology.md` | 用語の正式定義 |
| `design/game/GAME_FORMATS.md` | デッキ構築方法(Standard = 一門16枚をそのまま使用) |
| `design/game/GAME_VISION.md` / `BOARD_SPEC.md` / `CARD_DESIGN_GUIDE.md` | 設計思想・盤面・カード設計指針 |
| `data/constants.json` | **ゲーム定数の正本** |
| `data/cards.json` | **カードデータの正本**(32枚。効果ID付き) |
| `data/effects.json` | 効果定義 |
| `design/software/DATA_SPEC.md` / `DIGITAL_MOCK_DESIGN.md` | データ仕様・エンジン設計 |

その他: `engine/`(TS実装)、`clients/`(browser/console/**ai**)、`analysis/`、`print/`

## 2. 正本の定数(`data/constants.json`)

```json
{ "BOARD_SIZE": 3, "START_LIFE": 15, "START_HAND": 5,
  "START_MANA_FIRST": 3, "START_MANA_SECOND": 4, "MAX_HAND": 5,
  "MAX_HP": 10, "DECK_SIZE": 16, "MANA_PER_TURN": 3, "WIN_CONTROL": 5,
  "BLIND_SPOT_BONUS": 2, "ATTRIBUTE_HP_BONUS": 2, "DESTROY_MANA_GAIN": 2 }
```

盤面(推奨配置・正本):

```text
空 陰 空
陰 太極 陽      ← 中央=太極(属性は空。盤面配置を変えても中央から動かさない)
空 陽 空
```

## 3. 正本のルール要点(本プロジェクトの理解と要照合)

- **属性は陰/陽/空の3種**。陰↔陽が対立、空は無属性(§11)
- **太極への召喚は消費霊力−1、下限0**。ただし**手札からの通常召喚のみ**。カード効果による召喚・霊具には適用しない(§9.2)
- **召喚位置**: 自式神0体なら任意。1体以上なら**敵味方問わず**隣接の空きマス(斜めは隣接に含まない)(§9.2)
- **再命令は3択**(再攻撃 / 90度回転後再攻撃 / 90度回転)。各式神1ターン1回まで(§9.3)
- **制圧勝利は自ターン終了時に判定**。ターン中に一時的に到達しても勝利ではない(§2.2、RULINGS)
- **反撃範囲は独立した概念**。用語集で「反撃できる相対マスの集合。向きに連動」と定義され、`cards.json` にも `counterRange` フィールドが独立して存在する(現行カードは攻撃範囲と同値だが、構造上は別)
- 死角=旧「弱点範囲」。物理攻撃のみ死角判定・反撃の対象(§10、terminology)
- 撃破時: 所有者が生命価ぶん生命を失い、霊力 `DESTROY_MANA_GAIN` を得る(§9.5)
- デッキ切れ敗北なし。墓地をシャッフルして再利用(§15)
- 裁定の優先順位: カード個別テキスト > RULE_SPEC > RULINGS(§18)

RULINGS の主な確定/提案: 召喚時効果は召喚攻撃より**先**に解決 / 反撃は攻撃を受けた式神が生存している場合のみ / 再反撃なし / 反撃も「攻撃」なので撃破誘発する / HP上限はいかなる場合も `MAX_HP` 超過不可

## 4. カードデータの正本(`data/cards.json`)

- 32枚。`cardType`: `shikigami` / `reigu`(霊具も既に存在)
- 一門(`faction`)別。妖怪テーマの実カード名(化け草履・唐傘小僧・提灯お化け・朧車・九十九の王 など)
- フィールド: `id` / `code` / `name` / `cardType` / `faction` / `summonCost` / `commandCost` / `attribute`(yin/yang/void) / `attackType` / `atk` / `hp` / `lifeValue` / `targetCount` / `attackRange` / **`counterRange`** / `blindSpots` / `role` / `effects[]` / `notes`
- **効果(`effects`)が既に付いている**(EF-001 等。定義は `data/effects.json`)
- Standard フォーマット = 一門16枚をそのまま使用。カードの入れ替えなし(`GAME_FORMATS.md`)

## 5. 本プロジェクト(バランス調整)との差分 — 重要

| 項目 | 正本 | 本プロジェクトの現状 | 扱い |
|---|---|---|---|
| **太極の軽減** | −1、**下限0**、手札からの通常召喚のみ | v4.1タスクで「下限1」と指定 | **タスクの誤り。下限0が正** |
| **DESTROY_MANA_GAIN** | **2**(正本で既に採用済み) | v4の提案値として検証中 | 正本が先行。v4の「撃破時霊力2」は**既に正式** |
| **BLIND_SPOT_BONUS** | **2** | v4で1を提案・検証中 | 提案段階。正本未反映 |
| **START_MANA_SECOND** | 4 | v4.1のH1で5を提案・検証中 | 提案段階。正本未反映 |
| **属性・盤面** | 陰陽+太極(正本で採用済み) | v4の提案として検証中 | 正本が先行。**既に正式** |
| **反撃範囲** | 独立概念(`counterRange` フィールドあり) | 「攻撃範囲=反撃範囲」と裁定 | 現行カードは同値だが、**構造は独立**。裁定は「現行カードの値がたまたま同じ」と理解すべき |
| **カードプール** | 実カード32枚(一門・効果・妖怪名) | 素体9種(鬼火/小鬼/槍霊/薙刀霊/鬼/両面/仁王/九尾/龍)・効果なし | **別物**。本プロジェクトの9種は形状検証用の素体であり、正本のカードではない |
| **ステータスカーブ** | HP 1/1/2/2/2/4/4/5/5/6/7/8、ATK 1/1/2/2/2/2/2/3/3/4/5/6、生命価 1〜3(実カード) | C2〜C7の6段カーブ | 正本は実カード個別値。カーブは設計指針(`CARD_DESIGN_GUIDE.md`)側 |
| **デッキ** | 16枚(一門固定) | 16枚 | 一致 |

## 6. 運用ルール(以後)

1. **仕様の疑義は正本を引く**。本プロジェクトのドキュメントを根拠にしない
2. **ルール変更は正本を先に更新**(RULE_SPEC §19)。本プロジェクトは検証結果を提案として出し、採用後に正本へ反映される
3. 本プロジェクトの提案が正本に反映済みか、常に確認する(例: 撃破時霊力2・陰陽属性は既に反映済み)
4. 素体9種は**形状・数値の検証用モデル**であり、製品カードではない。混同しない
