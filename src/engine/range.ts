/**
 * 攻撃範囲エンジン
 * AttackRange + Direction → 有効ターゲットセル計算
 */
import type { AttackRange, AttackType, BlindPattern, Direction } from '../types/card';
import type { Position, GameState } from '../types/game';

/**
 * 方向に基づいて相対オフセットを絶対座標に変換。
 * relRow: 負=前方, 正=後方
 * relCol: 負=左, 正=右
 */
function relativeToAbsolute(
  pos: Position,
  direction: Direction,
  relRow: number,
  relCol: number,
): Position | null {
  let absRow: number;
  let absCol: number;

  switch (direction) {
    case 'up':
      absRow = pos.row + relRow;
      absCol = pos.col + relCol;
      break;
    case 'down':
      absRow = pos.row - relRow;
      absCol = pos.col - relCol;
      break;
    case 'right':
      absRow = pos.row + relCol;
      absCol = pos.col - relRow;
      break;
    case 'left':
      absRow = pos.row - relCol;
      absCol = pos.col + relRow;
      break;
  }

  if (absRow < 0 || absRow > 2 || absCol < 0 || absCol > 2) return null;
  return { row: absRow, col: absCol };
}

/** 範囲タイプから相対オフセットリストを返す (relRow, relCol) */
export function getRangeOffsets(range: AttackRange): { relRow: number; relCol: number }[] {
  switch (range) {
    case 'front1':
      return [{ relRow: -1, relCol: 0 }];
    case 'front_back':
      return [{ relRow: -1, relCol: 0 }, { relRow: 1, relCol: 0 }];
    case 'front2_line':
      return [{ relRow: -1, relCol: 0 }, { relRow: -2, relCol: 0 }];
    case 'front_row':
      return [{ relRow: -1, relCol: -1 }, { relRow: -1, relCol: 0 }, { relRow: -1, relCol: 1 }];
    case 'snipe':
      // 前・左・右の全直線（背後以外）
      return [
        { relRow: -1, relCol: 0 }, { relRow: -2, relCol: 0 }, // 前方2マス
        { relRow: 0, relCol: -1 }, { relRow: 0, relCol: -2 }, // 左2マス
        { relRow: 0, relCol: 1 }, { relRow: 0, relCol: 2 },   // 右2マス
      ];
    case 'cross':
      // 前後左右の隣接4マス
      return [
        { relRow: -1, relCol: 0 }, // 前
        { relRow: 1, relCol: 0 },  // 後
        { relRow: 0, relCol: -1 }, // 左
        { relRow: 0, relCol: 1 },  // 右
      ];
    case 'front_left':
      // 正面 + 左の2マス（同時攻撃）
      return [{ relRow: -1, relCol: 0 }, { relRow: 0, relCol: -1 }];
    case 'front_right':
      // 正面 + 右の2マス（同時攻撃）
      return [{ relRow: -1, relCol: 0 }, { relRow: 0, relCol: 1 }];
    case 'magic':
      // 全域: ボード上の自分以外の全セル（呼び出し側で処理）
      return [];
  }
}

/**
 * 攻撃範囲内の有効セル座標を返す（占有チェックなし）。
 * magic の場合は自分以外の全セルを返す。
 */
export function getValidTargetCells(
  position: Position,
  direction: Direction,
  range: AttackRange,
): Position[] {
  if (range === 'magic') {
    const cells: Position[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        if (r === position.row && c === position.col) continue;
        cells.push({ row: r, col: c });
      }
    }
    return cells;
  }

  const offsets = getRangeOffsets(range);
  const cells: Position[] = [];
  for (const { relRow, relCol } of offsets) {
    const abs = relativeToAbsolute(position, direction, relRow, relCol);
    if (abs) cells.push(abs);
  }
  return cells;
}

/**
 * 攻撃可能なターゲットを返す。
 * - front_back: 味方も含む（friendly fire）
 * - 他の物理範囲: 敵のみ
 * - magic: ボード上の全敵
 */
export function getAttackTargets(
  state: GameState,
  position: Position,
  character: { owner: number; direction: Direction; card: { attackRange: AttackRange; attackType: AttackType } },
): Position[] {
  const cells = getValidTargetCells(position, character.direction, character.card.attackRange);

  return cells.filter(pos => {
    const cell = state.board[pos.row][pos.col];
    if (!cell.character) return false;

    // front_back は味方にもあたる
    if (character.card.attackRange === 'front_back') {
      return true;
    }

    // それ以外は敵のみ
    return cell.character.owner !== character.owner;
  });
}

/**
 * 防御側の攻撃範囲に攻撃者がいるか（反撃判定用）。
 * ブラインド（背後）からの攻撃は反撃不可。
 */
export function isInAttackRange(
  defenderPos: Position,
  defender: { direction: Direction; card: { attackRange: AttackRange; attackType: AttackType } },
  attackerPos: Position,
): boolean {
  const cells = getValidTargetCells(defenderPos, defender.direction, defender.card.attackRange);
  return cells.some(c => c.row === attackerPos.row && c.col === attackerPos.col);
}

/**
 * 方向ベースの相対位置を絶対座標に変換（隣接1マス）。
 */
function getRelativePosition(
  pos: Position,
  direction: Direction,
  rel: 'front' | 'back' | 'left' | 'right',
): Position | null {
  // front=向いてる方向, back=逆, left/right=横
  const deltas: Record<Direction, Record<string, { dr: number; dc: number }>> = {
    up:    { front: { dr: -1, dc: 0 }, back: { dr: 1, dc: 0 }, left: { dr: 0, dc: -1 }, right: { dr: 0, dc: 1 } },
    down:  { front: { dr: 1, dc: 0 }, back: { dr: -1, dc: 0 }, left: { dr: 0, dc: 1 }, right: { dr: 0, dc: -1 } },
    left:  { front: { dr: 0, dc: -1 }, back: { dr: 0, dc: 1 }, left: { dr: 1, dc: 0 }, right: { dr: -1, dc: 0 } },
    right: { front: { dr: 0, dc: 1 }, back: { dr: 0, dc: -1 }, left: { dr: -1, dc: 0 }, right: { dr: 1, dc: 0 } },
  };
  const { dr, dc } = deltas[direction][rel];
  const r = pos.row + dr;
  const c = pos.col + dc;
  if (r < 0 || r > 2 || c < 0 || c > 2) return null;
  return { row: r, col: c };
}

/**
 * BlindPatternからブラインドセル一覧を返す。
 */
export function getBlindPositions(
  pos: Position,
  direction: Direction,
  pattern: BlindPattern,
): Position[] {
  if (pattern === 'none') return [];
  const positions: Position[] = [];
  const dirs: ('front' | 'back' | 'left' | 'right')[] =
    pattern === 'back' ? ['back'] :
    pattern === 'sides' ? ['left', 'right'] :
    pattern === 'back_sides' ? ['back', 'left', 'right'] :
    /* all */ ['front', 'back', 'left', 'right'];
  for (const d of dirs) {
    const p = getRelativePosition(pos, direction, d);
    if (p) positions.push(p);
  }
  return positions;
}

/**
 * カードのブラインドパターンを取得（省略時のデフォルト付き）。
 */
export function getEffectiveBlindPattern(card: { attackType: AttackType; blindPattern?: BlindPattern }): BlindPattern {
  if (card.blindPattern !== undefined) return card.blindPattern;
  return card.attackType === 'magic' ? 'all' : 'back';
}

/**
 * 攻撃者がターゲットのブラインドスポットにいるか判定。
 * ブラインド = 反撃不可 + ダメージ+1。
 */
export function isBlindSpot(
  targetPos: Position,
  target: { direction: Direction; card: { attackRange: AttackRange; attackType: AttackType; blindPattern?: BlindPattern } },
  attackerPos: Position,
): boolean {
  const pattern = getEffectiveBlindPattern(target.card);
  const blindCells = getBlindPositions(targetPos, target.direction, pattern);
  return blindCells.some(c => c.row === attackerPos.row && c.col === attackerPos.col);
}
