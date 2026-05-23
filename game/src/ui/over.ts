import { setState } from './app.js';
import type { GameState } from '../engine/types.js';

export function renderOver(state: GameState): HTMLElement {
  const div = document.createElement('div');
  div.className = 'screen-over';

  let winnerText = '';
  if (state.winner === -1) {
    winnerText = '引き分け';
  } else if (state.winner === 0) {
    winnerText = '<span class="p0-color">プレイヤー1</span>の勝利！';
  } else {
    winnerText = '<span class="p1-color">プレイヤー2</span>の勝利！';
  }

  div.innerHTML = `
    <h2>${winnerText}</h2>
    <p class="over-reason">${state.winReason}</p>
    <div class="score-table">
      <div class="score-row">
        <span class="score-label p0-color">P1 VP</span>
        <span class="score-val">${state.players[0].vp}</span>
      </div>
      <div class="score-row">
        <span class="score-label p1-color">P2 VP</span>
        <span class="score-val">${state.players[1].vp}</span>
      </div>
    </div>
    <button class="btn" id="restart-btn">タイトルに戻る</button>
  `;
  div.querySelector('#restart-btn')!.addEventListener('click', () => {
    setState({ screen: 'title', gameState: null });
  });
  return div;
}
