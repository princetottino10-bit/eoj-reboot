import type { Card, CharacterCard, ItemCard } from './types/card';
import type { GameState } from './types/game';
import { V2_CHARACTERS } from './data/cards-v2';
import { ITEM_SETS } from './data/cards';
import { createGameState, drawCards } from './engine/state';
import { startTurn, endTurn } from './engine/actions';
import { runMinimaxTurn, debugActionScores } from './engine/minimax-ai';
import { getAceEffectiveCost } from './engine/rules';
import { isCharacter } from './types/card';

const FORMER_ACE_NAMES = new Set([
  '覇王のカイザー',
  '天城のバスティア',
  '蝕心のミスズ',
  '集星のアルス',
  '滅線のアイン',
  '転界のオボロ',
]);

function buildDualFactionDeck(
  faction1Chars: CharacterCard[],
  faction2Chars: CharacterCard[],
  items: ItemCard[],
): Card[] {
  const chars: Card[] = [];
  for (const c of faction1Chars) chars.push({ ...c, id: `${c.id}_d0` });
  for (const c of faction2Chars) chars.push({ ...c, id: `${c.id}_d1` });
  const itemCards: Card[] = items.map((item, i) => ({ ...item, id: `${item.id}_d${i}` }));
  return [...chars, ...itemCards];
}

function makeState(p0Factions: [string, string], p1Factions: [string, string]): GameState {
  const p0Chars1 = V2_CHARACTERS.filter(c => c.faction === p0Factions[0]);
  const p0Chars2 = V2_CHARACTERS.filter(c => c.faction === p0Factions[1]);
  const p1Chars1 = V2_CHARACTERS.filter(c => c.faction === p1Factions[0]);
  const p1Chars2 = V2_CHARACTERS.filter(c => c.faction === p1Factions[1]);
  const deck1 = buildDualFactionDeck(p0Chars1, p0Chars2, ITEM_SETS.D);
  const deck2 = buildDualFactionDeck(p1Chars1, p1Chars2, ITEM_SETS.D);
  let state = createGameState(deck1, deck2);
  state = { ...state, players: [drawCards(state.players[0], 5), drawCards(state.players[1], 5)] };
  return startTurn(state);
}

function describeAction(action: ReturnType<typeof debugActionScores>[number]['action']): string {
  switch (action.type) {
    case 'summon':
      return `summon ${action.cardId} @(${action.pos.row},${action.pos.col}) ${action.dir}`;
    case 'attack':
      return `attack (${action.pos.row},${action.pos.col}) -> (${action.targetPos.row},${action.targetPos.col})`;
    case 'item':
      return `item ${action.cardId}`;
    case 'skip_draw':
      return `skip_draw ${action.cardId}`;
    case 'end_turn':
      return 'end_turn';
  }
}

for (let trial = 1; trial <= 30; trial++) {
  let state = makeState(['aggro', 'tank'], ['control', 'synergy']);

  for (let step = 0; step < 20 && state.phase !== 'game_over'; step++) {
    const pid = state.currentPlayer;
    const hand = state.players[pid].hand.filter(isCharacter);
    const aceInHand = hand.find(card =>
      FORMER_ACE_NAMES.has(card.name)
      && getAceEffectiveCost(state, pid, card) + (state.summonCountThisTurn >= 1 ? 1 : 0) <= state.players[pid].mana,
    );

    if (aceInHand) {
      console.log(`trial=${trial} turn=${state.turnNumber} player=${pid} mana=${state.players[pid].mana}`);
      console.log(`ace in hand: ${aceInHand.name} cost=${aceInHand.manaCost} effective=${getAceEffectiveCost(state, pid, aceInHand)}`);
      console.log('hand:', hand.map(c => `${c.name}(C${c.manaCost})`).join(', '));
      const scores = debugActionScores(state, 2);
      for (const row of scores.slice(0, 12)) {
        console.log(`${describeAction(row.action)} | minimax=${row.minimaxScore} bias=${row.bias} total=${row.totalScore}`);
      }
      const aceScores = scores.filter(r => r.action.type === 'summon' && r.action.cardId === aceInHand.id);
      console.log('ace summon candidates:');
      for (const row of aceScores) {
        console.log(`${describeAction(row.action)} | minimax=${row.minimaxScore} bias=${row.bias} total=${row.totalScore}`);
      }
      process.exit(0);
    }

    state = runMinimaxTurn(state, 2);
    if (state.phase !== 'game_over' && state.currentPlayer === pid) {
      state = endTurn(state);
    }
  }
}

console.log('No affordable former ace found in sampled trials.');
