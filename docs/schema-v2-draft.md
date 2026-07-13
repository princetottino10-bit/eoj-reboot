# cards.schema v2 ドラフト(新体系対応)

Status: 提案(レビュー待ち)
Date: 2026-07-05
対象: 検討事項トラッカー #10

RULE_SPEC.md と純粋バニラ基準v3以降の決定事項を cards.json のスキーマに反映するための改訂案。**実ファイルへの適用はフェーズ6(実カードプール改訂)と同時**に行い、それまでは本ドラフトを仕様書として扱う。

## 変更一覧(現行 cards.schema.json との差分)

| # | 変更 | 根拠 |
|---|---|---|
| 1 | `vp` フィールドを**削除** | 裁定済み(vp廃止、撃破報酬はライフダメージ=生命価に一本化) |
| 2 | `life_value`(生命価)を**追加**(integer, min 1)。基準値はコストから導出: C2-4=1 / C5-6=3 / C7=4 | RULE_SPEC §9.5。カーブ固定+偏差表の原則(トラッカー#4) |
| 3 | `attribute` の enum を `地/水/火/風/空` に変更 | 属性移行(attribute-migration-draft.md) |
| 4 | `cost` の minimum を **2** に変更 | コスト1廃止の裁定 |
| 5 | 魔道(術式)攻撃は **cost >= 3 のみ**: `attack_type: 魔道` なら `cost >= 3` を if/then で強制 | 裁定済み(魔道はコスト3以上) |
| 6 | `reactivation_cost` の説明を「攻撃・回転それぞれ1ターン1回の再命令に支払うコスト」に更新(名称は維持) | 回転1体1回の裁定 |
| 7 | `keyword_effects` の「偏食」定義を風属性参照に書き換え | 属性移行 |
| 8 | `faction_ults` を `hijutsu`(秘術)に改名し、`life_cost`(integer)と `condition` を必須化 | RULE_SPEC §13、秘術たたき台 |
| 9 | 用語コメント: schema の description を terminology.md の正式名称(式神/霊具/霊力/生命/再命令)に揃える。**フィールド名(英語)は変更しない**(コード互換のため) | 用語統一 |

## スキーマ本体(ドラフト)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "3x3 Duel Card Master v2 (draft)",
  "type": "object",
  "required": ["faction_names", "keyword_effects", "characters", "items", "hijutsu"],
  "additionalProperties": false,
  "properties": {
    "faction_names": { "type": "object", "additionalProperties": { "type": "string" } },
    "keyword_effects": { "type": "object", "additionalProperties": { "type": "string" } },
    "characters": { "type": "array", "items": { "$ref": "#/definitions/Shikigami" } },
    "items": { "type": "array", "items": { "$ref": "#/definitions/Reigu" } },
    "hijutsu": { "type": "array", "items": { "$ref": "#/definitions/Hijutsu" } }
  },
  "definitions": {
    "Coord": { "type": "array", "items": { "type": "integer" }, "minItems": 2, "maxItems": 2 },
    "Attribute": { "type": "string", "enum": ["地", "水", "火", "風", "空"] },
    "Faction": { "type": "string", "enum": ["cip", "aggro", "spell", "inheritance", "mobility", "defense", "meta"] },
    "Shikigami": {
      "type": "object",
      "required": [
        "id", "name", "faction", "cost", "life_value", "hp", "atk",
        "reactivation_cost", "attribute", "attack_cells", "counter_cells",
        "weakness_cells", "attack_type", "keywords", "effect",
        "has_overlay", "attack_mode", "attack_range_count", "attack_target_count"
      ],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string", "pattern": "^[a-z_]+_[0-9]{3}$" },
        "name": { "type": "string" },
        "faction": { "$ref": "#/definitions/Faction" },
        "cost": { "type": "integer", "minimum": 2, "maximum": 7 },
        "life_value": { "type": "integer", "minimum": 1, "description": "生命価。撃破時に所有者が失う生命。基準: C2-4=1 / C5-6=3 / C7=4。逸脱は偏差表に記録" },
        "hp": { "type": "integer", "minimum": 1 },
        "atk": { "type": "integer", "minimum": 0 },
        "reactivation_cost": { "type": "integer", "minimum": 1, "description": "再命令コスト。攻撃・回転はそれぞれ1ターン1回まで" },
        "attribute": { "$ref": "#/definitions/Attribute" },
        "attack_cells": { "oneOf": [ { "const": "all" }, { "type": "null" }, { "type": "array", "items": { "$ref": "#/definitions/Coord" }, "minItems": 1 } ] },
        "counter_cells": { "oneOf": [ { "const": "all" }, { "type": "null" }, { "type": "array", "items": { "$ref": "#/definitions/Coord" }, "minItems": 1 } ] },
        "weakness_cells": { "type": "array", "items": { "$ref": "#/definitions/Coord" } },
        "attack_type": { "type": "string", "enum": ["物理", "魔道"] },
        "keywords": { "type": "array", "items": { "type": "string", "enum": ["連撃", "挑発", "先制", "不屈", "暗殺", "偏食", "重ね召喚", "魔道攻撃"] } },
        "effect": { "type": "string" },
        "has_overlay": { "type": "boolean" },
        "attack_mode": { "type": "string", "enum": ["simultaneous", "choice", "none"] },
        "attack_range_count": { "type": "integer", "minimum": 0 },
        "attack_target_count": { "type": "integer", "minimum": 0 }
      },
      "allOf": [
        {
          "if": { "properties": { "attack_type": { "const": "魔道" } } },
          "then": { "properties": { "cost": { "minimum": 3 } } }
        }
      ]
    },
    "Reigu": {
      "type": "object",
      "required": ["id", "name", "attribute", "cost", "effect", "faction"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "name": { "type": "string" },
        "attribute": { "$ref": "#/definitions/Attribute" },
        "cost": { "type": "integer", "minimum": 0 },
        "effect": { "type": "string" },
        "faction": { "$ref": "#/definitions/Faction" }
      }
    },
    "Hijutsu": {
      "type": "object",
      "required": ["id", "faction", "name", "life_cost", "condition", "effect"],
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" },
        "faction": { "$ref": "#/definitions/Faction" },
        "name": { "type": "string" },
        "life_cost": { "type": "integer", "minimum": 1, "description": "発動時に支払う生命(撃破ではないため生命価・霊力獲得は発生しない)" },
        "condition": { "type": "string" },
        "effect": { "type": "string" },
        "source_card_id": { "type": "string" }
      }
    }
  }
}
```

## 付随して必要になる作業(フェーズ6)

- バリデータの更新: スキーマ検証+「カーブ準拠チェック」(HP/ATK/再命令/生命価が `カーブ(cost)+形状税+偏差表` から再導出できること)
- 既存70式神+34霊具の一括変換スクリプト(vp削除、生命価付与、属性変換、コスト1→2)
- 検品アプリの表示フィールド対応(vp→生命価)

## 未決(この改訂では触らない)

- 形状税の最終形(フェーズ3の実測導出後に「税テーブル」として別ファイル化するか、スキーマ内に組み込むか)
- 陣営デッキ定義ファイル(デッキリスト+秘術の対応)のスキーマ。陣営デッキドラフト方式(トラッカー#12)の確定後に設計
