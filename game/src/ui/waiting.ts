import { setState, stopOnlineRoom } from './app.js';

export function renderWaiting(roomId: string): HTMLElement {
  const div = document.createElement('div');
  div.className = 'screen-pass';
  div.innerHTML = `
    <h2>部屋を作りました</h2>
    <div class="room-code-display">
      <div class="room-code-label">ルームコード</div>
      <div class="room-code-value">${roomId}</div>
    </div>
    <p class="pass-note">このコードを相手に共有してください</p>
    <p class="pass-note" style="color:#888;font-size:0.85rem;">相手の参加を待っています...</p>
  `;

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn-secondary';
  cancelBtn.textContent = 'キャンセル';
  cancelBtn.addEventListener('click', () => {
    stopOnlineRoom();
    setState({ screen: 'title' });
  });
  div.appendChild(cancelBtn);

  return div;
}
