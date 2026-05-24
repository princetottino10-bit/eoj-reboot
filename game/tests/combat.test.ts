import { describe, it, expect, beforeEach } from 'vitest';
import {
  resolveAttack,
  calcDamage,
  canCounterAttack,
  type AttackResult,
} from '../src/engine/combat.js';
import { DIR_UP, DIR_DOWN, DIR_LEFT, DIR_RIGHT } from '../src/engine/board.js';
import type { Board, CharInstance } from '../src/engine/types.js';

// ============================================================
// テスト用ヘルパー
// ============================================================

function makeChar(overrides: Partial<CharInstance> & { owner: 0 | 1 }): CharInstance {
  return {
    cardId: 'test',
    hp: 3,
    maxHp: 3,
    atk: 2,
    baseAtk: 2,
    dir: DIR_UP,
    hasActed: false,
    hasRotated: false,
    ultUsed: false,
    summonedOnTurn: 0,
    keywords: [],
    markers: { protection: 0, evasion: 0, piercing: 0, quickness: 0, aim: 0 },
    status: {
      brainwashedTurns: 0,
      brainwashedBy: null,
      actionTax: 0,
      actionTaxBy: null,
      dirLocked: 0,
      immune: 0,
    },
    tempAtkBuff: 0,
    ...overrides,
  };
}

function makeBoard(): Board {
  return Array(9).fill(null);
}

// ============================================================
// ダメージ計算（calcDamage）
// ============================================================
describe('calcDamage', () => {
  it('基本ダメージ: ATKがそのまま', () => {
    const attacker = makeChar({ owner: 0, atk: 3 });
    const defender = makeChar({ owner: 1 });
    expect(calcDamage(attacker, defender, { isBlind: false, teamDR: false })).toBe(3);
  });

  it('B位置ボーナス: ATK+1', () => {
    const attacker = makeChar({ owner: 0, atk: 2 });
    const defender = makeChar({ owner: 1 });
    expect(calcDamage(attacker, defender, { isBlind: true, teamDR: false })).toBe(3);
  });

  it('防護キーワード: ダメージ-1', () => {
    const attacker = makeChar({ owner: 0, atk: 3 });
    const defender = makeChar({ owner: 1, keywords: ['防護'] });
    expect(calcDamage(attacker, defender, { isBlind: false, teamDR: false })).toBe(2);
  });

  it('防護マーカー: ダメージ-1', () => {
    const attacker = makeChar({ owner: 0, atk: 3 });
    const defender = makeChar({ owner: 1, markers: { protection: 1, evasion: 0, piercing: 0, quickness: 0, aim: 0 } });
    expect(calcDamage(attacker, defender, { isBlind: false, teamDR: false })).toBe(2);
  });

  it('防護でダメージが0を下回らない', () => {
    const attacker = makeChar({ owner: 0, atk: 1 });
    const defender = makeChar({ owner: 1, keywords: ['防護'] });
    expect(calcDamage(attacker, defender, { isBlind: false, teamDR: false })).toBe(0);
  });

  it('チームDR: ダメージ-1', () => {
    const attacker = makeChar({ owner: 0, atk: 3 });
    const defender = makeChar({ owner: 1 });
    expect(calcDamage(attacker, defender, { isBlind: false, teamDR: true })).toBe(2);
  });

  it('防護+チームDR: ダメージ-2', () => {
    const attacker = makeChar({ owner: 0, atk: 4 });
    const defender = makeChar({ owner: 1, keywords: ['防護'] });
    expect(calcDamage(attacker, defender, { isBlind: false, teamDR: true })).toBe(2);
  });

  it('貫通: 防護を無視', () => {
    const attacker = makeChar({ owner: 0, atk: 2, keywords: ['貫通'] });
    const defender = makeChar({ owner: 1, keywords: ['防護'] });
    expect(calcDamage(attacker, defender, { isBlind: false, teamDR: false })).toBe(2);
  });

  it('貫通マーカー: 防護を無視', () => {
    const attacker = makeChar({ owner: 0, atk: 2, markers: { protection: 0, evasion: 0, piercing: 1, quickness: 0, aim: 0 } });
    const defender = makeChar({ owner: 1, keywords: ['防護'] });
    expect(calcDamage(attacker, defender, { isBlind: false, teamDR: false })).toBe(2);
  });

  it('B位置+防護: ATK+1 から防護-1', () => {
    const attacker = makeChar({ owner: 0, atk: 3 });
    const defender = makeChar({ owner: 1, keywords: ['防護'] });
    expect(calcDamage(attacker, defender, { isBlind: true, teamDR: false })).toBe(3); // 3+1-1=3
  });
});

// ============================================================
// 反撃可否（canCounterAttack）
// ============================================================
// 前提: 物理攻撃かつ攻撃者が防衛者の attack_cells 射程内にいて
//       かつ B 位置でないとき反撃可
describe('canCounterAttack', () => {
  // attack_cells [[1,0]] = 正面1マス攻撃、weakness_cells [[-1,0]] = 真後ろがBスポット

  it('射程内かつB位置でない → 反撃可 (UP)', () => {
    // 防衛者 idx=4 UP、attack_cells=[[1,0]] → idx=1。攻撃者 idx=1
    expect(canCounterAttack(4, DIR_UP, [[1, 0]], 1, [[-1, 0]])).toBe(true);
  });

  it('射程外 → 反撃不可（後ろから攻撃）', () => {
    // 防衛者 idx=4 UP、attack_cells=[[1,0]] → idx=1。攻撃者 idx=7（後ろ）
    expect(canCounterAttack(4, DIR_UP, [[1, 0]], 7, [[-1, 0]])).toBe(false);
  });

  it('射程内かつB位置でない → 反撃可 (DOWN)', () => {
    // 防衛者 idx=4 DOWN、attack_cells=[[1,0]] → idx=7。攻撃者 idx=7
    expect(canCounterAttack(4, DIR_DOWN, [[1, 0]], 7, [[-1, 0]])).toBe(true);
  });

  it('射程内かつB位置でない → 反撃可 (RIGHT)', () => {
    // 防衛者 idx=4 RIGHT、attack_cells=[[1,0]] → idx=5。攻撃者 idx=5
    expect(canCounterAttack(4, DIR_RIGHT, [[1, 0]], 5, [[-1, 0]])).toBe(true);
  });

  it('射程外（横）→ 反撃不可', () => {
    // 防衛者 idx=4 RIGHT、attack_cells=[[1,0]] → idx=5。攻撃者 idx=3（左）
    expect(canCounterAttack(4, DIR_RIGHT, [[1, 0]], 3, [[-1, 0]])).toBe(false);
  });

  it('attack_cells=null → 反撃不可', () => {
    expect(canCounterAttack(4, DIR_UP, null, 1, [[-1, 0]])).toBe(false);
  });

  it('attack_cells="all" かつ B 位置でない → 反撃可', () => {
    // 防衛者 idx=4 UP、"all" 射程。攻撃者 idx=5（B位置でない）
    expect(canCounterAttack(4, DIR_UP, 'all', 5, [[-1, 0]])).toBe(true);
  });

  it('B 位置から攻撃 → 反撃不可（射程内でも）', () => {
    // 防衛者 idx=4 UP、weakness=[[-1,0]] → B位置=idx=7（真後ろ）
    // attack_cells=[[1,0]] では idx=7 は射程外だが、
    // 'all' を使えば射程内。それでも B位置優先 → 反撃不可
    expect(canCounterAttack(4, DIR_UP, 'all', 7, [[-1, 0]])).toBe(false);
  });

  it('攻撃者が射程内でない隣接マス → 反撃不可', () => {
    // 防衛者 idx=4 UP、attack_cells=[[1,0]]（正面のみ）。攻撃者 idx=3（左）
    expect(canCounterAttack(4, DIR_UP, [[1, 0]], 3, [[-1, 0]])).toBe(false);
  });
});

// ============================================================
// 攻撃解決（resolveAttack）
// ============================================================
describe('resolveAttack', () => {
  // ボード配置:
  //  [_][P2][_]   row=0
  //  [_][P1][_]   row=1
  //  [_][_ ][_]   row=2
  // P1(idx=4, UP向き) が P2(idx=1) を攻撃

  let board: Board;
  let p1: CharInstance;
  let p2: CharInstance;

  beforeEach(() => {
    board = makeBoard();
    p1 = makeChar({ owner: 0, atk: 2, hp: 5, maxHp: 5, dir: DIR_UP });
    p2 = makeChar({ owner: 1, atk: 2, hp: 4, maxHp: 4, dir: DIR_DOWN });
    board[4] = p1;
    board[1] = p2;
  });

  it('基本攻撃: 防衛者のHPが減る', () => {
    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.defenderDamage).toBe(2);
    expect(board[1]!.hp).toBe(2); // 4 - 2 = 2
  });

  it('正面からの攻撃(B位置なし): 反撃が発生する', () => {
    // P1(idx=4,UP)がP2(idx=1,DOWN)を攻撃。P2の attack_cells=[[1,0]]→idx=4にP1がいる → 反撃可
    const result = resolveAttack(board, 4, 1, {
      teamDR: [false, false],
      defenderAttackCells: [[1, 0]],
    });
    expect(result.counterDamage).toBe(2);
    expect(board[4]!.hp).toBe(3); // P1も反撃を受ける: 5 - 2 = 3
  });

  it('B位置から攻撃: ダメージ+1、反撃なし', () => {
    // P1を index 7 (P2の真後ろ = P2のDOWN向き時の後方=上) に移動
    // P2 は DOWN向き, weakness = [[-1,0]] = ローカル後方 = ボード上 = index 1
    // P1 が DOWN向きのP2の後方(index 1の上=上側)から攻撃するため、P1をindex 4に置いてP2をindex 7に移動
    board[4] = null;
    board[7] = null;
    // 新配置: P2(idx=4, DOWN向き), P1(idx=1, UP向き)
    p2 = makeChar({ owner: 1, atk: 2, hp: 4, maxHp: 4, dir: DIR_DOWN });
    p1 = makeChar({ owner: 0, atk: 2, hp: 5, maxHp: 5, dir: DIR_UP });
    board[4] = p2;
    board[1] = p1;
    // P1(idx=1) が P2(idx=4) を攻撃
    // P2(DOWN向き) の weakness[[-1,0]] → ローカル後方 = ボード上 = idx 1 がP1の位置 → B位置
    const weakCells: [number,number][] = [[-1, 0]];
    const result = resolveAttack(board, 1, 4, { teamDR: [false, false], weaknessCells: weakCells });
    expect(result.isBlind).toBe(true);
    expect(result.defenderDamage).toBe(3); // 2 + 1 (B位置ボーナス)
    expect(result.counterDamage).toBe(0); // B位置なので反撃なし
    expect(board[4]!.hp).toBe(1); // 4 - 3 = 1
    expect(board[1]!.hp).toBe(5); // 反撃なし
  });

  it('防護持ち防衛者: ダメージ-1', () => {
    p2.keywords = ['防護'];
    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.defenderDamage).toBe(1); // 2 - 1
    expect(board[1]!.hp).toBe(3);
  });

  it('回避マーカーで物理攻撃を無効化、マーカー消費', () => {
    p2.markers.evasion = 1;
    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.evaded).toBe(true);
    expect(result.defenderDamage).toBe(0);
    expect(board[1]!.hp).toBe(4); // ダメージなし
    expect(board[1]!.markers.evasion).toBe(0); // マーカー消費
  });

  it('回避キーワードで物理攻撃を無効化', () => {
    p2.keywords = ['回避'];
    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.evaded).toBe(true);
    expect(board[1]!.hp).toBe(4);
  });

  it('貫通: 回避を無視', () => {
    p1.keywords = ['貫通'];
    p2.markers.evasion = 1;
    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.evaded).toBe(false);
    expect(result.defenderDamage).toBe(2);
    expect(board[1]!.markers.evasion).toBe(1); // 消費されない
  });

  it('貫通: 防護を無視', () => {
    p1.keywords = ['貫通'];
    p2.keywords = ['防護'];
    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.defenderDamage).toBe(2); // 防護無視
  });

  it('先制: 防衛者が先にダメージを与える', () => {
    p2.keywords = ['先制'];
    p2.hp = 2; // 先制反撃で倒されると攻撃が来ない
    p2.maxHp = 2;
    const result = resolveAttack(board, 4, 1, {
      teamDR: [false, false],
      defenderAttackCells: [[1, 0]],
    });
    // P2(先制)が先に反撃 → P1にATK=2のダメージ → P1残り3HP
    expect(result.counterFirst).toBe(true);
    expect(board[4]!.hp).toBe(3); // 5 - 2
  });

  it('HP0以下で撃破', () => {
    p2.hp = 1;
    p2.maxHp = 1;
    resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(board[1]).toBeNull(); // 撃破 → 盤面から除去
  });

  it('撃破でVPを返す', () => {
    p2.hp = 1;
    p2.maxHp = 1;
    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.vpAwarded).toBeGreaterThan(0);
  });

  it('反撃で攻撃者を撃破 → counterVpAwarded が返る', () => {
    // P2(DEF, ATK=3) の反撃で P1(ATK, HP=1) を倒す
    p1.hp = 1; p1.maxHp = 1;
    p2.atk = 3;
    const result = resolveAttack(board, 4, 1, {
      teamDR: [false, false],
      attackerCost: 2,
      defenderAttackCells: [[1, 0]],
    });
    expect(board[4]).toBeNull();               // 攻撃者撃破
    expect(result.counterVpAwarded).toBe(1);  // cost=2 → 1VP
  });

  it('反撃で攻撃者を撃破しない → counterVpAwarded=0', () => {
    p1.hp = 5; p1.maxHp = 5;
    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.counterVpAwarded).toBe(0);
  });

  it('先制反撃で攻撃者撃破 → counterVpAwarded が返る', () => {
    p1.hp = 1; p1.maxHp = 1;
    p2.keywords = ['先制'];
    const result = resolveAttack(board, 4, 1, {
      teamDR: [false, false],
      attackerCost: 3,
      defenderAttackCells: [[1, 0]],
    });
    expect(board[4]).toBeNull();
    expect(result.counterFirst).toBe(true);
    expect(result.counterVpAwarded).toBe(2);  // cost=3-4 → 2VP
  });

  it('反撃ダメージに teamDR が適用される', () => {
    // P1(owner=0) が teamDR 適用中 → 受ける反撃ダメージ -1
    // P2(ATK=3) の反撃: 3 - teamDR(1) = 2
    p1.hp = 5; p1.maxHp = 5;
    p2.atk = 3;
    const result = resolveAttack(board, 4, 1, {
      teamDR: [true, false],
      defenderAttackCells: [[1, 0]],
    });
    expect(result.counterDamage).toBe(2); // 3 - 1(teamDR) = 2
    expect(board[4]!.hp).toBe(3);        // 5 - 2 = 3
  });

  it('魔法攻撃では反撃しない', () => {
    // attackType='magic' かつ defenderAttackCells があっても反撃なし
    const result = resolveAttack(board, 4, 1, {
      teamDR: [false, false],
      attackType: 'magic',
      defenderAttackCells: [[1, 0]],
    });
    expect(result.counterDamage).toBe(0);
    expect(board[4]!.hp).toBe(5); // 反撃なし
  });

  it('defenderAttackCells を渡さないと反撃なし', () => {
    // デフォルト null → 反撃不可
    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.counterDamage).toBe(0);
    expect(board[4]!.hp).toBe(5);
  });

  it('攻撃者が射程外 → 反撃なし', () => {
    // P2(idx=1,DOWN) の attack_cells=[[2,0]] は射程2正面=idx=7（P1はidx=4、射程1正面）
    const result = resolveAttack(board, 4, 1, {
      teamDR: [false, false],
      defenderAttackCells: [[2, 0]], // 2マス前方のみ
    });
    expect(result.counterDamage).toBe(0);
  });
});

// ============================================================
// カバー
// ============================================================
describe('カバー', () => {
  it('カバー持ちの隣接味方がいると、そちらがダメージを受ける', () => {
    const board = makeBoard();
    const attacker = makeChar({ owner: 0, atk: 3, dir: DIR_UP });
    const target = makeChar({ owner: 1, hp: 5, maxHp: 5, dir: DIR_DOWN });
    const cover = makeChar({ owner: 1, hp: 5, maxHp: 5, keywords: ['カバー'] });
    board[4] = attacker;
    board[1] = target;  // 攻撃対象
    board[2] = cover;   // カバー役（targetと隣接）

    resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(board[1]!.hp).toBe(5); // ターゲットはダメージを受けない
    expect(board[2]!.hp).toBe(2); // カバー役が3ダメージ受ける
  });

  it('カバー発動時: 原則として反撃なし', () => {
    const board = makeBoard();
    const attacker = makeChar({ owner: 0, atk: 3, hp: 5, maxHp: 5, dir: DIR_UP });
    const target = makeChar({ owner: 1, hp: 5, maxHp: 5, dir: DIR_DOWN });
    const cover = makeChar({ owner: 1, hp: 5, maxHp: 5, keywords: ['カバー'], dir: DIR_DOWN });
    board[4] = attacker;
    board[1] = target;
    board[2] = cover;

    resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(board[4]!.hp).toBe(5); // 攻撃者は反撃を受けない
  });

  it('カバー役が要塞持ちなら反撃する', () => {
    // 攻撃者(ATK=2)がカバー役(ATK=3,要塞+カバー)に肩代わりされ、カバー役が反撃
    // カバー役が受けるダメージ: 2 (ターゲット基準=防護なし)
    // 要塞カバーが攻撃者に反撃: 3ダメ
    const board = makeBoard();
    const attacker = makeChar({ owner: 0, atk: 2, hp: 5, maxHp: 5, dir: DIR_UP });
    const target   = makeChar({ owner: 1, hp: 5, maxHp: 5, dir: DIR_DOWN });
    const cover    = makeChar({ owner: 1, hp: 5, maxHp: 5, atk: 3, keywords: ['カバー', '要塞'] });
    board[4] = attacker;
    board[1] = target;
    board[2] = cover; // idx=2 は idx=1 に隣接

    resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(board[2]!.hp).toBe(3); // カバー役: 5 - 2 = 3
    expect(board[4]!.hp).toBe(2); // 攻撃者: 5 - 3(要塞反撃) = 2
    expect(board[1]!.hp).toBe(5); // ターゲット: ダメージなし
  });

  it('カバー発動時: 防護はターゲット基準で計算', () => {
    const board = makeBoard();
    const attacker = makeChar({ owner: 0, atk: 3, dir: DIR_UP });
    // ターゲットが防護持ち → ダメージは防護分減算してカバー役が受ける
    const target = makeChar({ owner: 1, hp: 5, maxHp: 5, keywords: ['防護'], dir: DIR_DOWN });
    const cover = makeChar({ owner: 1, hp: 5, maxHp: 5, keywords: ['カバー'] });
    board[4] = attacker;
    board[1] = target;
    board[2] = cover;

    resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(board[1]!.hp).toBe(5);  // ターゲットはダメージなし
    expect(board[2]!.hp).toBe(3);  // カバー役は 3 - 1(防護) = 2ダメージ: 5-2=3
  });
});

// ============================================================
// 要塞
// ============================================================
describe('要塞', () => {
  it('要塞キャラは自分から攻撃できない', () => {
    const board = makeBoard();
    const fortress = makeChar({ owner: 0, keywords: ['要塞'], dir: DIR_UP });
    const enemy = makeChar({ owner: 1, dir: DIR_DOWN });
    board[4] = fortress;
    board[1] = enemy;

    const result = resolveAttack(board, 4, 1, { teamDR: [false, false], isInitiatedByFortress: true });
    expect(result.blocked).toBe(true);
    expect(board[1]!.hp).toBe(3); // ダメージなし
  });
});

// ============================================================
// チームDR（ルミナのウルト効果）
// ============================================================
describe('チームDR', () => {
  it('teamDR=true のプレイヤーの味方はダメージ-1', () => {
    const board = makeBoard();
    const attacker = makeChar({ owner: 0, atk: 3, dir: DIR_UP });
    const defender = makeChar({ owner: 1, hp: 4, maxHp: 4, dir: DIR_DOWN });
    board[4] = attacker;
    board[1] = defender;

    // P2(owner=1)がteamDR適用中
    resolveAttack(board, 4, 1, { teamDR: [false, true] });
    expect(board[1]!.hp).toBe(2); // 4 - (3 - 1) = 2
  });
});

// ============================================================
// 無敵（immune）
// ============================================================
describe('immune', () => {
  it('immune > 0 のキャラはダメージを受けない', () => {
    const board = makeBoard();
    const attacker = makeChar({ owner: 0, atk: 3, dir: DIR_UP });
    const defender = makeChar({
      owner: 1, hp: 3, maxHp: 3, dir: DIR_DOWN,
      status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 1 },
    });
    board[4] = attacker;
    board[1] = defender;

    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.defenderDamage).toBe(0);
    expect(board[1]!.hp).toBe(3); // HP変化なし
    expect(board[1]).not.toBeNull(); // 生存
  });

  it('immune > 0 のキャラは反撃でもダメージを受けない', () => {
    const board = makeBoard();
    const attacker = makeChar({
      owner: 0, atk: 3, hp: 5, maxHp: 5, dir: DIR_UP,
      status: { brainwashedTurns: 0, brainwashedBy: null, actionTax: 0, actionTaxBy: null, dirLocked: 0, immune: 1 },
    });
    const defender = makeChar({ owner: 1, hp: 3, maxHp: 3, dir: DIR_DOWN, atk: 3 });
    board[4] = attacker;
    board[1] = defender;

    const result = resolveAttack(board, 4, 1, { teamDR: [false, false] });
    expect(result.counterDamage).toBe(0);
    expect(board[4]!.hp).toBe(5); // HP変化なし
  });
});
