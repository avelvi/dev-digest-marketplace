import { TYPE_ORDER, type ArtifactType } from '../types/catalog';
import { EMPTY_SEARCH, type SearchState } from './search';

export type Route =
  | { name: 'search'; state: SearchState }
  | { name: 'artifact'; id: string }
  | { name: 'notfound'; path: string };

const isType = (v: string): v is ArtifactType => (TYPE_ORDER as readonly string[]).includes(v);

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (!h || h === '/') return { name: 'search', state: EMPTY_SEARCH };
  if (h.startsWith('/?')) {
    const sp = new URLSearchParams(h.slice(2));
    return {
      name: 'search',
      state: {
        q: sp.get('q') ?? '',
        type: (sp.get('type') ?? '').split(',').filter(isType),
        category: sp.get('category') ?? '',
        plugin: sp.get('plugin') ?? '',
      },
    };
  }
  const m = /^\/a\/(.+)$/.exec(h);
  if (m) {
    const raw = m[1]!;
    try {
      return { name: 'artifact', id: decodeURIComponent(raw) };
    } catch {
      return { name: 'artifact', id: raw };
    }
  }
  return { name: 'notfound', path: h };
}

export function buildHash(state: Partial<SearchState>): string {
  const sp = new URLSearchParams();
  if (state.q) sp.set('q', state.q);
  if (state.type?.length) sp.set('type', state.type.join(','));
  if (state.category) sp.set('category', state.category);
  if (state.plugin) sp.set('plugin', state.plugin);
  const s = sp.toString();
  return s ? `#/?${s}` : '#/';
}

export const artifactHref = (id: string): string => `#/a/${encodeURIComponent(id)}`;

// A tiny external store so components re-render on hash changes, including
// silent `replaceState` updates that do not fire `hashchange`.
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function subscribeHash(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('hashchange', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('hashchange', listener);
  };
}

export const getHash = (): string => window.location.hash;

export function navigate(hash: string, opts: { replace?: boolean } = {}): void {
  if (opts.replace) {
    window.history.replaceState(null, '', hash);
    notify();
  } else {
    window.location.hash = hash;
  }
}

let lastSearchHash = '#/';
export const rememberSearch = (hash: string): void => {
  lastSearchHash = hash || '#/';
};
export const getLastSearch = (): string => lastSearchHash;
