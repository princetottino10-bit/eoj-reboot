import { setState } from './app.js';

export function renderTitle(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'screen-title';
  div.innerHTML = `
    <h1>異能学園総選挙</h1>
    <p class="subtitle">Reboot — 2 Player Local</p>
    <button class="btn" id="start-btn">ゲームを始める</button>
  `;
  div.querySelector('#start-btn')!.addEventListener('click', () => {
    setState({ screen: 'draft' });
  });
  return div;
}
