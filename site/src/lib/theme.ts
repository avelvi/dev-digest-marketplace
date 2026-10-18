export type Theme = 'dark' | 'light';

const KEY = 'theme';

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // storage may be blocked
  }
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore
  }
}
