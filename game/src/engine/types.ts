// ============================================================
// 方向定数
// ============================================================
export const DIR_UP = 0 as const;
export const DIR_RIGHT = 1 as const;
export const DIR_DOWN = 2 as const;
export const DIR_LEFT = 3 as const;
export type Direction = 0 | 1 | 2 | 3;

// ============================================================
// ボード座標
// ============================================================
/** 3×3 盤面のセルインデックス (0〜8). row*3+col */
export type CellIndex = number;
/** [row, col] の盤面絶対座標 */
export type AbsCoord = [row: number, col: number];
/** キャラのローカル座標 ([rr,rc]: rr+=正面, rc+=右) */
export type RelCoord = [rr: number, rc: number];

// ============================================================
// キャラクターインスタンス（盤面上の状態）
// ============================================================
export interface Markers {
  protection: number; // 防護マーカー枚数
  evasion: number;    // 回避マーカー枚数
  piercing: number;   // 貫通マーカー枚数
  quickness: number;  // 先制マーカー枚数
}

export interface StatusEffects {
  brainwashedTurns: number;  // 洗脳残りターン数（0=解除済み）
  brainwashedBy: string | null; // 洗脳付与者のカードID
  actionTax: number;         // 再行動コスト増加量
  dirLocked: number;         // 向き固定残りターン数
  immune: number;            // 無敵残りターン数
}

export interface CharInstance {
  cardId: string;
  owner: 0 | 1;
  hp: number;
  maxHp: number;
  /** 現在の ATK（永続バフ/デバフ込み） */
  atk: number;
  /** カード本来の ATK（参照用） */
  baseAtk: number;
  dir: Direction;
  hasActed: boolean;
  hasRotated: boolean;
  ultUsed: boolean;
  /** カードに印刷されているキーワード（永続、消費しない） */
  keywords: string[];
  markers: Markers;
  status: StatusEffects;
}

export type Board = (CharInstance | null)[];

// ============================================================
// ゲーム全体の状態
// ============================================================
export interface PlayerState {
  factions: string[];
  itemSet: string;
  vp: number;
  mana: number;
  hand: string[];    // カードID配列
  deck: string[];
  discard: string[];
}

export type GameScreen = 'title' | 'draft' | 'pass' | 'game' | 'over';

export interface GameState {
  turn: number;
  active: 0 | 1;
  players: [PlayerState, PlayerState];
  board: Board;
  boardAttrs: string[];  // 9マスの属性
  log: LogEntry[];
  winner: 0 | 1 | -1 | null; // -1=引き分け
  winReason: string;
  ui: UiState;
}

export interface LogEntry {
  text: string;
  type: 'system' | 'damage' | 'heal' | 'info';
}

// ============================================================
// UI 操作状態
// ============================================================
export type UiMode =
  | 'idle'
  | 'hand_selected'        // 手札選択済み → 配置先 or 対象選択待ち
  | 'summon_dir_pending'   // 配置先確定 → 向き選択待ち
  | 'char_selected'        // 盤面キャラ選択済み
  | 'attack_targeting'     // 攻撃対象選択中
  | 'item_targeting'       // アイテム対象選択中
  | 'ult_targeting'        // ウルト対象選択中
  | 'effect_targeting';    // カード効果の対象選択中

export interface UiState {
  mode: UiMode;
  selectedHandIndex: number;
  selectedBoardIndex: number;
  validCells: CellIndex[];   // ハイライト対象
  pendingEffect: PendingEffect | null;
}

// カード効果の解決待ち
export interface PendingEffect {
  type: string;
  payload: Record<string, unknown>;
  resolve: (targetIdx: CellIndex) => void;
}
