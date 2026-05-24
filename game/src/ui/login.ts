import { signInWithGoogle } from '../firebase/auth.js';

export function renderLogin(error?: string | null): HTMLElement {
  const div = document.createElement('div');
  div.className = 'screen-login';
  div.innerHTML = `
    <h1>異能学園総選挙</h1>
    <p class="subtitle">Reboot</p>
    <p class="login-note">招待されたGoogleアカウントでログインしてください。</p>
    <button class="btn" id="btn-google-login">Googleでログイン</button>
    ${error ? `<p class="login-error">${error}</p>` : '<p class="login-error"></p>'}
  `;

  const btn = div.querySelector('#btn-google-login') as HTMLButtonElement;
  const errEl = div.querySelector('.login-error') as HTMLElement;

  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'ログイン中…';
    errEl.textContent = '';

    signInWithGoogle().then((method) => {
      if (method === 'redirect') {
        btn.textContent = 'リダイレクト中…';
        errEl.textContent = 'ポップアップがブロックされました（広告ブロック等）。別ページに移動します…';
      } else if (method === 'cancelled') {
        btn.disabled = false;
        btn.textContent = 'Googleでログイン';
      }
      // 'popup': onAuthStateChanged が発火してアプリが遷移する
    }).catch((e: unknown) => {
      console.error('[Login]', e);
      btn.disabled = false;
      btn.textContent = 'Googleでログイン';
      errEl.textContent = 'ログインに失敗しました。時間をおいて再試行してください。';
    });
  });

  return div;
}
