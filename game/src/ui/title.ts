import { setState } from './app.js';
import { signOut } from '../firebase/auth.js';
import type { User } from '../firebase/auth.js';

export function renderTitle(user: User | null): HTMLElement {
  const div = document.createElement('div');
  div.className = 'screen-title';
  const userLine = user
    ? `<p class="login-user">${user.displayName ?? user.email} でログイン中 · <button class="btn-text" id="btn-logout">ログアウト</button></p>`
    : '';
  div.innerHTML = `
    <h1>異能学園総選挙</h1>
    <p class="subtitle">Reboot</p>
    ${userLine}
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
  div.querySelector('#btn-logout')?.addEventListener('click', () => {
    void signOut();
  });
  return div;
}
