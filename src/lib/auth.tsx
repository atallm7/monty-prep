import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FIREBASE_CONFIG } from './authConfig';

// The gate is off when no Firebase project is configured, in the claude.ai preview build (the sign-in
// pop-up cannot open there), and in test builds (VITE_AUTH_OFF=1).
export const AUTH_ENABLED = !!FIREBASE_CONFIG.apiKey && import.meta.env.MODE !== 'artifact' && import.meta.env.VITE_AUTH_OFF !== '1';

export type AuthUser = { email: string; name: string; photo: string | null };
// 'verify' = signed up with email and password but has not yet clicked the link in the confirmation email.
type AuthState = { status: 'off' | 'loading' | 'out' | 'verify' | 'in'; user: AuthUser | null; error: string; notice: string; busy: boolean;
  signIn: () => void; signOut: () => void;
  emailSignIn: (email: string, password: string) => void; emailSignUp: (email: string, password: string) => void;
  resetPassword: (email: string) => void; resendVerification: () => void; recheck: () => void; clear: () => void };

const noop = () => {};
const Ctx = createContext<AuthState>({ status: 'off', user: null, error: '', notice: '', busy: false, signIn: noop, signOut: noop, emailSignIn: noop, emailSignUp: noop, resetPassword: noop, resendVerification: noop, recheck: noop, clear: noop });
export const useAuth = () => useContext(Ctx);

// Firebase is loaded on demand so it never weighs on the site when the gate is off.
let fb: Promise<{ auth: import('firebase/auth').Auth; mod: typeof import('firebase/auth') }> | null = null;
function firebase() {
  if (!fb) fb = Promise.all([import('firebase/app'), import('firebase/auth')]).then(([app, mod]) => {
    const a = app.initializeApp(FIREBASE_CONFIG);
    const auth = mod.getAuth(a);
    return mod.setPersistence(auth, mod.browserLocalPersistence).then(() => ({ auth, mod }));
  });
  return fb;
}

function explain(code: string): string {
  if (/popup-blocked/.test(code)) return 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
  if (/popup-closed|cancelled-popup/.test(code)) return 'The sign-in window was closed before finishing. Try again.';
  if (/unauthorized-domain/.test(code)) return 'This web address is not yet approved for sign-in. (Site owner: add it under Firebase → Authentication → Settings → Authorized domains.)';
  if (/operation-not-allowed/.test(code)) return 'This way of signing in is not switched on yet. (Site owner: enable it under Firebase → Authentication → Sign-in method.)';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(code)) return 'That email and password do not match an account. Check them, or create an account.';
  if (/email-already-in-use/.test(code)) return 'An account with that email already exists. Sign in instead, or reset the password.';
  if (/account-exists-with-different-credential/.test(code)) return 'That email is already registered with a different sign-in method. Use the method you signed up with.';
  if (/weak-password/.test(code)) return 'Choose a password with at least 6 characters.';
  if (/invalid-email|missing-email/.test(code)) return 'Enter a valid email address.';
  if (/missing-password/.test(code)) return 'Enter your password.';
  if (/too-many-requests/.test(code)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/not-verified-yet/.test(code)) return 'Not confirmed yet. Open the email we sent and click the link, then press the button again.';
  if (/network/.test(code)) return 'Could not reach the sign-in service. Check your connection and try again.';
  return 'Sign-in did not work. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>(AUTH_ENABLED ? 'loading' : 'off');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  // Google accounts are already confirmed by Google; email-and-password accounts must confirm their address first.
  const apply = (u: import('firebase/auth').User | null) => {
    setUser(u ? { email: u.email || '', name: u.displayName || u.email || 'Signed in', photo: u.photoURL } : null);
    setStatus(!u ? 'out' : u.emailVerified ? 'in' : 'verify');
  };
  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let off = () => {}; let live = true;
    firebase().then(({ auth, mod }) => { if (live) off = mod.onAuthStateChanged(auth, apply); })
      .catch(() => { if (live) { setStatus('out'); setError('Could not load the sign-in service. Check your connection and reload.'); } });
    return () => { live = false; off(); };
  }, []);
  const run = (f: (x: { auth: import('firebase/auth').Auth; mod: typeof import('firebase/auth') }) => Promise<unknown>, okNotice = '') => {
    setError(''); setNotice(''); setBusy(true);
    firebase().then(f).then(() => { if (okNotice) setNotice(okNotice); })
      .catch(e => setError(explain(String(e?.code || e?.message || e)))).finally(() => setBusy(false));
  };
  const here = () => ({ url: window.location.origin + window.location.pathname });
  const signIn = () => run(({ auth, mod }) => {
    const p = new mod.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
    return mod.signInWithPopup(auth, p);
  });
  const emailSignIn = (email: string, password: string) => run(({ auth, mod }) => mod.signInWithEmailAndPassword(auth, email.trim(), password));
  const emailSignUp = (email: string, password: string) => run(async ({ auth, mod }) => {
    const c = await mod.createUserWithEmailAndPassword(auth, email.trim(), password);
    await mod.sendEmailVerification(c.user, here());
  });
  const resetPassword = (email: string) => {
    if (!email.trim()) { setNotice(''); setError('Type your email address first, then press "Forgot password?".'); return; }
    run(({ auth, mod }) => mod.sendPasswordResetEmail(auth, email.trim(), here()), 'If that email has an account, a password reset link is on its way. Check your inbox and spam folder.');
  };
  const resendVerification = () => run(({ auth, mod }) => auth.currentUser ? mod.sendEmailVerification(auth.currentUser, here()) : Promise.resolve(), 'Confirmation email sent again. Check your inbox and spam folder.');
  const recheck = () => run(async ({ auth }) => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload(); apply(auth.currentUser);
    if (!auth.currentUser.emailVerified) throw { code: 'not-verified-yet' };
  });
  const signOut = () => { setError(''); setNotice(''); firebase().then(({ auth, mod }) => mod.signOut(auth)).catch(() => {}); };
  const clear = () => { setError(''); setNotice(''); };
  return <Ctx.Provider value={{ status, user, error, notice, busy, signIn, signOut, emailSignIn, emailSignUp, resetPassword, resendVerification, recheck, clear }}>{children}</Ctx.Provider>;
}
