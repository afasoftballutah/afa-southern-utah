/**
 * Published site documents — plain paragraphs, optional PDF link.
 */
export default function SiteDocList({ docs = [], empty = null }) {
  if (!docs.length) {
    return empty ? <p className="t-meta">{empty}</p> : null;
  }
  return (
    <div className="space-y-4">
      {docs.map((d) => (
        <article key={d.id || d.slug} className="card p-4 space-y-2">
          <h2 className="t-heading text-lg">{d.title}</h2>
          {d.source_url && (
            <p>
              <a
                href={d.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-info"
              >
                Open PDF / link
              </a>
            </p>
          )}
          {d.body?.trim() && (
            <div className="space-y-3 text-sm text-afa-ink/90 leading-relaxed">
              {d.body
                .trim()
                .split(/\n{2,}/)
                .map((para, i) => (
                  <p key={i} className="whitespace-pre-wrap">
                    {para}
                  </p>
                ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
