import { useEffect, type ReactNode } from 'react';

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', '#fbf3e4');
    document.documentElement.lang = 'en';
  }, []);

  return children;
}
