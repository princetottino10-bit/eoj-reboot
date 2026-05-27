import type { MarkerKey } from "./types.js";

// ============================================================
// 型定義
// ============================================================

/** エフェクトの対象。select_* はUI選択が必要 */
export type EffectTarget =
  | "self"
  | "adj_allies"
  | "adj_enemies"
  | "self_and_adj_allies"
  | "all_allies"
  | "all_enemies"
  | "front_row_enemies" // 前方ライン全敵（ウルト用）
  | "attack_target" // 攻撃対象（on_attack内で使用）
  | "select_ally"
  | "select_enemy"
  | "select_adj_ally"
  | "select_adj_enemy"
  | "select_any" // 敵味方任意
  | "self_cell" // 自身が立つマス（set_cell_attr用）
  | "adj_cells" // 隣接全マス（set_cell_attr用）
  | "select_any_cell" // UI: 任意マス選択
  | "select_adj_cell"; // UI: 隣接マス選択

/** エフェクトが発動するタイミング */
export type EffectTrigger =
  | "on_summon"
  | "on_use" // アイテム使用時
  | "on_ult_activate" // ウルト発動時
  | "on_attack" // 攻撃時
  | "on_kill" // 撃破時
  | "on_damaged" // 被ダメ時
  | "on_ally_killed" // 味方破壊時
  | "on_turn_start" // ターン開始時
  | "on_turn_end" // ターン終了時
  | "on_death" // このキャラが破壊された時
  | "passive"; // 常時条件チェック

/** エフェクト発動に伴うコスト（任意 or 必須） */
export type EffectCost =
  | { type: "discard"; count: number }
  | { type: "self_damage"; amount: number }
  | { type: "mana"; amount: number }
  | { type: "self_damage_and_discard"; damage: number; discard: number }
  | { type: "vp"; amount: number }
  | { type: "mill"; count: number }
  | { type: "expose_self" }
  | { type: "skip_next_turn" }
  | { type: "spend_marker" }
  | { type: "self_bounce" }
  | { type: "sacrifice_ally" };

/** エフェクトの原子的な操作 */
export type EffectAtom =
  | { type: "give_marker"; target: EffectTarget; marker: MarkerKey }
  | { type: "heal"; target: EffectTarget; amount: number }
  | { type: "full_heal"; target: EffectTarget }
  | {
      type: "hp_delta";
      target: EffectTarget;
      amount: number;
      piercing?: boolean;
      ignoreDistance?: boolean;
      permanent?: boolean;
    }
  | {
      type: "atk_delta";
      target: EffectTarget;
      delta: number;
      permanent?: boolean;
      turns?: number;
    }
  | { type: "atk_steal"; target: EffectTarget; amount: number }
  | { type: "push"; target: EffectTarget; distance: number }
  | { type: "rotate"; target: EffectTarget; degrees: "either" | 180 | "any" }
  | { type: "draw"; count: number }
  | { type: "discard"; count: number }
  | { type: "mana_steal"; amount: number }
  | { type: "mana_gain"; amount: number }
  | { type: "brainwash"; target: EffectTarget; turns: number }
  | { type: "action_tax"; target: EffectTarget; amount: number }
  | { type: "dir_lock"; target: EffectTarget; turns: number }
  | { type: "extra_damage"; amount: number }
  | { type: "set_piercing" }
  | { type: "reactivation_cost_delta"; delta: number }
  | { type: "swap_positions"; target: EffectTarget }
  | { type: "bounce"; target: EffectTarget; maxCost?: number }
  | { type: "element_swap"; target: EffectTarget }
  | { type: "set_hp"; target: EffectTarget; hp: number }
  | { type: "immune"; turns: number }
  | { type: "team_damage_reduction" }
  | { type: "clear_has_acted"; target: EffectTarget }
  | { type: "no_counterattack" }
  | { type: "omnidirectional_counter" }
  | { type: "set_cell_attr"; target: EffectTarget; mode: "opposite" | "self_attr" };

/** エフェクト発動の条件 */
export type EffectCondition =
  | { type: "ally_count_gte"; min: number }
  | { type: "marker_ally_count_gte"; min: number }
  | { type: "attacked_ally_count_gte"; min: number }
  | { type: "debuffed_enemy_count_gte"; min: number }
  | { type: "b_position_ally_count_gte"; min: number }
  | { type: "empty_cell_count_gte"; min: number }
  | { type: "self_in_b_position" }
  | { type: "on_matching_attr_cell" };

/** 単一トリガーに対するエフェクト節 */
export interface EffectClause {
  trigger: EffectTrigger;
  /** コストあり（省略=コストなし）。costMandatory=false（省略時）は任意コスト */
  cost?: EffectCost;
  costMandatory?: boolean;
  condition?: EffectCondition;
  effects: EffectAtom[];
}

export interface CardEffectSpec {
  clauses: EffectClause[];
}

export interface UltSpec {
  vpCost: number;
  timing: "immediate" | "next_turn_onwards";
  clauses: EffectClause[];
}

export interface ItemSpec {
  clauses: EffectClause[];
}

// ============================================================
// ヘルパー
// ============================================================

const SELECT_TARGETS = new Set<EffectTarget>([
  "select_ally",
  "select_enemy",
  "select_adj_ally",
  "select_adj_enemy",
  "select_any",
  "select_any_cell",
  "select_adj_cell",
]);

function atomNeedsUi(atom: EffectAtom): boolean {
  return (
    ("target" in atom &&
      SELECT_TARGETS.has((atom as { target: EffectTarget }).target)) ||
    (atom.type === "rotate" && atom.degrees === "any") ||
    atom.type === "discard"
  );
}

/** on_summon 節にUIターゲット選択（対象選択・向き選択・手札捨て選択）が必要か */
export function needsTargetSelection(
  clauses: EffectClause[],
  trigger: EffectTrigger,
): boolean {
  return clauses
    .filter((c) => c.trigger === trigger)
    .some(
      (c) =>
        c.effects.some(atomNeedsUi) ||
        c.cost?.type === "discard" ||
        c.cost?.type === "self_damage_and_discard",
    );
}

/** 節の中にUI操作が必要なエフェクトが含まれるか（applyAutoEffects でのスキップ判定） */
export function clauseHasPendingEffects(clause: EffectClause): boolean {
  return (
    clause.effects.some(atomNeedsUi) ||
    clause.cost?.type === "discard" ||
    clause.cost?.type === "self_damage_and_discard"
  );
}

/** 指定トリガーの節群から最初の select_* EffectTarget を返す。なければ null。 */
export function getFirstSelectTarget(
  clauses: EffectClause[],
  trigger: EffectTrigger,
): EffectTarget | null {
  for (const clause of clauses) {
    if (clause.trigger !== trigger) continue;
    for (const effect of clause.effects) {
      if (
        "target" in effect &&
        SELECT_TARGETS.has((effect as { target: EffectTarget }).target)
      ) {
        return (effect as { target: EffectTarget }).target;
      }
    }
  }
  return null;
}

// ============================================================
// キャラクターエフェクトスペック（カードID → CardEffectSpec）
// effects のないカードはこのテーブルに登録不要（getEffectSpec で空を返す）
// ============================================================

export const EFFECT_SPECS: Record<string, CardEffectSpec> = {
  // ==============================
  // AGGRO
  // ==============================
  aggro_v2_02: {
    clauses: [
      {
        trigger: "on_turn_start",
        cost: { type: "discard", count: 1 },
        effects: [{ type: "mana_gain", amount: 1 }],
      },
    ],
  },
  aggro_v2_03: {
    clauses: [
      {
        trigger: "on_summon",
        cost: { type: "discard", count: 1 },
        effects: [{ type: "push", target: "select_adj_enemy", distance: 1 }],
      },
    ],
  },
  aggro_v2_04: {
    clauses: [
      {
        trigger: "on_kill",
        effects: [{ type: "atk_delta", target: "self", delta: 1 }],
      },
    ],
  },
  aggro_v2_07: {
    clauses: [
      {
        trigger: "on_attack",
        condition: { type: "attacked_ally_count_gte", min: 1 },
        effects: [{ type: "extra_damage", amount: 1 }],
      },
    ],
  },
  aggro_v2_08: {
    clauses: [
      {
        trigger: "on_death",
        effects: [
          { type: "heal", target: "adj_allies", amount: 2 },
          { type: "atk_delta", target: "adj_allies", delta: 1 },
        ],
      },
    ],
  },
  aggro_v2_09: {
    clauses: [{ trigger: "passive", effects: [{ type: "no_counterattack" }] }],
  },
  // draw 1 then discard 1 (mandatory); discard requires hand selection → hasPending
  aggro_v2_10: {
    clauses: [
      {
        trigger: "on_summon",
        costMandatory: true,
        effects: [
          { type: "draw", count: 1 },
          { type: "discard", count: 1 },
        ],
      },
    ],
  },
  aggro_v2_11: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "hp_delta", target: "adj_enemies", amount: -3 }],
      },
      {
        trigger: "on_summon",
        condition: { type: "attacked_ally_count_gte", min: 2 },
        effects: [{ type: "atk_delta", target: "self", delta: 2 }],
      },
    ],
  },
  aggro_v2_12: {
    clauses: [
      {
        trigger: "passive",
        condition: { type: "attacked_ally_count_gte", min: 3 },
        effects: [{ type: "reactivation_cost_delta", delta: -2 }],
      },
    ],
  },

  // ==============================
  // TANK
  // ==============================
  tank_v2_02: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "give_marker", target: "adj_allies", marker: "protection" },
        ],
      },
    ],
  },
  tank_v2_04: {
    clauses: [
      {
        trigger: "on_summon",
        condition: { type: "on_matching_attr_cell" },
        effects: [{ type: "hp_delta", target: "self", amount: 1 }],
      },
    ],
  },
  tank_v2_05: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "heal", target: "adj_allies", amount: 1 }],
      },
    ],
  },
  tank_v2_06: {
    clauses: [
      {
        trigger: "passive",
        condition: { type: "ally_count_gte", min: 2 },
        effects: [{ type: "atk_delta", target: "self", delta: 1 }],
      },
    ],
  },
  tank_v2_07: {
    clauses: [
      {
        trigger: "on_damaged",
        effects: [{ type: "atk_delta", target: "self", delta: 1 }],
      },
    ],
  },
  tank_v2_08: {
    clauses: [
      {
        trigger: "passive",
        effects: [{ type: "atk_delta", target: "adj_allies", delta: 1 }],
      },
    ],
  },
  tank_v2_09: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          {
            type: "give_marker",
            target: "self_and_adj_allies",
            marker: "protection",
          },
          { type: "heal", target: "adj_allies", amount: 1 },
        ],
      },
    ],
  },
  tank_v2_10: {
    clauses: [
      { trigger: "passive", effects: [{ type: "omnidirectional_counter" }] },
      {
        trigger: "on_death",
        effects: [{ type: "atk_delta", target: "adj_allies", delta: 1 }],
      },
    ],
  },
  tank_v2_11: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "rotate", target: "select_ally", degrees: "any" }],
      },
    ],
  },
  tank_v2_12: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "heal", target: "adj_allies", amount: 2 },
          { type: "give_marker", target: "self", marker: "protection" },
        ],
      },
    ],
  },

  // ==============================
  // CONTROL
  // ==============================
  control_v2_01: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "atk_delta", target: "select_adj_enemy", delta: -1 }],
      },
    ],
  },
  control_v2_02: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "action_tax", target: "select_adj_enemy", amount: 1 },
        ],
      },
    ],
  },
  control_v2_03: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "atk_delta", target: "select_adj_enemy", delta: -2 }],
      },
    ],
  },
  control_v2_04: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "action_tax", target: "select_adj_enemy", amount: 1 },
        ],
      },
    ],
  },
  control_v2_05: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "rotate", target: "select_adj_enemy", degrees: "either" },
        ],
      },
    ],
  },
  control_v2_07: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "brainwash", target: "select_enemy", turns: 2 }],
      },
      {
        trigger: "on_summon",
        effects: [{ type: "atk_delta", target: "select_adj_enemy", delta: -1 }],
      },
    ],
  },
  control_v2_08: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "rotate", target: "select_adj_enemy", degrees: "either" },
        ],
      },
    ],
  },
  control_v2_09: {
    clauses: [
      { trigger: "on_summon", effects: [{ type: "mana_steal", amount: 2 }] },
      {
        trigger: "on_attack",
        effects: [{ type: "action_tax", target: "adj_enemies", amount: 1 }],
      },
    ],
  },
  control_v2_10: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "atk_delta", target: "select_adj_enemy", delta: -1 }],
      },
      {
        trigger: "on_summon",
        condition: { type: "debuffed_enemy_count_gte", min: 1 },
        effects: [{ type: "draw", count: 1 }],
      },
      {
        trigger: "on_summon",
        condition: { type: "debuffed_enemy_count_gte", min: 3 },
        effects: [{ type: "hp_delta", target: "select_adj_enemy", amount: -1 }],
      },
    ],
  },
  control_v2_11: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "action_tax", target: "select_adj_enemy", amount: 1 },
        ],
      },
    ],
  },
  control_v2_12: {
    clauses: [
      {
        trigger: "on_turn_start",
        condition: { type: "debuffed_enemy_count_gte", min: 2 },
        effects: [{ type: "draw", count: 1 }],
      },
      {
        trigger: "on_turn_start",
        condition: { type: "debuffed_enemy_count_gte", min: 3 },
        effects: [{ type: "mana_gain", amount: 1 }],
      },
    ],
  },

  // ==============================
  // SYNERGY
  // ==============================
  synergy_v2_01: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "give_marker", target: "select_ally", marker: "protection" },
        ],
      },
    ],
  },
  synergy_v2_02: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "give_marker", target: "select_adj_ally", marker: "evasion" },
        ],
      },
    ],
  },
  synergy_v2_03: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          {
            type: "give_marker",
            target: "select_adj_ally",
            marker: "piercing",
          },
        ],
      },
    ],
  },
  synergy_v2_04: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "give_marker", target: "select_ally", marker: "evasion" },
        ],
      },
    ],
  },
  synergy_v2_05: {
    clauses: [
      {
        trigger: "on_attack",
        condition: { type: "marker_ally_count_gte", min: 3 },
        effects: [{ type: "extra_damage", amount: 1 }],
      },
      {
        trigger: "on_turn_end",
        condition: { type: "marker_ally_count_gte", min: 4 },
        effects: [{ type: "heal", target: "adj_allies", amount: 1 }],
      },
    ],
  },
  synergy_v2_06: {
    clauses: [
      {
        trigger: "on_ally_killed",
        effects: [
          { type: "give_marker", target: "self", marker: "protection" },
        ],
      },
    ],
  },
  synergy_v2_07: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "atk_delta", target: "adj_allies", delta: 1 }],
      },
    ],
  },
  synergy_v2_08: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "heal", target: "adj_allies", amount: 1 }],
      },
      {
        trigger: "on_summon",
        condition: { type: "marker_ally_count_gte", min: 3 },
        effects: [{ type: "atk_delta", target: "adj_allies", delta: 1 }],
      },
    ],
  },
  synergy_v2_09: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "heal", target: "select_adj_ally", amount: 1 }],
      },
    ],
  },
  synergy_v2_10: {
    clauses: [
      {
        trigger: "passive",
        condition: { type: "marker_ally_count_gte", min: 2 },
        effects: [{ type: "atk_delta", target: "self", delta: 1 }],
      },
      {
        trigger: "on_turn_end",
        condition: { type: "marker_ally_count_gte", min: 3 },
        effects: [{ type: "heal", target: "adj_allies", amount: 1 }],
      },
    ],
  },
  synergy_v2_11: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "heal", target: "adj_allies", amount: 1 }],
      },
      {
        trigger: "on_summon",
        condition: { type: "marker_ally_count_gte", min: 3 },
        effects: [{ type: "atk_delta", target: "adj_allies", delta: 1 }],
      },
    ],
  },
  synergy_v2_12: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "atk_delta", target: "adj_allies", delta: 1 }],
      },
    ],
  },

  // ==============================
  // SNIPE
  // ==============================
  snipe_v2_01: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "expose_self" },
        effects: [{ type: "extra_damage", amount: 1 }],
      },
    ],
  },
  snipe_v2_02: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "mill", count: 1 },
        effects: [{ type: "mana_gain", amount: 1 }],
      },
    ],
  },
  snipe_v2_03: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "spend_marker" },
        effects: [{ type: "push", target: "attack_target", distance: 1 }],
      },
    ],
  },
  snipe_v2_04: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "self_damage", amount: 1 },
        effects: [{ type: "set_piercing" }],
      },
    ],
  },
  snipe_v2_05: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "discard", count: 1 },
        effects: [{ type: "extra_damage", amount: 2 }],
      },
    ],
  },
  snipe_v2_06: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "mana", amount: 1 },
        effects: [{ type: "atk_delta", target: "attack_target", delta: -1, permanent: true }],
      },
    ],
  },
  snipe_v2_07: {
    clauses: [
      {
        trigger: "on_summon",
        costMandatory: true,
        effects: [
          { type: "atk_delta", target: "self", delta: -1, permanent: true },
          { type: "draw", count: 2 },
        ],
      },
    ],
  },
  snipe_v2_08: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "self_bounce" },
        effects: [{ type: "extra_damage", amount: 2 }],
      },
    ],
  },
  snipe_v2_09: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "vp", amount: 1 },
        effects: [
          { type: "rotate", target: "attack_target", degrees: "any" },
          { type: "atk_delta", target: "attack_target", delta: -1, permanent: true },
        ],
      },
    ],
  },
  snipe_v2_10: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "skip_next_turn" },
        effects: [
          { type: "extra_damage", amount: 3 },
          { type: "set_piercing" },
        ],
      },
    ],
  },
  snipe_v2_11: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "vp", amount: 1 },
        effects: [
          { type: "extra_damage", amount: 2 },
          { type: "give_marker", target: "self", marker: "piercing" },
        ],
      },
    ],
  },
  snipe_v2_12: {
    clauses: [
      {
        trigger: "on_attack",
        cost: { type: "sacrifice_ally" },
        effects: [
          { type: "extra_damage", amount: 3 },
          { type: "push", target: "attack_target", distance: 1 },
        ],
      },
    ],
  },

  // ==============================
  // TRICK
  // ==============================
  trick_v2_01: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "rotate", target: "select_enemy", degrees: "either" },
        ],
      },
    ],
  },
  trick_v2_02: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "rotate", target: "select_adj_enemy", degrees: "either" },
        ],
      },
    ],
  },
  trick_v2_03: {
    clauses: [
      {
        trigger: "on_summon",
        cost: { type: "discard", count: 1 },
        effects: [{ type: "mana_gain", amount: 1 }],
      },
    ],
  },
  trick_v2_04: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "swap_positions", target: "select_adj_ally" }],
      },
    ],
  },
  trick_v2_05: {
    clauses: [
      {
        trigger: "on_attack",
        condition: { type: "self_in_b_position" },
        effects: [{ type: "extra_damage", amount: 1 }],
      },
    ],
  },
  trick_v2_06: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "push", target: "select_adj_enemy", distance: 1 }],
      },
    ],
  },
  trick_v2_07: {
    clauses: [
      {
        trigger: "on_attack",
        condition: { type: "self_in_b_position" },
        effects: [{ type: "extra_damage", amount: 1 }],
      },
    ],
  },
  trick_v2_08: {
    clauses: [
      {
        trigger: "on_attack",
        effects: [{ type: "rotate", target: "attack_target", degrees: "any" }],
      },
    ],
  },
  trick_v2_09: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [
          { type: "rotate", target: "select_adj_enemy", degrees: "any" },
        ],
      },
    ],
  },
  trick_v2_10: {
    clauses: [
      {
        trigger: "passive",
        condition: { type: "empty_cell_count_gte", min: 5 },
        effects: [{ type: "atk_delta", target: "self", delta: 1 }],
      },
    ],
  },
  trick_v2_11: {
    clauses: [
      {
        trigger: "on_attack",
        condition: { type: "self_in_b_position" },
        effects: [{ type: "draw", count: 1 }],
      },
    ],
  },
  trick_v2_12: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "rotate", target: "select_enemy", degrees: "any" }],
      },
      {
        trigger: "on_summon",
        condition: { type: "b_position_ally_count_gte", min: 3 },
        effects: [{ type: "draw", count: 1 }],
      },
    ],
  },
  // ==============================
  // GEO (地脈)
  // ==============================
  geo_v2_01: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "set_cell_attr", target: "self_cell", mode: "self_attr" }],
      },
    ],
  },
  geo_v2_02: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "set_cell_attr", target: "adj_cells", mode: "opposite" }],
      },
    ],
  },
  geo_v2_03: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "set_cell_attr", target: "select_any_cell", mode: "self_attr" }],
      },
    ],
  },
  geo_v2_04: {
    clauses: [
      {
        trigger: "on_summon",
        effects: [{ type: "set_cell_attr", target: "select_adj_cell", mode: "self_attr" }],
      },
    ],
  },
};

// ============================================================
// ウルトスペック
// ============================================================

export const ULT_SPECS: Record<string, UltSpec> = {
  aggro_v2_09: {
    vpCost: 2,
    timing: "next_turn_onwards",
    clauses: [
      {
        trigger: "on_ult_activate",
        effects: [{ type: "give_marker", target: "self", marker: "piercing" }],
      },
    ],
  },
  aggro_v2_12: {
    vpCost: 3,
    timing: "next_turn_onwards",
    clauses: [
      {
        trigger: "on_ult_activate",
        effects: [
          { type: "hp_delta", target: "front_row_enemies", amount: -5 },
          { type: "set_hp", target: "self", hp: 1 },
        ],
      },
    ],
  },
  tank_v2_08: {
    vpCost: 2,
    timing: "immediate",
    clauses: [
      {
        trigger: "on_ult_activate",
        effects: [{ type: "team_damage_reduction" }],
      },
    ],
  },
  tank_v2_10: {
    vpCost: 3,
    timing: "immediate",
    clauses: [
      {
        trigger: "on_ult_activate",
        effects: [
          { type: "full_heal", target: "adj_allies" },
          { type: "give_marker", target: "adj_allies", marker: "protection" },
        ],
      },
    ],
  },
  control_v2_09: {
    vpCost: 3,
    timing: "next_turn_onwards",
    clauses: [
      {
        trigger: "on_ult_activate",
        effects: [{ type: "atk_steal", target: "select_enemy", amount: 2 }],
      },
    ],
  },
  control_v2_10: {
    vpCost: 3,
    timing: "next_turn_onwards",
    clauses: [
      {
        trigger: "on_ult_activate",
        effects: [
          {
            type: "atk_delta",
            target: "all_enemies",
            delta: -1,
            permanent: true,
          },
        ],
      },
    ],
  },
  synergy_v2_10: {
    vpCost: 3,
    timing: "next_turn_onwards",
    clauses: [
      {
        trigger: "on_ult_activate",
        effects: [
          {
            type: "atk_delta",
            target: "all_allies",
            delta: 1,
            permanent: true,
          },
          {
            type: "hp_delta",
            target: "all_allies",
            amount: 1,
            permanent: true,
          },
        ],
      },
    ],
  },
  synergy_v2_12: {
    vpCost: 3,
    timing: "immediate",
    clauses: [
      {
        trigger: "on_ult_activate",
        effects: [
          { type: "give_marker", target: "all_allies", marker: "protection" },
          { type: "give_marker", target: "all_allies", marker: "evasion" },
          { type: "give_marker", target: "all_allies", marker: "piercing" },
          { type: "give_marker", target: "all_allies", marker: "quickness" },
        ],
      },
    ],
  },
  snipe_v2_09: {
    vpCost: 2,
    timing: "immediate",
    clauses: [
      {
        trigger: "on_ult_activate",
        cost: { type: "discard", count: 1 },
        costMandatory: true,
        effects: [
          {
            type: "hp_delta",
            target: "select_enemy",
            amount: -4,
            piercing: true,
          },
        ],
      },
    ],
  },
  snipe_v2_12: {
    vpCost: 3,
    timing: "immediate",
    clauses: [
      {
        trigger: "on_ult_activate",
        cost: { type: "self_damage", amount: 2 },
        costMandatory: true,
        effects: [
          {
            type: "hp_delta",
            target: "select_enemy",
            amount: -5,
            piercing: true,
            ignoreDistance: true,
          },
        ],
      },
    ],
  },
  trick_v2_09: {
    vpCost: 3,
    timing: "immediate",
    clauses: [
      {
        trigger: "on_ult_activate",
        effects: [
          { type: "swap_positions", target: "select_any" },
          { type: "rotate", target: "select_any", degrees: "any" },
        ],
      },
    ],
  },
  trick_v2_12: {
    vpCost: 2,
    timing: "immediate",
    clauses: [
      { trigger: "on_ult_activate", effects: [{ type: "immune", turns: 1 }] },
    ],
  },
};

// ============================================================
// アイテムスペック
// ============================================================

export const ITEM_SPECS: Record<string, ItemSpec> = {
  item_01: {
    clauses: [{ trigger: "on_use", effects: [{ type: "draw", count: 2 }] }],
  },
  item_02: {
    clauses: [
      { trigger: "on_use", effects: [{ type: "mana_gain", amount: 1 }] },
    ],
  },
  item_03: {
    clauses: [
      {
        trigger: "on_use",
        effects: [{ type: "heal", target: "select_ally", amount: 3 }],
      },
    ],
  },
  item_04: {
    clauses: [
      {
        trigger: "on_use",
        effects: [
          { type: "atk_delta", target: "select_ally", delta: 2, turns: 1 },
        ],
      },
    ],
  },
  item_05: {
    clauses: [
      {
        trigger: "on_use",
        effects: [
          {
            type: "atk_delta",
            target: "select_enemy",
            delta: -2,
            permanent: true,
          },
        ],
      },
    ],
  },
  item_06: {
    clauses: [
      {
        trigger: "on_use",
        effects: [{ type: "hp_delta", target: "select_enemy", amount: -2 }],
      },
    ],
  },
  item_14: {
    clauses: [
      {
        trigger: "on_use",
        effects: [
          { type: "rotate", target: "select_enemy", degrees: 180 },
          { type: "dir_lock", target: "select_enemy", turns: 1 },
        ],
      },
    ],
  },
  item_20: {
    clauses: [
      {
        trigger: "on_use",
        effects: [
          { type: "rotate", target: "select_enemy", degrees: "either" },
        ],
      },
    ],
  },
  item_bounce_enemy: {
    clauses: [
      {
        trigger: "on_use",
        effects: [{ type: "bounce", target: "select_enemy", maxCost: 2 }],
      },
    ],
  },
  item_element_swap: {
    clauses: [
      {
        trigger: "on_use",
        effects: [{ type: "element_swap", target: "select_ally" }],
      },
    ],
  },
  item_grant_piercing: {
    clauses: [
      {
        trigger: "on_use",
        effects: [
          { type: "give_marker", target: "select_ally", marker: "piercing" },
        ],
      },
    ],
  },
  item_grant_protection: {
    clauses: [
      {
        trigger: "on_use",
        effects: [
          { type: "give_marker", target: "select_ally", marker: "protection" },
        ],
      },
    ],
  },
  item_reactivate: {
    clauses: [
      {
        trigger: "on_use",
        effects: [{ type: "clear_has_acted", target: "select_ally" }],
      },
    ],
  },
  item_self_bounce: {
    clauses: [
      {
        trigger: "on_use",
        effects: [{ type: "bounce", target: "select_ally" }],
      },
    ],
  },
};

// ============================================================
// ルックアップ
// ============================================================

const EMPTY_SPEC: CardEffectSpec = { clauses: [] };

export function getEffectSpec(cardId: string): CardEffectSpec {
  return EFFECT_SPECS[cardId] ?? EMPTY_SPEC;
}

export function getUltSpec(cardId: string): UltSpec | null {
  return ULT_SPECS[cardId] ?? null;
}

export function getItemSpec(itemId: string): ItemSpec | null {
  return ITEM_SPECS[itemId] ?? null;
}
