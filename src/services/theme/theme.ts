export type ThemeMode = 'night' | 'day';

export const THEME_STORAGE_KEY = 'xnnehanglab.theme';

export function isThemeMode(value: string): value is ThemeMode {
  return value === 'night' || value === 'day';
}

export function readStoredTheme(): ThemeMode | null {
  const storedValue = localStorage.getItem(THEME_STORAGE_KEY);

  if (storedValue && isThemeMode(storedValue)) {
    return storedValue;
  }

  return null;
}

export function writeStoredTheme(theme: ThemeMode) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function toggleThemeMode(theme: ThemeMode): ThemeMode {
  return theme === 'night' ? 'day' : 'night';
}
