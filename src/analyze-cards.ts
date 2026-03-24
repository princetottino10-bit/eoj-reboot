/**
 * カード別パフォーマンス分析
 * トリック派閥のどのカードが勝利に貢献しているか
 */
import type { CharacterCard } from './types/card';
import type { GameState, PlayerId } from './types/game';
import { ALL_CHARACTERS, ALL_ITEMS, ITEM_SETS } from './data/cards';
import { createGameState, drawCards, countControlledCells } from './engine/state';
import { startTurn, endTurn } from './engine/actions';
import { runMinimaxTurn } from './engine/minimax-ai';
import type { ItemCard } from './types/card';

function buildDeck(f1: string, f2: string, itemKey: string) {
  const c1 = ALL_CHARACTERS.filter(c => c.faction === f1);
  const c2 = ALL_CHARACTERS.filter(c => c.faction === f2);
  const items = ITEM_SETS[itemKey as keyof typeof ITEM_SETS];
  return [
    ...c1.map((c, i) => ({ ...c, id: `${c.id}_d${i}` })),
    ...c2.map((c, i) => ({ ...c, id: `${c.id}_d${i}` })),
    ...items.map((item, i) => ({ ...item, id: `${item.id}_d${i}` })),
  ];
}

function runGame(deck1: any[], deck2: any[]): GameState {
  let state = createGameState(deck1, deck2);
  state = { ...state, players: [drawCards(state.players[0], 5), drawCards(state.players[1], 5)] };
  state = startTurn(state);
  let itr = 0;
  while (state.phase !== 'game_over' && itr < 100) {
    try { state = runMinimaxTurn(state, 2); } catch { try { state = endTurn(state); } catch { break; } }
    itr++;
  }
  return state;
}

// トリックを含む全デッキペアで対戦
const factions = ['aggro', 'tank', 'control', 'synergy', 'snipe', 'trick'];
const itemKeys = ['A', 'B', 'C', 'D'];

// カード別スタッツ
const cardStats: Record<string, {
  name: string; cost: number; hp: number; atk: number;
  onBoardWin: number; onBoardLose: number; gamesInDeck: number;
  kills: number;
}> = {};

// トリックカード初期化
for (const c of ALL_CHARACTERS.filter(c => c.faction === 'trick')) {
  cardStats[c.id] = { name: c.name, cost: c.manaCost, hp: c.hp, atk: c.atk, onBoardWin: 0, onBoardLose: 0, gamesInDeck: 0, kills: 0 };
}

// トリックを含むデッキの対戦をサンプリング
let totalGames = 0;
for (const partner of factions.filter(f => f !== 'trick')) {
  for (const enemy1 of factions) {
    for (const enemy2 of factions) {
      if (enemy1 >= enemy2) continue; // 重複排除
      for (const ik of ['A', 'B']) { // 2セットだけ
        const deck1 = buildDeck('trick', partner, ik);
        const deck2 = buildDeck(enemy1, enemy2, 'A');

        const endState = runGame(deck1, deck2);
        totalGames++;

        // トリックカードの集計
        for (const id of Object.keys(cardStats)) {
          cardStats[id].gamesInDeck++;
        }

        // ボード上のトリックカードを集計
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 3; c++) {
            const ch = endState.board[r][c].character;
            if (!ch) continue;
            // 元のカードIDを復元 (_d0 等を除去)
            const baseId = ch.card.id.replace(/_d\d+$/, '');
            if (!(baseId in cardStats)) continue;

            if (ch.owner === 0 && endState.winner === 0) {
              cardStats[baseId].onBoardWin++;
            } else if (ch.owner === 0 && endState.winner === 1) {
              cardStats[baseId].onBoardLose++;
            }
          }
        }
      }
    }
  }
}

console.log(`=== トリック派閥 カード別パフォーマンス (N=${totalGames}) ===\n`);
console.log('勝利時ボード出現 = 勝った時に盤面にいた回数（＝勝利貢献度）');
console.log('敗北時ボード出現 = 負けた時に盤面にいた回数（＝場にいても勝てなかった）\n');

const sorted = Object.entries(cardStats).sort((a, b) => b[1].onBoardWin - a[1].onBoardWin);

console.log('ID          | 名前           | コスト | HP | ATK | 勝利時 | 敗北時 | 勝利貢献率');
console.log('-'.repeat(90));
for (const [id, s] of sorted) {
  const total = s.onBoardWin + s.onBoardLose;
  const winContrib = total > 0 ? ((s.onBoardWin / total) * 100).toFixed(0) : '-';
  console.log(
    `${id.padEnd(12)}| ${s.name.padEnd(14)} | ${String(s.cost).padStart(4)} | ${String(s.hp).padStart(2)} | ${String(s.atk).padStart(3)} | ${String(s.onBoardWin).padStart(6)} | ${String(s.onBoardLose).padStart(6)} | ${winContrib}%`
  );
}
