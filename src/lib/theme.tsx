import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
type Mode = 'light' | 'dark' | 'system';
type Ctx = { mode: Mode; effective: 'light' | 'dark'; setMode: (m: Mode) => void };
const ThemeCtx = createContext<Ctx>({ mode: 'system', effective: 'light', setMode: () => {} });
const sysDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => { try { return (localStorage.getItem('mcp.theme') as Mode) || 'system'; } catch { return 'system'; } });
  const [sys, setSys] = useState(sysDark());
  useEffect(() => { const mq = window.matchMedia('(prefers-color-scheme: dark)'); const h = () => setSys(mq.matches); mq.addEventListener('change', h); return () => mq.removeEventListener('change', h); }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') delete root.dataset.theme; else root.dataset.theme = mode;
    try { if (mode === 'system') localStorage.removeItem('mcp.theme'); else localStorage.setItem('mcp.theme', mode); } catch { /* ignore */ }
  }, [mode]);
  const effective = mode === 'system' ? (sys ? 'dark' : 'light') : mode;
  return <ThemeCtx.Provider value={{ mode, effective, setMode: setModeState }}>{children}</ThemeCtx.Provider>;
}
export const useTheme = () => useContext(ThemeCtx);
