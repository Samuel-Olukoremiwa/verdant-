import { PublicHeader } from "./public-header";
import { SiteFooter } from "./site-footer";
export function PolicyPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="policy-content">
        <span className="eyebrow">VERDANT · PRODUCT DEMONSTRATION</span>
        <h1>{title}</h1>
        <p className="policy-date">Last updated 21 September 2026</p>
        <div className="policy-note">
          <strong>Draft for review</strong>
          <p>
            Verdant is a product name. A legal operator, public business address
            and support/privacy contact have not yet been established. This
            draft must be completed before public launch.
          </p>
        </div>
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
