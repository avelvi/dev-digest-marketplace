export function NotFoundPage({ missing }: { missing: string }) {
  return (
    <section className="not-found">
      <p className="code">404</p>
      <h1>Not found</h1>
      <p>
        Nothing in the catalog matches <span className="mono">{missing}</span>. It may have been renamed or removed.
      </p>
      <a href="#/">Go to the catalog</a>
    </section>
  );
}
