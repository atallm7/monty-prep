import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FIREBASE_CONFIG } from './authConfig';

// The gate is off when no Firebase project is configured, in the claude.ai preview build (the sign-in
// pop-up cannot open there), and in test builds (VITE_AUTH_OFF=1).
export const AUTH_ENABLED = !!FIREBASE_CONFIG.apiKey && import.meta.env.MODE !== 'artifact' && import.meta.env.VITE_AUTH_OFF !== '1';

export type AuthUser = { email: string; name: string; photo: string | null };
type AuthState = { status: 'off' | 'loading' | 'out' | 'in'; user: AuthUser | null; error: string; signIn: () => void; signOut: () => void };

const Ctx = createContext<AuthState>({ status: 'off', user: null, error: '', signIn: () => {}, signOut: () => {} });
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
  if (/operation-not-allowed/.test(code)) return 'Google sign-in is not switched on yet. (Site owner: enable Google under Firebase → Authentication → Sign-in method.)';
  if (/network/.test(code)) return 'Could not reach the sign-in service. Check your connection and try again.';
  return 'Sign-in did not work. Please try again.';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>(AUTH_ENABLED ? 'loading' : 'off');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!AUTH_ENABLED) return;
    let off = () => {}; let live = true;
    firebase().then(({ auth, mod }) => {
      if (!live) return;
      off = mod.onAuthStateChanged(auth, u => {
        setUser(u ? { email: u.email || '', name: u.displayName || u.email || 'Signed in', photo: u.photoURL } : null);
        setStatus(u ? 'in' : 'out');
      });
    }).catch(() => { if (live) { setStatus('out'); setError('Could not load the sign-in service. Check your connection and reload.'); } });
    return () => { live = false; off(); };
  }, []);
  const signIn = () => {
    setError('');
    firebase().then(({ auth, mod }) => {
      const p = new mod.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      return mod.signInWithPopup(auth, p);
    }).catch(e => setError(explain(String(e?.code || e?.message || e))));
  };
  const signOut = () => { firebase().then(({ auth, mod }) => mod.signOut(auth)).catch(() => {}); };
  return <Ctx.Provider value={{ status, user, error, signIn, signOut }}>{children}</Ctx.Provider>;
}
