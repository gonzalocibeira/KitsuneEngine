import type { ReactNode } from "react";
import "./styles.css";

export function BrandedHomeScreen({
  backHref,
  children,
  panelDescription,
  panelEyebrow,
  panelTitle,
  tagline,
  title
}: {
  backHref?: string;
  children: ReactNode;
  panelDescription: string;
  panelEyebrow: string;
  panelTitle: string;
  tagline: string;
  title: string;
}) {
  const titleId = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-home-title`;

  return (
    <main className="branded-home" data-branded-home>
      {backHref && (
        <a className="branded-home-back" href={backHref} data-route>
          Back to Kitsune
        </a>
      )}
      <section className="branded-home-intro" aria-labelledby={titleId}>
        <div className="branded-home-mark" aria-hidden="true">
          <span />
          <span />
        </div>
        <p className="branded-home-eyebrow">Kitsune Engine</p>
        <h1 id={titleId}>{title}</h1>
        <p className="branded-home-tagline">{tagline}</p>
      </section>

      <section className="branded-home-panel">
        <div>
          <p className="branded-home-eyebrow">{panelEyebrow}</p>
          <h2>{panelTitle}</h2>
          <p>{panelDescription}</p>
        </div>
        {children}
      </section>
    </main>
  );
}
