import { describe, it, expect } from 'vitest';
import {
  getSummonEffect,
  applyAutoEffects,
  resolveSummonAutoAttack,
  type AutoEffect,
  type SummonEffectSpec,
} from '../src/engine/effects.js';
import type { Board, CharInstance, PlayerState } from '../src/engine/types.js';
import type { CharCardDef } from '../src/engine/gamestate.js';

// ============================================================
// テストヘルパー
// ============================================================

function makeChar(owner: 0 | 1, opts: Partial<CharInstance> = {}): CharInstance {
  return {
    cardId: 'test_v2_01', owner,
    hp: 3, maxHp: 3, atk: 2, baseAtk: 2, dir: 0,
    hasActed: false, hasRotated: false, ultUsed: false,
    keywords: [],
    markers: { protection: 0, evasion: 0, piercing: 0, quickness: 0 },
    status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 0, dirLocked: 0, immune: 0 },
    ...opts,
  };
}

function makePlayer(opts: Partial<PlayerState> = {}): PlayerState {
  return { factions: [], itemSet: 'A', vp: 0, mana: 0, hand: [], deck: [], discard: [], ...opts };
}

function emptyBoard(): Board {
  return Array(9).fill(null);
}

function makeDef(opts: Partial<CharCardDef> = {}): CharCardDef {
  return {
    id: 'aggro_v2_01', name: 'テスト', faction: 'aggro',
    cost: 2, vp: 1, hp: 3, atk: 2, reactivation_cost: 2,
    attribute: '拳', attack_cells: [[1, 0]], attack_type: '物理',
    keywords: [], effect: '', ult: null,
    ...opts,
  };
}

// ============================================================
// getSummonEffect
// ============================================================
describe('getSummonEffect', () => {
  it('登録されたカードIDは正しいspecを返す', () => {
    const spec = getSummonEffect('tank_v2_02');
    expect(spec.autoEffects).toHaveLength(1);
    expect(spec.autoEffects[0]).toMatchObject({ tag: 'give_marker_adj_allies', marker: 'protection' });
    expect(spec.hasPending).toBe(false);
  });

  it('未登録IDはNONEを返す（autoEffects=[],hasPending=false）', () => {
    const spec = getSummonEffect('nonexistent_v2_01');
    expect(spec.autoEffects).toHaveLength(0);
    expect(spec.hasPending).toBe(false);
  });

  it('ペンディング系カードはhasPending=true', () => {
    expect(getSummonEffect('control_v2_01').hasPending).toBe(true);
    expect(getSummonEffect('synergy_v2_01').hasPending).toBe(true);
    expect(getSummonEffect('trick_v2_01').hasPending).toBe(true);
  });

  it('synergy_v2_07: atk_delta_adj_allies +1', () => {
    const spec = getSummonEffect('synergy_v2_07');
    expect(spec.autoEffects[0]).toMatchObject({ tag: 'atk_delta_adj_allies', delta: 1 });
  });

  it('synergy_v2_08: heal_adj_allies + conditional atk', () => {
    const spec = getSummonEffect('synergy_v2_08');
    expect(spec.autoEffects[0]).toMatchObject({ tag: 'heal_adj_allies', amount: 1 });
    expect(spec.autoEffects[1]).toMatchObject({ tag: 'cond_marker_ally_gte', minAllies: 3 });
  });

  it('aggro_v2_11: damage_adj_enemies 3', () => {
    const spec = getSummonEffect('aggro_v2_11');
    expect(spec.autoEffects[0]).toMatchObject({ tag: 'damage_adj_enemies', amount: 3 });
  });

  it('control_v2_09: steal_mana 2', () => {
    const spec = getSummonEffect('control_v2_09');
    expect(spec.autoEffects[0]).toMatchObject({ tag: 'steal_mana', amount: 2 });
  });

  it('tank_v2_09: give_marker_self_and_adj_allies + heal', () => {
    const spec = getSummonEffect('tank_v2_09');
    expect(spec.autoEffects[0]).toMatchObject({ tag: 'give_marker_self_and_adj_allies', marker: 'protection' });
    expect(spec.autoEffects[1]).toMatchObject({ tag: 'heal_adj_allies', amount: 1 });
  });
});

// ============================================================
// applyAutoEffects — give_marker_adj_allies
// ============================================================
describe('applyAutoEffects: give_marker_adj_allies (protection)', () => {
  //  盤面レイアウト (3×3):  0 1 2
  //                         3 4 5
  //                         6 7 8
  // idx=4 に summoner(P0), idx=1・3・5・7 に隣接、idx=0・2・6・8 は斜め

  const fx: AutoEffect[] = [{ tag: 'give_marker_adj_allies', marker: 'protection' }];
  const players: [PlayerState, PlayerState] = [makePlayer(), makePlayer()];

  it('隣接する味方に protection マーカーを付与', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);              // summoner
    board[1] = makeChar(0);              // adj ally (up)
    board[3] = makeChar(0);              // adj ally (left)

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.markers.protection).toBe(1);
    expect(nb[3]?.markers.protection).toBe(1);
    // summoner 自身は変わらない
    expect(nb[4]?.markers.protection).toBe(0);
  });

  it('斜めのマスは対象外', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[0] = makeChar(0);  // diagonal, not adjacent

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[0]?.markers.protection).toBe(0);
  });

  it('隣接する敵には付与しない', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(1);  // enemy

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.markers.protection).toBe(0);
  });

  it('隣接に味方がいなければ何も変わらない', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb).toEqual(board);
  });

  it('既存のマーカーに積み重ね可能', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0 } });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.markers.protection).toBe(2);
  });

  it('元の board を変更しない（immutability）', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0);
    const origProt = board[1]!.markers.protection;

    applyAutoEffects(board, players, 4, 0, fx);
    expect(board[1]!.markers.protection).toBe(origProt);
  });
});

// ============================================================
// applyAutoEffects — give_marker_self_and_adj_allies
// ============================================================
describe('applyAutoEffects: give_marker_self_and_adj_allies', () => {
  const fx: AutoEffect[] = [{ tag: 'give_marker_self_and_adj_allies', marker: 'protection' }];
  const players: [PlayerState, PlayerState] = [makePlayer(), makePlayer()];

  it('summoner 自身にも protection を付与', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0);

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[4]?.markers.protection).toBe(1);
    expect(nb[1]?.markers.protection).toBe(1);
  });
});

// ============================================================
// applyAutoEffects — give_marker_self
// ============================================================
describe('applyAutoEffects: give_marker_self', () => {
  const fx: AutoEffect[] = [{ tag: 'give_marker_self', marker: 'protection' }];
  const players: [PlayerState, PlayerState] = [makePlayer(), makePlayer()];

  it('summoner 自身のみに protection を付与', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0);

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[4]?.markers.protection).toBe(1);
    expect(nb[1]?.markers.protection).toBe(0);  // 隣接味方は変わらない
  });
});

// ============================================================
// applyAutoEffects — heal_adj_allies
// ============================================================
describe('applyAutoEffects: heal_adj_allies', () => {
  const fx: AutoEffect[] = [{ tag: 'heal_adj_allies', amount: 2 }];
  const players: [PlayerState, PlayerState] = [makePlayer(), makePlayer()];

  it('隣接味方を amount 回復', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { hp: 1, maxHp: 3 });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.hp).toBe(3);
  });

  it('maxHp を超えない', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { hp: 3, maxHp: 3 });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.hp).toBe(3);  // キャップ
  });

  it('summoner 自身は回復しない', () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { hp: 1, maxHp: 5 });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[4]?.hp).toBe(1);  // 変わらない
  });

  it('隣接敵は回復しない', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(1, { hp: 1, maxHp: 3 });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.hp).toBe(1);
  });
});

// ============================================================
// applyAutoEffects — atk_delta_adj_allies
// ============================================================
describe('applyAutoEffects: atk_delta_adj_allies', () => {
  const fxPlus: AutoEffect[] = [{ tag: 'atk_delta_adj_allies', delta: 1 }];
  const fxMinus: AutoEffect[] = [{ tag: 'atk_delta_adj_allies', delta: -1 }];
  const players: [PlayerState, PlayerState] = [makePlayer(), makePlayer()];

  it('隣接味方の ATK を +1', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { atk: 2 });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fxPlus);
    expect(nb[1]?.atk).toBe(3);
  });

  it('隣接敵の ATK は変わらない', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(1, { atk: 2 });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fxPlus);
    expect(nb[1]?.atk).toBe(2);
  });

  it('ATK が 0 以下にはならない（デバフの場合）', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { atk: 0 });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fxMinus);
    expect(nb[1]?.atk).toBe(0);
  });
});

// ============================================================
// applyAutoEffects — damage_adj_enemies
// ============================================================
describe('applyAutoEffects: damage_adj_enemies', () => {
  const fx: AutoEffect[] = [{ tag: 'damage_adj_enemies', amount: 3 }];
  const players: [PlayerState, PlayerState] = [makePlayer(), makePlayer()];

  it('隣接する敵に 3 ダメージ', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(1, { hp: 5, maxHp: 5 });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.hp).toBe(2);
  });

  it('HP が 0 以下になったら撃破（null）', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(1, { hp: 3, maxHp: 3 });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]).toBeNull();
  });

  it('隣接する味方はダメージを受けない', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { hp: 3, maxHp: 3 });  // ally

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.hp).toBe(3);
  });
});

// ============================================================
// applyAutoEffects — steal_mana
// ============================================================
describe('applyAutoEffects: steal_mana', () => {
  const fx: AutoEffect[] = [{ tag: 'steal_mana', amount: 2 }];

  it('相手から 2 マナ奪う（十分あれば）', () => {
    const players: [PlayerState, PlayerState] = [makePlayer({ mana: 3 }), makePlayer({ mana: 5 })];
    const board = emptyBoard();
    board[4] = makeChar(0);

    const { players: np } = applyAutoEffects(board, players, 4, 0, fx);
    expect(np[0].mana).toBe(5);   // 3+2
    expect(np[1].mana).toBe(3);   // 5-2
  });

  it('相手のマナが足りない場合は持っている分だけ奪う', () => {
    const players: [PlayerState, PlayerState] = [makePlayer({ mana: 0 }), makePlayer({ mana: 1 })];
    const board = emptyBoard();
    board[4] = makeChar(0);

    const { players: np } = applyAutoEffects(board, players, 4, 0, fx);
    expect(np[0].mana).toBe(1);
    expect(np[1].mana).toBe(0);
  });

  it('P1がsummonerの場合はP0から奪う', () => {
    const players: [PlayerState, PlayerState] = [makePlayer({ mana: 4 }), makePlayer({ mana: 1 })];
    const board = emptyBoard();
    board[4] = makeChar(1);

    const { players: np } = applyAutoEffects(board, players, 4, 1, fx);
    expect(np[1].mana).toBe(3);
    expect(np[0].mana).toBe(2);
  });
});

// ============================================================
// applyAutoEffects — cond_marker_ally_gte（条件付き効果）
// ============================================================
describe('applyAutoEffects: cond_marker_ally_gte', () => {
  const fx: AutoEffect[] = [{
    tag: 'cond_marker_ally_gte',
    minAllies: 3,
    then: { tag: 'atk_delta_adj_allies', delta: 1 },
  }];
  const players: [PlayerState, PlayerState] = [makePlayer(), makePlayer()];

  it('マーカー持ち味方が3体以上 → then効果を発動', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);         // summoner
    board[1] = makeChar(0, { atk: 2 });  // adj ally (target)
    // マーカー持ち味方 3体（隣接・非隣接混在）
    board[0] = makeChar(0, { markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0 } });
    board[2] = makeChar(0, { markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0 } });
    board[6] = makeChar(0, { markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0 } });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.atk).toBe(3);  // ATK+1 発動
  });

  it('マーカー持ち味方が 2体 → then効果は発動しない', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { atk: 2 });
    board[0] = makeChar(0, { markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0 } });
    board[2] = makeChar(0, { markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0 } });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.atk).toBe(2);  // 変わらない
  });

  it('永続キーワードもマーカーバフとしてカウント', () => {
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { atk: 2 });
    // keywords持ち3体
    board[0] = makeChar(0, { keywords: ['防護'] });
    board[2] = makeChar(0, { keywords: ['先制'] });
    board[6] = makeChar(0, { keywords: ['回避'] });

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.atk).toBe(3);
  });
});

// ============================================================
// applyAutoEffects — 複合エフェクト（多段）
// ============================================================
describe('applyAutoEffects: multi effects', () => {
  it('heal + give_marker を順番に適用', () => {
    const fx: AutoEffect[] = [
      { tag: 'heal_adj_allies', amount: 2 },
      { tag: 'give_marker_adj_allies', marker: 'protection' },
    ];
    const board = emptyBoard();
    board[4] = makeChar(0);
    board[1] = makeChar(0, { hp: 1, maxHp: 3 });
    const players: [PlayerState, PlayerState] = [makePlayer(), makePlayer()];

    const { board: nb } = applyAutoEffects(board, players, 4, 0, fx);
    expect(nb[1]?.hp).toBe(3);
    expect(nb[1]?.markers.protection).toBe(1);
  });
});

// ============================================================
// resolveSummonAutoAttack
// ============================================================
describe('resolveSummonAutoAttack', () => {
  const noCost = (_: string) => 1;

  it('攻撃範囲に敵がいなければ攻撃しない', () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0 });  // P0, facing up → attacks idx 1
    // idx 1 is empty

    const def = makeDef({ attack_cells: [[1, 0]] });  // 前方1マス
    const { results } = resolveSummonAutoAttack(board, 4, def, [false, false], noCost);
    expect(results).toHaveLength(0);
  });

  it('攻撃範囲に敵がいれば攻撃する', () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0, atk: 2 });  // faces up, attacks idx 1
    // dir=2(DOWN): 敵がsummonerの方を向く → B位置にならない
    board[1] = makeChar(1, { hp: 5, maxHp: 5, dir: 2 });

    const def = makeDef({ attack_cells: [[1, 0]] });
    const { board: nb, results } = resolveSummonAutoAttack(board, 4, def, [false, false], noCost);
    expect(results).toHaveLength(1);
    expect(results[0]?.targetIdx).toBe(1);
    expect(nb[1]?.hp).toBe(3);  // 5 - 2 = 3
  });

  it('複数の攻撃範囲マスに敵がいれば全て攻撃', () => {
    //  0 1 2
    //  3 4 5
    //  6 7 8
    // idx=4 facing up(0), attack_cells [[1,0],[0,1]] → idx1(上), idx5(右)
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0, atk: 2 });
    board[1] = makeChar(1, { hp: 5, maxHp: 5 });
    board[5] = makeChar(1, { hp: 5, maxHp: 5 });

    const def = makeDef({ attack_cells: [[1, 0], [0, 1]] });
    const { results } = resolveSummonAutoAttack(board, 4, def, [false, false], noCost);
    expect(results).toHaveLength(2);
  });

  it('attack_cells=null のキャラは攻撃しない', () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0 });
    board[1] = makeChar(1, { hp: 3 });

    const def = makeDef({ attack_cells: null });
    const { results } = resolveSummonAutoAttack(board, 4, def, [false, false], noCost);
    expect(results).toHaveLength(0);
  });

  it('魔法（attack_cells=all）は全敵を攻撃', () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0, atk: 1 });
    board[0] = makeChar(1, { hp: 3 });
    board[8] = makeChar(1, { hp: 3 });

    const def = makeDef({ attack_cells: 'all', attack_type: '魔法' });
    const { results } = resolveSummonAutoAttack(board, 4, def, [false, false], noCost);
    expect(results).toHaveLength(2);
  });

  it('teamDR が有効なら敵はダメージ-1', () => {
    const board = emptyBoard();
    board[4] = makeChar(0, { dir: 0, atk: 3 });
    // dir=2: B位置にならないよう敵がsummonerを向く
    board[1] = makeChar(1, { hp: 5, maxHp: 5, dir: 2 });

    const def = makeDef({ attack_cells: [[1, 0]] });
    // teamDR[1] = true → P1のキャラはダメージ-1 (3-1=2)
    const { board: nb } = resolveSummonAutoAttack(board, 4, def, [false, true], noCost);
    expect(nb[1]?.hp).toBe(3);  // 5 - (3-1) = 3
  });

  it('攻撃者が反撃で撃破されたら以降の攻撃をスキップ', () => {
    const board = emptyBoard();
    // P0 summoner: ATK=1, HP=1
    board[4] = makeChar(0, { dir: 0, atk: 1, hp: 1, maxHp: 1 });
    // P1 enemy at idx1: ATK=2, facing DOWN(2) → faces summoner → can counter
    board[1] = makeChar(1, { hp: 5, maxHp: 5, atk: 2, dir: 2, keywords: [] });
    // P1 another enemy at idx5: would be second target
    board[5] = makeChar(1, { hp: 5, maxHp: 5 });

    const def = makeDef({ attack_cells: [[1, 0], [0, 1]] });
    const { board: nb, results } = resolveSummonAutoAttack(board, 4, def, [false, false], noCost);
    // summoner should be dead after counter from idx1 (ATK=2 vs HP=1)
    expect(nb[4]).toBeNull();  // summoner killed by counter
    // idx5 not attacked (summoner already dead)
    // Only 1 result (the first attack that also killed summoner)
    expect(results).toHaveLength(1);
    expect(nb[5]?.hp).toBe(5);  // untouched
  });
});
