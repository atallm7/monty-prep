import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { ILogo } from './Icons';

/** Shows the site only to signed-in visitors (when sign-in is configured). */
export default function SignInGate({ children }: { children: ReactNode }) {
  const { status, error, signIn } = useAuth();
  if (status === 'off' || status === 'in') return <>{children}</>;
  return <div className="gate">
    <div className="gate-card">
      <div className="gate-logo"><ILogo /></div>
      <h1 className="gate-title">Circuit Interview Lab</h1>
      <p className="gate-lead">Practice all 1,005 hardware engineering interview questions, with plain-language explanations, interactive simulations and quizzes.</p>
      {status === 'loading' ? <div className="gate-wait" role="status">Checking sign-in…</div> : <>
        <button className="gate-btn" onClick={signIn}>
          <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.96 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"/></svg>
          <span>Sign in with Google</span>
        </button>
        {error && <div className="gate-error" role="alert">{error}</div>}
      </>}
      <p className="gate-note">Signing in is free. Your study progress stays in this browser.</p>
    </div>
  </div>;
}
