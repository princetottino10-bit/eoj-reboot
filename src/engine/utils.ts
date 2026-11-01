import type { AttackPattern, Direction, Element } from '../types/card';
import type { Position } from '../types/game';

/**
 * Rotate a 3×3 attack pattern based on direction.
 * The pattern is defined with 'up' as the default facing.
 *  - up:    no rotation
 *  - right: 90° clockwise
 *  - down:  180°
 *  - left:  90° counter-clockwise (= 270° CW)
 */
export function rotateAttackPattern(
  pattern: AttackPattern,
  direction: Direction,
): AttackPattern {
  switch (direction) {
    case 'up':
      return [
        [pattern[0][0], pattern[0][1], pattern[0][2]],
        [pattern[1][0], pattern[1][1], pattern[1][2]],
        [pattern[2][0], pattern[2][1], pattern[2][2]],
      ];

    case 'right':
      // 90° CW: new[r][c] = old[2-c][r]
      return [
        [pattern[2][0], pattern[1][0], pattern[0][0]],
        [pattern[2][1], pattern[1][1], pattern[0][1]],
        [pattern[2][2], pattern[1][2], pattern[0][2]],
      ];

    case 'down':
      // 180°: new[r][c] = old[2-r][2-c]
      return [
        [pattern[2][2], pattern[2][1], pattern[2][0]],
        [pattern[1][2], pattern[1][1], pattern[1][0]],
        [pattern[0][2], pattern[0][1], pattern[0][0]],
      ];

    case 'left':
      // 270° CW (= 90° CCW): new[r][c] = old[c][2-r]
      return [
        [pattern[0][2], pattern[1][2], pattern[2][2]],
        [pattern[0][1], pattern[1][1], pattern[2][1]],
        [pattern[0][0], pattern[1][0], pattern[2][0]],
      ];
  }
}

/**
 * Return the opposing element.
 *  faust ↔ geist
 *  gift  ↔ licht
 *  nicht → null (no opposite)
 */
export function getOppositeElement(element: Element): Element | null {
  switch (element) {
    case 'faust': return 'geist';
    case 'geist': return 'faust';
    case 'licht': return 'nacht';
    case 'nacht': return 'licht';
    case 'nicht': return null;
  }
}

/**
 * Calculate HP bonus when a character is placed on a cell.
 *  +2 if character element matches cell element
 *  -2 if character element opposes cell element
 *   0 otherwise (neutral, nicht, or unrelated)
 */
export function calculateHpBonus(charElement: Element, cellElement: Element): number {
  if (charElement === 'nicht' || cellElement === 'nicht') {
    return 0;
  }
  if (charElement === cellElement) {
    return 2;
  }
  if (getOppositeElement(charElement) === cellElement) {
    return -2;
  }
  return 0;
}

/**
 * Return all valid orthogonally adjacent positions on a 3×3 board.
 */
export function getAdjacentPositions(pos: Position): Position[] {
  const deltas: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const result: Position[] = [];
  for (const [dr, dc] of deltas) {
    const row = pos.row + dr;
    const col = pos.col + dc;
    if (row >= 0 && row <= 2 && col >= 0 && col <= 2) {
      result.push({ row, col });
    }
  }
  return result;
}

/**
 * Fisher-Yates shuffle. Returns a new array; does not mutate the input.
 */
export function shuffleArray<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
