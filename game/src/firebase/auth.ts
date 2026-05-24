import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  onAuthStateChanged as fbOnAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './config.js';

export interface User {
  uid: string;
  email: string;
  displayName: string | null;
}

const provider = new GoogleAuthProvider();

async function checkAllowlist(email: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'allowed_users', email));
  console.log('[Auth] allowlist check:', email, '→', snap.exists() ? 'allowed' : 'denied');
  return snap.exists();
}

/**
 * Popup でログインを試み、ポップアップブロック時は redirect にフォールバックする。
 * 戻り値: 'popup' = popup で完了 / 'redirect' = redirect に切り替え（ページ遷移中）
 *         'cancelled' = ユーザーがポップアップを閉じた
 */
export async function signInWithGoogle(): Promise<'popup' | 'redirect' | 'cancelled'> {
  try {
    await signInWithPopup(auth, provider);
    return 'popup';
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === 'auth/popup-blocked') {
      void signInWithRedirect(auth, provider);
      return 'redirect';
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return 'cancelled';
    }
    throw e;
  }
}

export function signOut(): Promise<void> {
  return fbSignOut(auth);
}

// not_allowed でサインアウトした後 onAuthStateChanged が null で再発火する。
// その null 通知にエラー理由を乗せるため、モジュール変数で一時保持する。
let _pendingError: string | null = null;

export function onAuthStateChanged(
  cb: (user: User | null, authError?: string | null) => void,
): () => void {
  return fbOnAuthStateChanged(auth, async (firebaseUser) => {
    console.log('[Auth] state changed:', firebaseUser?.email ?? 'null');

    if (!firebaseUser || !firebaseUser.email) {
      const err = _pendingError;
      _pendingError = null;
      cb(null, err);
      return;
    }

    try {
      const allowed = await checkAllowlist(firebaseUser.email);
      if (!allowed) {
        _pendingError = 'このアカウントはアクセスが許可されていません。';
        await fbSignOut(auth); // → null で再発火 → 上の cb(null, err) が呼ばれる
        return;
      }
      cb({ uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName });
    } catch (e) {
      console.error('[Auth] allowlist check error:', e);
      _pendingError = 'ログイン確認中にエラーが発生しました。コンソールを確認してください。';
      await fbSignOut(auth);
    }
  });
}
