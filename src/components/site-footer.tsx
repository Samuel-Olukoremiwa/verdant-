import Link from "next/link";
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div>
        <Link href="/" className="footer-brand">
          verdant.
        </Link>
        <p>Estate operations, with room to breathe.</p>
        <small>Product demonstration · Nigeria</small>
      </div>
      <nav aria-label="Policies">
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/cookies">Cookies</Link>
        <Link href="/refunds">Refunds</Link>
      </nav>
      <p className="footer-note">
        Verdant is a product name. Estate names shown in this demonstration are
        fictional.
      </p>
    </footer>
  );
}
