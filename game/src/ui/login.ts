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

  btn.addEventListener('click', () => {
    btn.disabled = true;
    btn.textContent = 'リダイレクト中…';
    void signInWithGoogle(); // Googleページへ遷移（戻り値なし）
  });

  return div;
}
