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
