import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { CopyProvider } from './components/Copy';
import { loadCatalog } from './lib/catalog';
import { getHash, getLastSearch, navigate, parseHash, rememberSearch, subscribeHash } from './lib/route';
import { applyTheme, initialTheme, type Theme } from './lib/theme';
import { ArtifactPage } from './routes/ArtifactPage';
import { NotFoundPage } from './routes/NotFoundPage';
import { SearchPage } from './routes/SearchPage';
import type { Catalog } from './types/catalog';

function useCatalog(): { catalog: Catalog | null; error: string | null } {
  const [state, setState] = useState<{ catalog: Catalog | null; error: string | null }>({ catalog: null, error: null });
  useEffect(() => {
    let cancelled = false;
    loadCatalog().then(
      (catalog) => !cancelled && setState({ catalog, error: null }),
      (e: unknown) => !cancelled && setState({ catalog: null, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

export function App() {
  const hash = useSyncExternalStore(subscribeHash, getHash);
  const route = useMemo(() => parseHash(hash), [hash]);
  const { catalog, error } = useCatalog();
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (route.name === 'search') rememberSearch(hash);
  }, [route, hash]);

  const routeKey = route.name === 'artifact' ? `a:${route.id}` : route.name;
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [routeKey]);

  useEffect(() => {
    document.title = catalog ? `${catalog.marketplace.name} · Catalog` : 'Catalog';
  }, [catalog]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() ?? '';
      if (e.key !== '/' || ['input', 'textarea', 'select'].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      if (parseHash(getHash()).name !== 'search') navigate(getLastSearch());
      setTimeout(() => document.getElementById('q')?.focus(), 0);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const mp = catalog?.marketplace;
  const light = theme === 'light';

  let page;
  if (route.name === 'search') {
    page = (
      <SearchPage
        catalog={catalog}
        error={error}
        state={route.state}
        contributingUrl={mp ? `${mp.repoUrl}/blob/${mp.defaultBranch}/CONTRIBUTING.md` : '#/'}
      />
    );
  } else if (route.name === 'artifact') {
    page = catalog ? (
      <ArtifactPage catalog={catalog} id={route.id} />
    ) : error ? (
      <NotFoundPage missing={route.id} />
    ) : (
      <p role="status" className="page-message">
        Loading catalog…
      </p>
    );
  } else {
    page = <NotFoundPage missing={route.path} />;
  }

  return (
    <CopyProvider>
      <div className="app">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <div className="container">
            <a href="#/" className="brand">
              <span className="brand-mark" />
              <span>{mp?.name ?? 'Plugin catalog'}</span>
            </a>
            <div className="header-actions">
              <button type="button" role="switch" aria-checked={light} aria-label="Light theme" className="theme-toggle" onClick={() => setTheme(light ? 'dark' : 'light')}>
                <span>{light ? 'Light' : 'Dark'}</span>
                <span className="switch">
                  <span className="switch-knob" />
                </span>
              </button>
              {mp && (
                <a href={mp.repoUrl} rel="noopener noreferrer">
                  Repository ↗
                </a>
              )}
            </div>
          </div>
        </header>
        <main id="main" className="site-main">
          {page}
        </main>
        <footer className="site-footer">
          <div className="container">
            <span>{catalog ? `Generated from marketplace.json on ${catalog.generatedAt.slice(0, 10)}` : ''}</span>
            <span>Catalog schema v1</span>
          </div>
        </footer>
      </div>
    </CopyProvider>
  );
}
