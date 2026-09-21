import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
export default function NotFound() {
  return (
    <>
      <PublicHeader />
      <main id="main-content" className="not-found">
        <span className="eyebrow">404 · PAGE NOT FOUND</span>
        <h1>
          A different
          <br />
          way home.
        </h1>
        <p>This page may have moved, or the address may be incorrect.</p>
        <Link href="/" className="action">
          Return to home
        </Link>
        <Link href="/login" className="text-link">
          Sign in to your workspace
        </Link>
      </main>
    </>
  );
}
