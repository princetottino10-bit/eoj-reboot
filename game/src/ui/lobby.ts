import { setState, startOnlineRoom } from './app.js';
import { createRoom, joinRoom } from '../firebase/room.js';
import { createDraftState } from '../engine/draft.js';

// createDraftState → DraftUiState の初期値と対応させる
function initialDraftUi() {
  void createDraftState(); // engine の初期化は buildDeck 時なので不要、UI側のみ
  return {
    step: 'faction' as const,
    pickIndex: 0,
    p0Factions: [] as string[],
    p1Factions: [] as string[],
    p0Item: '',
    p1Item: '',
    hoveredFaction: null,
    hoveredItem: null,
  };
}

export function renderLobby(): HTMLElement {
  const div = document.createElement('div');
  div.className = 'screen-lobby';

  div.innerHTML = `
    <h2>オンライン対戦</h2>
    <div class="lobby-section">
      <button id="btn-create" class="btn">部屋を作る</button>
    </div>
    <div class="lobby-section">
      <input id="room-code-input" class="room-code-input" type="text"
             placeholder="ルームコード（6文字）" maxlength="6" />
      <button id="btn-join" class="btn btn-secondary">部屋に入る</button>
      <div id="join-error" class="join-error"></div>
    </div>
    <div class="lobby-section">
      <button id="btn-back" class="btn btn-secondary">戻る</button>
    </div>
  `;

  div.querySelector('#btn-create')!.addEventListener('click', async () => {
    const btn = div.querySelector('#btn-create') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = '作成中...';
    const roomId = await createRoom();
    startOnlineRoom(roomId, 0);
    setState({ screen: 'waiting', online: true, roomId, myPlayerIndex: 0 });
  });

  div.querySelector('#btn-join')!.addEventListener('click', async () => {
    const input = div.querySelector('#room-code-input') as HTMLInputElement;
    const code = input.value.trim().toUpperCase();
    if (code.length !== 6) {
      (div.querySelector('#join-error') as HTMLElement).textContent = '6文字のコードを入力してください';
      return;
    }
    const btn = div.querySelector('#btn-join') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = '参加中...';

    const result = await joinRoom(code);
    if (result === 'not_found') {
      (div.querySelector('#join-error') as HTMLElement).textContent = 'その部屋は存在しません';
      btn.disabled = false;
      btn.textContent = '部屋に入る';
      return;
    }
    if (result === 'full') {
      (div.querySelector('#join-error') as HTMLElement).textContent = 'その部屋はすでに満員です';
      btn.disabled = false;
      btn.textContent = '部屋に入る';
      return;
    }
    // ok → P1 として draft 開始
    startOnlineRoom(code, 1);
    setState({
      screen: 'draft',
      online: true,
      roomId: code,
      myPlayerIndex: 1,
      draftUi: initialDraftUi(),
    });
  });

  div.querySelector('#btn-back')!.addEventListener('click', () => {
    setState({ screen: 'title', online: false, roomId: null, myPlayerIndex: null });
  });

  return div;
}
