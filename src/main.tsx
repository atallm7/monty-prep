import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import 'katex/dist/katex.min.css';
import './styles/base.css';
import './styles/app.css';
import App from './App';
import { ThemeProvider } from './lib/theme';
import { AuthProvider } from './lib/auth';
import SignInGate from './components/SignInGate';

// A tab left open across a site update asks for files that no longer exist. Reload it once so it picks up
// the current version (and its sign-in check) instead of showing an error.
window.addEventListener('vite:preloadError', () => {
  try { if (sessionStorage.getItem('mcp.reloaded') === '1') return; sessionStorage.setItem('mcp.reloaded', '1'); } catch { return; }
  window.location.reload();
});
window.addEventListener('load', () => { setTimeout(() => { try { sessionStorage.removeItem('mcp.reloaded'); } catch { /* ignore */ } }, 10000); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <SignInGate>
          <HashRouter>
            <App />
          </HashRouter>
        </SignInGate>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);
