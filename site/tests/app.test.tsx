// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { Catalog } from '../src/types/catalog';
import { fixtureCatalog } from './helpers';

function mockCatalog(catalog: Catalog | { status: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      'status' in catalog ? { ok: false, status: catalog.status, json: async () => ({}) } : { ok: true, status: 200, json: async () => catalog },
    ),
  );
}

async function open(hash = '#/', catalog: Catalog | { status: number } = fixtureCatalog()) {
  mockCatalog(catalog);
  window.history.replaceState(null, '', hash);
  const user = userEvent.setup();
  render(<App />);
  if (!('status' in catalog)) await waitFor(() => expect(screen.queryByText('Loading catalog…')).toBeNull());
  return user;
}

const cardTitles = () => screen.queryAllByRole('heading', { level: 2 }).map((h) => h.textContent);

async function violations() {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
}

beforeEach(() => {
  window.scrollTo = vi.fn();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'execCommand');
});

describe('search page', () => {
  it('lists every artifact with a result count', async () => {
    await open();
    expect(screen.getByRole('status').textContent).toBe('9 artifacts');
    expect(cardTitles()).toHaveLength(9);
  });

  it('shows skeletons while the catalog loads', async () => {
    mockCatalog(fixtureCatalog());
    window.history.replaceState(null, '', '#/');
    render(<App />);
    expect(screen.getByRole('status').textContent).toBe('Loading catalog…');
    await waitFor(() => expect(cardTitles()).toHaveLength(9));
  });

  it('ranks results for a free-form request and writes the query to the URL', async () => {
    const user = await open();
    await user.type(screen.getByRole('searchbox'), 'review code');
    await waitFor(() => expect(cardTitles()[0]).toBe('code-review'));
    expect(window.location.hash).toBe('#/?q=review+code');
    expect(screen.getByRole('status').textContent).toMatch(/results? for “review code”/);
  });

  it('finds a misspelled word', async () => {
    const user = await open();
    await user.type(screen.getByRole('searchbox'), 'reveiw');
    await waitFor(() => expect(cardTitles()[0]).toBe('code-review'));
  });

  it('keeps other types when the query only hints at a type', async () => {
    const user = await open();
    await user.type(screen.getByRole('searchbox'), 'agents for testing');
    await waitFor(() => expect(cardTitles()[0]).toBe('test-writer'));
    expect(cardTitles().length).toBeGreaterThan(1);
  });

  it('highlights matched words', async () => {
    const user = await open();
    await user.type(screen.getByRole('searchbox'), 'review');
    await waitFor(() => expect(document.querySelectorAll('mark.hl').length).toBeGreaterThan(0));
  });

  it('clears the query with Escape', async () => {
    const user = await open('#/?q=review');
    const box = screen.getByRole('searchbox') as HTMLInputElement;
    expect(box.value).toBe('review');
    await user.click(box);
    await user.keyboard('{Escape}');
    expect(box.value).toBe('');
    expect(window.location.hash).toBe('#/');
  });

  it('restores state from the URL', async () => {
    await open('#/?q=review&type=skill');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('review');
    expect(screen.getByRole('status').textContent).toBe('1 result for “review”');
    expect(screen.getByRole('button', { name: 'Remove filter type Skill' })).toBeTruthy();
  });

  it('toggles type filters and removes them again', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: /^Skill/ }));
    expect(cardTitles()).toEqual(['code-review']);
    expect(window.location.hash).toBe('#/?type=skill');
    await user.click(screen.getByRole('button', { name: 'Remove filter type Skill' }));
    expect(cardTitles()).toHaveLength(9);
  });

  it('filters by category and plugin, and clears everything', async () => {
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Plugin'), 'github-tools');
    expect(cardTitles()).toEqual(['github-tools', 'github']);
    await user.selectOptions(screen.getByLabelText('Category'), 'quality');
    expect(screen.getByText('No matches')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Clear all' })[0]!);
    expect(cardTitles()).toHaveLength(9);
  });

  it('restores the previous state with the back button', async () => {
    const user = await open();
    await user.click(screen.getByRole('button', { name: /^Skill/ }));
    expect(cardTitles()).toEqual(['code-review']);
    window.history.back();
    await waitFor(() => expect(cardTitles()).toHaveLength(9));
  });

  it('suggests keywords when nothing matches', async () => {
    const user = await open('#/?q=zzzzqqq');
    expect(screen.getByText('No matches')).toBeTruthy();
    await user.click(within(document.querySelector('.popular') as HTMLElement).getAllByRole('button')[0]!);
    await waitFor(() => expect(screen.queryByText('No matches')).toBeNull());
  });

  it('shows the empty state for an empty marketplace', async () => {
    await open('#/', fixtureCatalog('empty'));
    expect(screen.getByText('No plugins published yet')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'CONTRIBUTING.md' }).getAttribute('href')).toBe('https://github.com/acme/market/blob/main/CONTRIBUTING.md');
  });

  it('shows an error when the catalog cannot be loaded', async () => {
    await open('#/', { status: 404 });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('catalog.json returned HTTP 404'));
  });

  it('copies the install command from a card', async () => {
    const user = await open();
    await user.click(screen.getAllByRole('button', { name: 'Copy install command for qa-toolkit' })[0]!);
    expect(await navigator.clipboard.readText()).toBe('/plugin install qa-toolkit@dev-digest-marketplace');
    await waitFor(() => expect(screen.getAllByText('Copied').length).toBeGreaterThan(0));
  });

  it('has no accessibility violations', async () => {
    await open();
    expect(await violations()).toEqual([]);
  });
});

describe('artifact page', () => {
  it('shows details, body and the install commands built from catalog data', async () => {
    await open('#/a/code-quality%2Fskill%2Fcode-review');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('code-review');
    expect(screen.getByText('/plugin marketplace add acme/market')).toBeTruthy();
    expect(screen.getByText('/plugin install code-quality@dev-digest-marketplace')).toBeTruthy();
    expect(screen.getByText('allowed-tools')).toBeTruthy();
    expect(screen.getByText(/ships in the code-quality plugin/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /View source on GitHub/ }).getAttribute('href')).toBe(
      'https://github.com/acme/market/blob/main/plugins/code-quality/skills/code-review/SKILL.md',
    );
  });

  it('copies both commands and confirms', async () => {
    const user = await open('#/a/qa-toolkit');
    await user.click(screen.getByRole('button', { name: 'Copy both commands' }));
    expect(await navigator.clipboard.readText()).toBe('/plugin marketplace add acme/market\n/plugin install qa-toolkit@dev-digest-marketplace');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy both commands' }).textContent).toBe('Copied'));
  });

  it('reports a failed copy', async () => {
    const user = await open('#/a/qa-toolkit');
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
    document.execCommand = vi.fn(() => false);
    await user.click(screen.getByRole('button', { name: 'Copy install command' }));
    await waitFor(() => expect(screen.getByText(/Copy failed/)).toBeTruthy());
  });

  it('adds a copy button to code blocks', async () => {
    const user = await open('#/a/code-quality%2Fskill%2Fcode-review');
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await navigator.clipboard.readText()).toContain('### Blocking');
  });

  it('lists what a plugin with hooks or MCP servers runs', async () => {
    await open('#/a/code-quality');
    const notice = screen.getByRole('heading', { name: 'What this plugin runs' }).closest('section')!;
    expect(notice.textContent).toContain('PostToolUse · Edit|Write → npx prettier');
  });

  it('does not show the notice for plugins without hooks or servers', async () => {
    await open('#/a/qa-toolkit');
    expect(screen.queryByRole('heading', { name: 'What this plugin runs' })).toBeNull();
  });

  it('lists the children of a plugin', async () => {
    await open('#/a/code-quality');
    const children = screen.getByRole('heading', { name: 'In this plugin' }).closest('section')!;
    expect(within(children).getAllByRole('listitem')).toHaveLength(3);
  });

  it('explains external plugins and links to their repository', async () => {
    await open('#/a/release-notes');
    expect(screen.getByText(/source is external/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /View source on GitHub/ }).getAttribute('href')).toBe('https://github.com/acme-tools/release-notes');
  });

  it('never shows environment values', async () => {
    await open('#/a/github-tools%2Fmcp-server%2Fgithub');
    expect(document.body.textContent).toContain('GITHUB_PERSONAL_ACCESS_TOKEN (value not published)');
    expect(document.body.textContent).not.toContain('ghp_fixture_secret_value');
  });

  it('hides the install note when it is empty', async () => {
    await open('#/a/qa-toolkit', fixtureCatalog('full', { repoSlug: 'acme/market', installNote: '' }));
    expect(screen.queryByText(/The repository is private/)).toBeNull();
  });

  it('shows the install note', async () => {
    await open('#/a/qa-toolkit');
    expect(screen.getByText(/The repository is private/)).toBeTruthy();
  });

  it('links back to the last search', async () => {
    const user = await open('#/?q=review');
    await user.click(screen.getAllByRole('link', { name: 'code-review' })[0]!);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('code-review'));
    expect(screen.getByRole('link', { name: /Back to search/ }).getAttribute('href')).toBe('#/?q=review');
  });

  it('has no accessibility violations', async () => {
    await open('#/a/code-quality');
    expect(await violations()).toEqual([]);
  });
});

describe('not found', () => {
  it('shows the page for an unknown artifact id', async () => {
    await open('#/a/does-not-exist');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Not found');
    expect(screen.getByText('does-not-exist')).toBeTruthy();
  });

  it('shows the page for an unknown route', async () => {
    await open('#/nope');
    expect(screen.getByRole('link', { name: 'Go to the catalog' }).getAttribute('href')).toBe('#/');
  });
});

describe('shell', () => {
  it('toggles and persists the theme', async () => {
    const user = await open();
    const toggle = screen.getByRole('switch', { name: 'Light theme' });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    await user.click(toggle);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('focuses the search box when "/" is pressed', async () => {
    const user = await open();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard('/');
    await waitFor(() => expect(document.activeElement?.id).toBe('q'));
  });

  it('renders the footer from catalog data', async () => {
    await open();
    expect(screen.getByText('Generated from marketplace.json on 2026-10-17')).toBeTruthy();
  });
});
