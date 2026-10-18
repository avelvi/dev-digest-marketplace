import { artifactHref } from '../lib/route';
import { highlight } from '../lib/search';
import { installCommand } from '../lib/install';
import { TYPE_LABEL, type Artifact } from '../types/catalog';
import { CopyButton } from './Copy';

function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlight(text, terms).map((s, i) =>
        s.match ? (
          <mark key={i} className="hl">
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

interface Props {
  artifact: Artifact;
  terms: string[];
  marketplaceName: string;
}

export function ArtifactCard({ artifact: a, terms, marketplaceName }: Props) {
  const href = artifactHref(a.id);
  return (
    <li className="card">
      <a href={href} className="card-overlay" aria-hidden="true" tabIndex={-1} />
      <span className="badge">{TYPE_LABEL[a.type]}</span>
      <div className="card-head">
        <h2 className="card-title">
          <a href={href}>
            <Highlighted text={a.name} terms={terms} />
          </a>
        </h2>
        {a.type !== 'plugin' && (
          <p className="card-plugin">
            in <a href={artifactHref(a.plugin)}>{a.plugin}</a>
          </p>
        )}
      </div>
      <p className="card-desc">
        <Highlighted text={a.description} terms={terms} />
      </p>
      <div className="keywords">
        {a.keywords.slice(0, 4).map((k) => (
          <span key={k} className="kw">
            {k}
          </span>
        ))}
      </div>
      <div className="card-foot">
        <span className="card-version">{a.version ? `v${a.version}` : ''}</span>
        <CopyButton
          copyKey={`card:${a.id}`}
          text={installCommand(a.plugin, marketplaceName)}
          idle="Copy install"
          ariaLabel={`Copy install command for ${a.plugin}`}
        />
      </div>
    </li>
  );
}
