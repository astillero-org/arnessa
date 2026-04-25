'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Theme = 'light' | 'dark' | 'system';

const ThemeContext = createContext<{ theme: Theme; setTheme: (theme: Theme) => void } | null>(null);
const STORAGE_KEY = 'arnessa-theme';

function getSystemTheme() { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => (typeof window === 'undefined' ? 'system' : ((window.localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'system')));
  useEffect(() => { const resolved = theme === 'system' ? getSystemTheme() : theme; window.localStorage.setItem(STORAGE_KEY, theme); document.documentElement.classList.toggle('dark', resolved === 'dark'); }, [theme]);
  useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: dark)'); const listener = () => { if ((window.localStorage.getItem(STORAGE_KEY) as Theme | null) === 'system') document.documentElement.classList.toggle('dark', media.matches); }; media.addEventListener('change', listener); return () => media.removeEventListener('change', listener); }, []);
  const value = useMemo(() => ({ theme, setTheme: setThemeState }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() { const ctx = useContext(ThemeContext); if (!ctx) throw new Error('useTheme must be used within ThemeProvider'); return ctx; }
