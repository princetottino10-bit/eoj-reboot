import { findCoverAlly, getAttackCells, isBlindSpot } from "./board.js";
import type {
  Board,
  CellIndex,
  CharInstance,
  Direction,
  RelCoord,
} from "./types.js";

// ============================================================
// 型
// ============================================================

export interface AttackOptions {
  teamDR: [boolean, boolean];
  /** 防衛者の weakness_cells（省略時はデフォルト [[-1,0]]） */
  weaknessCells?: RelCoord[];
  /** 要塞キャラが自分から攻撃しようとしているフラグ */
  isInitiatedByFortress?: boolean;
  /** 攻撃の種類（省略時は物理） */
  attackType?: "physical" | "magic";
  /** 防衛者のカードコスト（撃破時VP計算用、省略時は 1VP） */
  defenderCost?: number;
  /** 攻撃者のカードコスト（反撃撃破時のVP計算用、省略時は 1VP） */
  attackerCost?: number;
  /** 防衛者の attack_cells（反撃範囲判定用。null なら反撃不可） */
  defenderAttackCells?: "all" | null | [number, number][];
  /** 攻撃者のpassive ATK補正（省略時は0） */
  attackerPassiveAtkBonus?: number;
  /** 防衛者のpassive ATK補正（省略時は0）。反撃ダメージに適用 */
  defenderPassiveAtkBonus?: number;
  /** 攻撃者が no_counterattack passive を持つか（省略時false） */
  attackerNoCounterAttack?: boolean;
  /** 防衛者が omnidirectional_counter passive を持つか（省略時false） */
  defenderOmniCounter?: boolean;
}

export interface AttackResult {
  blocked: boolean; // 要塞により攻撃自体がブロックされた
  evaded: boolean; // 回避により攻撃が無効化された
  isBlind: boolean; // B位置から攻撃したか
  counterFirst: boolean; // 先制反撃が先に発生したか
  defenderDamage: number; // 防衛者（またはカバー役）が受けたダメージ量
  counterDamage: number; // 攻撃者が受けた反撃ダメージ量
  vpAwarded: number; // 防衛者撃破で獲得するVP（攻撃側に帰属）
  counterVpAwarded: number; // 反撃で攻撃者を撃破した際のVP（防衛側に帰属）
  defenderManaGain: number; // 防衛者撃破時にオーナーが得るマナ（通常1）
  attackerManaGain: number; // 反撃撃破時に攻撃者オーナーが得るマナ（通常1）
}

export interface DamageOptions {
  isBlind: boolean;
  teamDR: boolean;
  attackType?: "physical" | "magic";
}

// ============================================================
// キーワード・マーカー判定
// ============================================================

/** キーワードを「持っているか」を判定（永続キーワード OR マーカー） */
function hasKw(char: CharInstance, kw: string): boolean {
  if (char.keywords.includes(kw)) return true;
  switch (kw) {
    case "防護":
      return char.markers.protection > 0;
    case "回避":
      return char.markers.evasion > 0;
    case "貫通":
      return char.markers.piercing > 0;
    case "先制":
      return char.markers.quickness > 0;
    default:
      return false;
  }
}

/** 消費型マーカーを1つ消費する（キーワードは消費しない） */
function consumeMarker(char: CharInstance, kw: string): void {
  switch (kw) {
    case "防護":
      if (char.markers.protection > 0) char.markers.protection--;
      break;
    case "回避":
      if (char.markers.evasion > 0) char.markers.evasion--;
      break;
    case "貫通":
      if (char.markers.piercing > 0) char.markers.piercing--;
      break;
    case "先制":
      if (char.markers.quickness > 0) char.markers.quickness--;
      break;
  }
}

// ============================================================
// VP計算
// ============================================================

export function vpForCost(cost: number): number {
  if (cost <= 4) return 1;
  if (cost <= 6) return 2;
  return 3;
}

// ============================================================
// ダメージ計算（適用はしない）
// ============================================================

export function calcDamage(
  attacker: CharInstance,
  defender: CharInstance,
  opts: DamageOptions,
  passiveAtkBonus = 0,
): number {
  const hasPiercing = hasKw(attacker, "貫通");
  let dmg = attacker.atk + (attacker.tempAtkBuff ?? 0) + passiveAtkBonus;
  if (opts.isBlind && opts.attackType !== "magic") dmg += 2;
  if (!hasPiercing && hasKw(defender, "防護")) dmg -= 1;
  if (opts.teamDR) dmg -= 1;
  return Math.max(0, dmg);
}

// ============================================================
// 反撃可否判定
// ============================================================

/**
 * 防衛者が反撃可能かを判定する。
 * 条件: 攻撃が物理であること（呼び出し側で確認）、かつ
 *   1. 攻撃者が防衛者の B 位置にいない（omnidirectionalCounter=true なら免除）
 *   2. 攻撃者が防衛者の attack_cells 射程内にいる
 */
export function canCounterAttack(
  defenderIdx: CellIndex,
  defenderDir: Direction,
  defenderAttackCells: "all" | null | [number, number][],
  attackerIdx: CellIndex,
  weaknessCells: RelCoord[],
  omnidirectionalCounter = false,
): boolean {
  if (
    !omnidirectionalCounter &&
    isBlindSpot(attackerIdx, defenderIdx, defenderDir, weaknessCells)
  )
    return false;
  if (defenderAttackCells === null) return false;
  if (defenderAttackCells === "all") return true;
  const cells = getAttackCells(defenderIdx, defenderAttackCells, defenderDir);
  return cells?.includes(attackerIdx) ?? false;
}

// ============================================================
// ダメージ適用・撃破処理
// ============================================================

interface ApplyResult {
  damage: number;
  vpAwarded: number;
  manaGain: number;
}

export function clearAffiliatedEffects(board: Board, deadCardId: string): void {
  for (let i = 0; i < 9; i++) {
    const c = board[i];
    if (c == null) continue;
    if (c.status.brainwashedBy === deadCardId)
      board[i] = {
        ...c,
        status: { ...c.status, brainwashedTurns: 0, brainwashedBy: null },
      } as typeof c;
    if (c.status.actionTaxBy === deadCardId)
      board[i] = {
        ...c,
        status: { ...c.status, actionTax: 0, actionTaxBy: null },
      } as typeof c;
  }
}

function applyDamage(
  board: Board,
  targetIdx: CellIndex,
  amount: number,
  defenderCost = 1,
): ApplyResult {
  const char = board[targetIdx];
  if (char == null) return { damage: 0, vpAwarded: 0, manaGain: 0 };
  if (char.status.immune > 0) return { damage: 0, vpAwarded: 0, manaGain: 0 };
  const actual = Math.max(0, amount);
  char.hp -= actual;
  if (char.hp <= 0) {
    const deadCardId = char.cardId;
    board[targetIdx] = null;
    clearAffiliatedEffects(board, deadCardId);
    return { damage: actual, vpAwarded: vpForCost(defenderCost), manaGain: 1 };
  }
  return { damage: actual, vpAwarded: 0, manaGain: 0 };
}

// ============================================================
// 攻撃解決（盤面を直接変更する）
// ============================================================

export function resolveAttack(
  board: Board,
  attackerIdx: CellIndex,
  defenderIdx: CellIndex,
  opts: AttackOptions,
): AttackResult {
  const EMPTY: AttackResult = {
    blocked: false,
    evaded: false,
    isBlind: false,
    counterFirst: false,
    defenderDamage: 0,
    counterDamage: 0,
    vpAwarded: 0,
    counterVpAwarded: 0,
    defenderManaGain: 0,
    attackerManaGain: 0,
  };

  const attacker = board[attackerIdx];
  const defender = board[defenderIdx];
  if (attacker == null || defender == null) return EMPTY;

  // 要塞は自ら攻撃できない
  if (opts.isInitiatedByFortress) {
    return { ...EMPTY, blocked: true };
  }

  const attackType = opts.attackType ?? "physical";
  const hasPiercing = hasKw(attacker, "貫通");
  const weakCells: RelCoord[] = opts.weaknessCells ?? [[-1, 0]];
  const blind = isBlindSpot(attackerIdx, defenderIdx, defender.dir, weakCells);
  const defOwner = defender.owner;

  // ---- カバー処理 ----------------------------------------
  const coverIdx = findCoverAlly(board, defenderIdx);
  if (coverIdx !== null && attackType === "physical") {
    // biome-ignore lint/style/noNonNullAssertion: coverIdx found by non-null board scan
    const coverChar = board[coverIdx]!;

    // 回避はターゲット（防衛者）基準でチェック
    if (!hasPiercing) {
      if (hasKw(defender, "回避")) {
        consumeMarker(defender, "回避");
        return { ...EMPTY, evaded: true, isBlind: blind };
      }
    }

    // ダメージ計算: ターゲット(防衛者)の防護を適用してカバー役が受ける
    const dmg = calcDamage(attacker, defender, {
      isBlind: blind,
      teamDR: opts.teamDR[defOwner],
      attackType,
    });
    if (!hasPiercing) consumeMarker(defender, "防護");

    const { damage: covDmg, vpAwarded: covVp, manaGain: covMana } = applyDamage(
      board,
      coverIdx,
      dmg,
      opts.defenderCost ?? 1,
    );

    // 反撃: 要塞カバーのみ（反撃はカバーされないため攻撃者に直接）
    let counterDmg = 0;
    let counterVp = 0;
    let counterMana = 0;
    if (board[coverIdx] != null && hasKw(coverChar, "要塞")) {
      const counterDmgRaw = Math.max(
        0,
        coverChar.atk -
          (hasKw(attacker, "防護") ? 1 : 0) -
          (opts.teamDR[attacker.owner] ? 1 : 0),
      );
      const cr = applyDamage(
        board,
        attackerIdx,
        counterDmgRaw,
        opts.attackerCost ?? 1,
      );
      counterDmg = cr.damage;
      counterVp = cr.vpAwarded;
      counterMana = cr.manaGain;
    }

    return {
      blocked: false,
      evaded: false,
      isBlind: blind,
      counterFirst: false,
      defenderDamage: covDmg,
      counterDamage: counterDmg,
      vpAwarded: covVp,
      counterVpAwarded: counterVp,
      defenderManaGain: covMana,
      attackerManaGain: counterMana,
    };
  }

  // ---- 通常攻撃（カバーなし / 魔法） --------------------

  // 回避チェック（物理のみ有効）
  if (!hasPiercing && attackType === "physical") {
    if (hasKw(defender, "回避")) {
      consumeMarker(defender, "回避");
      return { ...EMPTY, evaded: true, isBlind: blind };
    }
  }

  // 先制判定
  const defHasQuick = hasKw(defender, "先制");
  const attackerPassiveAtk = opts.attackerPassiveAtkBonus ?? 0;
  const defenderPassiveAtk = opts.defenderPassiveAtkBonus ?? 0;
  const canCounter =
    attackType === "physical" &&
    !opts.attackerNoCounterAttack &&
    canCounterAttack(
      defenderIdx,
      defender.dir,
      opts.defenderAttackCells ?? null,
      attackerIdx,
      weakCells,
      opts.defenderOmniCounter ?? false,
    );

  let counterDmg = 0;
  let counterVp = 0;
  let counterMana = 0;
  let counterFirst = false;

  const attackerOwner = attacker.owner;

  // 先制反撃（攻撃が来る前に反撃）
  if (canCounter && defHasQuick && board[attackerIdx] != null) {
    counterFirst = true;
    const counterDmgRaw = Math.max(
      0,
      defender.atk +
        defenderPassiveAtk -
        (hasKw(attacker, "防護") ? 1 : 0) -
        (opts.teamDR[attackerOwner] ? 1 : 0),
    );
    const cr = applyDamage(
      board,
      attackerIdx,
      counterDmgRaw,
      opts.attackerCost ?? 1,
    );
    counterDmg = cr.damage;
    counterVp = cr.vpAwarded;
    counterMana = cr.manaGain;

    // 先制で攻撃者が死亡 → 攻撃自体が来ない
    if (board[attackerIdx] == null) {
      return {
        ...EMPTY,
        isBlind: blind,
        counterFirst: true,
        counterDamage: counterDmg,
        counterVpAwarded: counterVp,
        attackerManaGain: counterMana,
      };
    }
  }

  // メイン攻撃
  const dmg = calcDamage(
    attacker,
    defender,
    { isBlind: blind, teamDR: opts.teamDR[defOwner], attackType },
    attackerPassiveAtk,
  );
  if (!hasPiercing) consumeMarker(defender, "防護");

  const { damage: defDmg, vpAwarded, manaGain: defMana } = applyDamage(
    board,
    defenderIdx,
    dmg,
    opts.defenderCost ?? 1,
  );

  // 通常反撃（先制でない場合、防衛者が生存している場合）
  if (
    canCounter &&
    !defHasQuick &&
    board[defenderIdx] != null &&
    board[attackerIdx] != null
  ) {
    const counterDmgRaw = Math.max(
      0,
      defender.atk +
        defenderPassiveAtk -
        (hasKw(attacker, "防護") ? 1 : 0) -
        (opts.teamDR[attackerOwner] ? 1 : 0),
    );
    const cr = applyDamage(
      board,
      attackerIdx,
      counterDmgRaw,
      opts.attackerCost ?? 1,
    );
    counterDmg = cr.damage;
    counterVp = cr.vpAwarded;
    counterMana = cr.manaGain;
  }

  return {
    blocked: false,
    evaded: false,
    isBlind: blind,
    counterFirst,
    defenderDamage: defDmg,
    counterDamage: counterDmg,
    vpAwarded,
    counterVpAwarded: counterVp,
    defenderManaGain: defMana,
    attackerManaGain: counterMana,
  };
}
