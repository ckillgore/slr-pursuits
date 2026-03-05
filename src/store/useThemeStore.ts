import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeStore {
    theme: Theme;
    toggleTheme: () => void;
    setTheme: (theme: Theme) => void;
}

// Apply theme to the DOM
function applyTheme(theme: Theme) {
    if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', theme);
        // Also set a cookie so the server can read it on next navigation
        document.cookie = `slr-theme=${theme};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
    }
}

// Read persisted theme from localStorage
function getStoredTheme(): Theme {
    if (typeof window === 'undefined') return 'light';
    try {
        const stored = localStorage.getItem('slr-theme');
        if (stored === 'dark' || stored === 'light') return stored;
    } catch {
        // localStorage may be unavailable
    }
    return 'light';
}

export const useThemeStore = create<ThemeStore>((set) => {
    const initial = getStoredTheme();

    return {
        theme: initial,
        toggleTheme: () =>
            set((state) => {
                const next = state.theme === 'light' ? 'dark' : 'light';
                applyTheme(next);
                try { localStorage.setItem('slr-theme', next); } catch { }
                return { theme: next };
            }),
        setTheme: (theme: Theme) => {
            applyTheme(theme);
            try { localStorage.setItem('slr-theme', theme); } catch { }
            set({ theme });
        },
    };
});
