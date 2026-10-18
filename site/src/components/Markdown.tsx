import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CopyButton } from './Copy';

// Raw HTML is never rendered. Only absolute http(s) and mailto links survive;
// "#anchor" links are dropped because the router owns the URL hash.
const SAFE_URL = /^(https?:\/\/|mailto:)/i;
const safeUrl = (url: string) => (SAFE_URL.test(url) ? url : '');

function nodeText(node: unknown): string {
  const n = node as { value?: string; children?: unknown[] } | undefined;
  return n?.value ?? (n?.children ?? []).map(nodeText).join('');
}

function CodeBlock({ node, children, id }: { node?: unknown; children?: ReactNode; id: string }) {
  const text = nodeText(node).replace(/\n$/, '');
  return (
    <div className="codeblock">
      <CopyButton copyKey={id} text={text} idle="Copy" ariaLabel="Copy code" />
      <pre>{children}</pre>
    </div>
  );
}

export function Markdown({ source, idPrefix }: { source: string; idPrefix: string }) {
  let blockCount = 0;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={safeUrl}
      components={{
        h1: (p: ComponentPropsWithoutRef<'h2'>) => <h2>{p.children}</h2>,
        h2: (p: ComponentPropsWithoutRef<'h2'>) => <h2>{p.children}</h2>,
        h3: (p: ComponentPropsWithoutRef<'h3'>) => <h3>{p.children}</h3>,
        h4: (p: ComponentPropsWithoutRef<'h3'>) => <h3>{p.children}</h3>,
        h5: (p: ComponentPropsWithoutRef<'h3'>) => <h3>{p.children}</h3>,
        h6: (p: ComponentPropsWithoutRef<'h3'>) => <h3>{p.children}</h3>,
        a: ({ href, children }) =>
          href ? (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ) : (
            <span>{children}</span>
          ),
        img: ({ src, alt }) =>
          typeof src === 'string' && /^https?:\/\//i.test(src) ? (
            <img src={src} alt={alt ?? ''} loading="lazy" referrerPolicy="no-referrer" />
          ) : null,
        pre: ({ node, children }) => <CodeBlock node={node} id={`${idPrefix}:${blockCount++}`}>{children}</CodeBlock>,
      }}
    >
      {source}
    </ReactMarkdown>
  );
}
