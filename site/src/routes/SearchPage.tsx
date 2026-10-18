import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { ArtifactCard } from '../components/ArtifactCard';
import { buildHash, navigate } from '../lib/route';
import { buildIndex, popularKeywords, runSearch, type SearchState } from '../lib/search';
import { plural } from '../lib/text';
import { TYPE_LABEL, TYPE_ORDER, type ArtifactType, type Catalog } from '../types/catalog';

const DEBOUNCE_MS = 100;
const SKELETONS = [1, 2, 3, 4, 5, 6];

interface Props {
  catalog: Catalog | null;
  error: string | null;
  state: SearchState;
  contributingUrl: string;
}

export function SearchPage({ catalog, error, state, contributingUrl }: Props) {
  const loading = catalog === null && error === null;
  const artifacts = useMemo(() => catalog?.artifacts ?? [], [catalog]);
  const index = useMemo(() => buildIndex(artifacts), [artifacts]);
  const search = useMemo(() => runSearch(index, state), [index, state]);
  const popular = useMemo(() => popularKeywords(artifacts), [artifacts]);
  const categories = useMemo(() => [...new Set(artifacts.map((a) => a.category).filter((c): c is string => !!c))].sort(), [artifacts]);
  const plugins = useMemo(() => [...new Set(artifacts.map((a) => a.plugin))].sort(), [artifacts]);

  // The input is the source of truth while typing; the URL follows after a debounce.
  const [input, setInput] = useState(state.q);
  const written = useRef(state.q);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inputEl = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.q !== written.current) {
      written.current = state.q;
      setInput(state.q);
    }
  }, [state.q]);

  useEffect(() => {
    inputEl.current?.focus();
    return () => clearTimeout(timer.current);
  }, []);

  const writeQuery = (q: string) => {
    written.current = q;
    navigate(buildHash({ ...state, q }), { replace: true });
  };
  const onInput = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setInput(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => writeQuery(v.trim() ? v : ''), DEBOUNCE_MS);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    clearTimeout(timer.current);
    setInput('');
    writeQuery('');
  };

  const push = (patch: Partial<SearchState>) => navigate(buildHash({ ...state, ...patch }));
  const toggleType = (t: ArtifactType) => push({ type: state.type.includes(t) ? state.type.filter((x) => x !== t) : [...state.type, t] });
  const clearAll = () => push({ type: [], category: '', plugin: '' });

  const activeChips = [
    ...state.type.map((t) => ({ key: `type:${t}`, label: `Type: ${TYPE_LABEL[t]}`, aria: `Remove filter type ${TYPE_LABEL[t]}`, remove: () => toggleType(t) })),
    ...(state.category ? [{ key: 'category', label: `Category: ${state.category}`, aria: `Remove filter category ${state.category}`, remove: () => push({ category: '' }) }] : []),
    ...(state.plugin ? [{ key: 'plugin', label: `Plugin: ${state.plugin}`, aria: `Remove filter plugin ${state.plugin}`, remove: () => push({ plugin: '' }) }] : []),
  ];

  const n = search.results.length;
  const q = state.q.trim();
  const showGrid = !loading && !error && n > 0;
  const showZero = !loading && !error && artifacts.length > 0 && n === 0;
  const showEmpty = !loading && !error && artifacts.length === 0;

  return (
    <>
      <section aria-labelledby="search-title" className="hero">
        <div className="hero-text">
          <h1 id="search-title">Find a plugin, skill or agent</h1>
          <p className="hero-desc">{catalog?.marketplace.description ?? ''}</p>
        </div>
        <div className="searchbox">
          <label htmlFor="q" className="sr-only">
            Search the catalog
          </label>
          <input
            id="q"
            ref={inputEl}
            type="search"
            className="search-input"
            autoComplete="off"
            spellCheck={false}
            value={input}
            onChange={onInput}
            onKeyDown={onKeyDown}
            placeholder="Describe what you need, e.g. a skill for code review"
          />
          <kbd aria-hidden="true" className="search-kbd">
            /
          </kbd>
        </div>

        <div role="group" aria-label="Filters" className="filters">
          <div role="group" aria-label="Type" className="chip-group">
            {TYPE_ORDER.map((t) => (
              <button key={t} type="button" className="chip" aria-pressed={state.type.includes(t)} onClick={() => toggleType(t)}>
                <span>{TYPE_LABEL[t]}</span>
                <span className="chip-count">{search.typeCounts[t]}</span>
              </button>
            ))}
          </div>
          <div className="select-group">
            <label className="select-label">
              <span>Category</span>
              <select value={state.category} onChange={(e) => push({ category: e.target.value })}>
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="select-label">
              <span>Plugin</span>
              <select value={state.plugin} onChange={(e) => push({ plugin: e.target.value })}>
                <option value="">All</option>
                {plugins.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="active-filters">
            {activeChips.map((c) => (
              <button key={c.key} type="button" className="active-chip" aria-label={c.aria} onClick={c.remove}>
                <span>{c.label}</span>
                <span aria-hidden="true" className="times">
                  ×
                </span>
              </button>
            ))}
            <button type="button" className="link-btn" onClick={clearAll}>
              Clear all
            </button>
          </div>
        )}
      </section>

      <div className="result-bar">
        <p role="status" aria-live="polite" className="result-count">
          {error ? 'Catalog unavailable' : loading ? 'Loading catalog…' : q ? `${plural(n, 'result')} for “${q}”` : plural(n, 'artifact')}
        </p>
        <p className="result-sort">{loading || error ? '' : search.terms.length ? 'Sorted by relevance' : 'Sorted by type, then name'}</p>
      </div>

      {loading && (
        <div aria-hidden="true" className="card-grid">
          {SKELETONS.map((s) => (
            <div key={s} className="skeleton-card">
              <div className="sk" style={{ width: 56, height: 18 }} />
              <div className="sk" style={{ width: '60%', height: 18 }} />
              <div className="sk" style={{ width: '100%', height: 12 }} />
              <div className="sk" style={{ width: '85%', height: 12 }} />
              <div className="sk" style={{ width: '40%', height: 22, marginTop: 'auto' }} />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="page-message" role="alert">
          <h2>Could not load the catalog</h2>
          <p>{error}. Reload the page to try again.</p>
        </div>
      )}

      {showGrid && catalog && (
        <ul className="card-grid">
          {search.results.map((a) => (
            <ArtifactCard key={a.id} artifact={a} terms={search.terms} marketplaceName={catalog.marketplace.name} />
          ))}
        </ul>
      )}

      {showZero && (
        <div className="zero">
          <h2>No matches</h2>
          <ul>
            {activeChips.length > 0 && (
              <li>
                <button type="button" className="link-btn" onClick={clearAll}>
                  Remove the filters
                </button>
              </li>
            )}
            <li>Try fewer or more general words.</li>
            <li>Search by a popular keyword:</li>
          </ul>
          <div className="popular">
            {popular.map((k) => (
              <button key={k} type="button" onClick={() => navigate(buildHash({ q: k }))}>
                {k}
              </button>
            ))}
          </div>
        </div>
      )}

      {showEmpty && (
        <div className="page-message">
          <h2>No plugins published yet</h2>
          <p>
            This marketplace is empty. To add the first plugin, read{' '}
            <a href={contributingUrl} rel="noopener noreferrer">
              CONTRIBUTING.md
            </a>
            .
          </p>
        </div>
      )}
    </>
  );
}
