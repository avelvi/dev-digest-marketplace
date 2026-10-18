import { useMemo } from 'react';
import { CopyButton } from '../components/Copy';
import { Markdown } from '../components/Markdown';
import { addMarketplaceCommand, installCommand } from '../lib/install';
import { artifactHref, buildHash, getLastSearch } from '../lib/route';
import { plural, splitInlineCode } from '../lib/text';
import { TYPE_LABEL, TYPE_ORDER, type Artifact, type Catalog, type ChildType } from '../types/catalog';
import { NotFoundPage } from './NotFoundPage';

interface Row {
  label: string;
  value: string;
}

function detailRows(a: Artifact): { title: string; rows: Row[] } {
  switch (a.type) {
    case 'plugin': {
      const d = a.details;
      const rows: Row[] = [];
      const contents = (Object.keys(d.counts) as ChildType[])
        .sort((x, y) => TYPE_ORDER.indexOf(x) - TYPE_ORDER.indexOf(y))
        .map((t) => plural(d.counts[t] ?? 0, TYPE_LABEL[t].toLowerCase()))
        .join(' · ');
      if (contents) rows.push({ label: 'Contents', value: contents });
      rows.push({ label: 'Dependencies', value: d.dependencies.length ? d.dependencies.join(', ') : 'none' });
      if (d.external && d.source) rows.push({ label: 'Source', value: d.source });
      return { title: 'Plugin', rows };
    }
    case 'hook':
      return {
        title: 'Hook',
        rows: [
          { label: 'Event', value: a.details.event },
          { label: 'Matcher', value: a.details.matcher || 'any' },
          { label: 'Hook type', value: a.details.hookType },
          { label: 'Command', value: a.details.command },
        ],
      };
    case 'mcp-server': {
      const d = a.details;
      const rows: Row[] = [
        { label: 'Server name', value: d.server },
        { label: 'Transport', value: d.transport },
      ];
      if (d.command) rows.push({ label: 'Command', value: d.command });
      if (d.url) rows.push({ label: 'URL', value: d.url });
      if (d.env.length) rows.push({ label: 'Environment', value: d.env.map((k) => `${k} (value not published)`).join(', ') });
      return { title: 'Server', rows };
    }
    default:
      return { title: 'Frontmatter', rows: Object.entries(a.details).map(([label, value]) => ({ label, value })) };
  }
}

export function ArtifactPage({ catalog, id }: { catalog: Catalog; id: string }) {
  const art = useMemo(() => catalog.artifacts.find((a) => a.id === id), [catalog, id]);
  if (!art) return <NotFoundPage missing={id} />;

  const mp = catalog.marketplace;
  const isPlugin = art.type === 'plugin';
  const external = art.type === 'plugin' && art.details.external === true;
  const { title: detailsTitle, rows } = detailRows(art);
  const children = isPlugin
    ? catalog.artifacts
        .filter((x) => x.plugin === art.name && x.type !== 'plugin')
        .sort((x, y) => TYPE_ORDER.indexOf(x.type) - TYPE_ORDER.indexOf(y.type) || x.name.localeCompare(y.name))
    : [];
  const runs = catalog.artifacts.filter((x) => x.plugin === art.plugin && (x.type === 'hook' || x.type === 'mcp-server'));

  const cmd1 = addMarketplaceCommand(mp.repoSlug);
  const cmd2 = installCommand(art.plugin, mp.name);
  const sourceUrl =
    art.type === 'plugin' && art.details.external
      ? (art.details.sourceUrl ?? mp.repoUrl)
      : `${mp.repoUrl}/${art.isDir ? 'tree' : 'blob'}/${mp.defaultBranch}/${art.sourcePath}`;

  const meta: { label: string; value: string; href?: string }[] = [
    ...(isPlugin ? [] : [{ label: 'Plugin', value: art.plugin, href: artifactHref(art.plugin) }]),
    ...(art.version ? [{ label: 'Version', value: art.version }] : []),
    ...(art.author ? [{ label: 'Author', value: art.author }] : []),
    ...(art.license ? [{ label: 'License', value: art.license }] : []),
    ...(art.category ? [{ label: 'Category', value: art.category, href: buildHash({ category: art.category }) }] : []),
  ];

  const runCommand = (x: Artifact): string =>
    x.type === 'hook'
      ? `${x.details.event} · ${x.details.matcher || 'any'} → ${x.details.command}`
      : x.type === 'mcp-server'
        ? `${x.details.transport} · ${x.details.command ?? x.details.url ?? ''}`
        : '';

  return (
    <>
      <nav aria-label="Breadcrumb" className="crumbs">
        <a href={getLastSearch()}>← Back to search</a>
      </nav>
      <section className="art-head">
        <span className="badge badge-lg">{TYPE_LABEL[art.type]}</span>
        <h1 className="art-title">{art.name}</h1>
        <p className="art-desc">{art.description}</p>
        <dl className="meta">
          {meta.map((m) => (
            <div key={m.label}>
              <dt>{m.label}</dt>
              <dd>{m.href ? <a href={m.href}>{m.value}</a> : <span>{m.value}</span>}</dd>
            </div>
          ))}
        </dl>
        <div className="kw-links">
          {art.keywords.map((k) => (
            <a key={k} href={buildHash({ q: k })}>
              {k}
            </a>
          ))}
        </div>
      </section>

      <div className="art-layout">
        <div className="art-main">
          {external && (
            <p className="note-box">
              This plugin&apos;s source is external (<span className="mono">{art.type === 'plugin' ? art.details.source : ''}</span>). Its contents are
              not indexed; the catalog shows the marketplace entry only.
            </p>
          )}

          {rows.length > 0 && (
            <section aria-labelledby="details-h" className="art-section">
              <h2 id="details-h" className="section-title">
                {detailsTitle}
              </h2>
              <dl className="detail-list">
                {rows.map((r) => (
                  <div key={r.label} className="detail-row">
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {art.bodyMarkdown && (
            <article aria-label="Documentation" className="prose">
              <Markdown source={art.bodyMarkdown} idPrefix={`code:${art.id}`} />
            </article>
          )}

          {art.type === 'plugin' && art.details.tree && (
            <section aria-labelledby="files-h" className="art-section">
              <h2 id="files-h" className="section-title">
                Files
              </h2>
              <pre className="filetree">{art.details.tree}</pre>
            </section>
          )}

          {children.length > 0 && (
            <section aria-labelledby="children-h" className="art-section">
              <h2 id="children-h" className="section-title">
                In this plugin
              </h2>
              <ul className="children">
                {children.map((ch) => (
                  <li key={ch.id}>
                    <span className="badge">{TYPE_LABEL[ch.type]}</span>
                    <div className="child-text">
                      <a href={artifactHref(ch.id)}>{ch.name}</a>
                      <span>{ch.description}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside aria-label="Install" className="aside">
          <section aria-labelledby="install-h" className="install">
            <div className="install-head">
              <h2 id="install-h">Install</h2>
              <p>
                {isPlugin
                  ? 'Run both commands in Claude Code.'
                  : `This ${TYPE_LABEL[art.type].toLowerCase()} ships in the ${art.plugin} plugin. Installing the plugin installs it along with everything else in the plugin.`}
              </p>
            </div>
            <div className="step">
              <p className="step-label">1 · Add the marketplace (once)</p>
              <div className="cmd">
                <code>{cmd1}</code>
                <CopyButton copyKey="i1" text={cmd1} idle="Copy" ariaLabel="Copy marketplace command" className="btn-small on-surface" />
              </div>
            </div>
            <div className="step">
              <p className="step-label">2 · Install the plugin</p>
              <div className="cmd">
                <code>{cmd2}</code>
                <CopyButton copyKey="i2" text={cmd2} idle="Copy" ariaLabel="Copy install command" className="btn-small on-surface" />
              </div>
            </div>
            <CopyButton copyKey="both" text={`${cmd1}\n${cmd2}`} idle="Copy both commands" ariaLabel="Copy both commands" className="btn-primary" />
            {catalog.installNote && (
              <p className="install-note">
                {splitInlineCode(catalog.installNote).map((s, i) => (s.code ? <code key={i}>{s.text}</code> : <span key={i}>{s.text}</span>))}
              </p>
            )}
            <a href={`${mp.repoUrl}/blob/${mp.defaultBranch}/README.md#trust-and-safety`} rel="noopener noreferrer">
              Read the plugin before installing it.
            </a>
          </section>

          {runs.length > 0 && (
            <section aria-labelledby="runs-h" className="runs">
              <div>
                <h2 id="runs-h">What this plugin runs</h2>
                <p className="runs-intro">Installing {art.plugin} enables these on your machine.</p>
              </div>
              <ul>
                {runs.map((r) => (
                  <li key={r.id}>
                    <div className="runs-head">
                      <span className="badge">{TYPE_LABEL[r.type]}</span>
                      <a href={artifactHref(r.id)}>{r.name}</a>
                    </div>
                    <code>{runCommand(r)}</code>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <a href={sourceUrl} rel="noopener noreferrer" className="source-link">
            View source on GitHub ↗
          </a>
        </aside>
      </div>
    </>
  );
}
