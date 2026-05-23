import { setState } from './app.js';

export function renderTitle(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'screen-title';
  div.innerHTML = `
    <h1>異能学園総選挙</h1>
    <p class="subtitle">Reboot</p>
    <div style="display:flex;flex-direction:column;gap:12px;align-items:center;">
      <button class="btn" id="btn-local">ローカル対戦（同端末）</button>
      <button class="btn btn-secondary" id="btn-online">オンライン対戦</button>
    </div>
  `;
  div.querySelector('#btn-local')!.addEventListener('click', () => {
    setState({ screen: 'draft', online: false, roomId: null, myPlayerIndex: null });
  });
  div.querySelector('#btn-online')!.addEventListener('click', () => {
    setState({ screen: 'lobby' });
  });
  return div;
}
