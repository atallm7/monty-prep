import { useState, type ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { ILogo } from './Icons';

/** Shows the site only to signed-in visitors (when sign-in is configured). */
export default function SignInGate({ children }: { children: ReactNode }) {
  const a = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  if (a.status === 'off' || a.status === 'in') return <>{children}</>;
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (mode === 'in') a.emailSignIn(email, password); else a.emailSignUp(email, password); };
  const swap = () => { a.clear(); setMode(mode === 'in' ? 'up' : 'in'); };
  return <div className="gate">
    <div className="gate-card">
      <div className="gate-logo"><ILogo /></div>
      <h1 className="gate-title">Circuit Interview Lab</h1>
      {a.status === 'verify' ? <>
        <p className="gate-lead">Almost there. We sent a confirmation link to <b>{a.user?.email}</b>. Open that email and click the link, then come back here.</p>
        <button className="gate-btn gate-primary" disabled={a.busy} onClick={a.recheck}>I clicked the link, continue</button>
        {a.error && <div className="gate-error" role="alert">{a.error}</div>}
        {a.notice && <div className="gate-ok" role="status">{a.notice}</div>}
        <p className="gate-note">Can't find it? Check your spam folder, or <button className="gate-link" disabled={a.busy} onClick={a.resendVerification}>send it again</button>.
          {' '}Wrong address? <button className="gate-link" onClick={a.signOut}>Start over</button>.</p>
      </> : <>
        <p className="gate-lead">Practice all 1,005 hardware engineering interview questions, with plain-language explanations, interactive simulations and quizzes.</p>
        {a.status === 'loading' ? <div className="gate-wait" role="status">Checking sign-in…</div> : <>
          <button className="gate-btn" disabled={a.busy} onClick={a.signIn}>
            <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.96 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg>
            <span>Sign in with Google</span>
          </button>
          <div className="gate-or"><span>or use your email</span></div>
          <form className="gate-form" onSubmit={submit}>
            <label className="gate-label" htmlFor="gate-email">Email</label>
            <input id="gate-email" className="gate-input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
            <label className="gate-label" htmlFor="gate-pass">Password{mode === 'up' && <span className="gate-hint"> (at least 6 characters)</span>}</label>
            <input id="gate-pass" className="gate-input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={6} value={password} onChange={e => setPassword(e.target.value)} />
            <button className="gate-btn gate-primary" type="submit" disabled={a.busy}>{a.busy ? 'Please wait…' : mode === 'in' ? 'Sign in' : 'Create account'}</button>
          </form>
          {a.error && <div className="gate-error" role="alert">{a.error}</div>}
          {a.notice && <div className="gate-ok" role="status">{a.notice}</div>}
          <p className="gate-switch">{mode === 'in'
            ? <>New here? <button className="gate-link" onClick={swap}>Create an account</button> · <button className="gate-link" disabled={a.busy} onClick={() => a.resetPassword(email)}>Forgot password?</button></>
            : <>Already have an account? <button className="gate-link" onClick={swap}>Sign in</button></>}</p>
        </>}
        <p className="gate-note">Signing in is free. Your study progress stays in this browser.</p>
      </>}
    </div>
  </div>;
}
