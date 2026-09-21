"use client";
import Link from "next/link";
import { usePreference, setPreference } from "@/lib/browser-preferences";
import { useEffect, useRef, useState } from "react";
import {
  MoonIcon,
  SunIcon,
  MagnifyingGlassIcon,
  XIcon,
  ArrowUpIcon,
} from "@phosphor-icons/react";
const pages = [
  { title: "Home", href: "/" },
  { title: "Sign in", href: "/login" },
  { title: "Reset your password", href: "/forgot-password" },
  { title: "Privacy policy", href: "/privacy" },
  { title: "Terms and conditions", href: "/terms" },
  { title: "Cookie policy", href: "/cookies" },
  { title: "Refund policy", href: "/refunds" },
];
export function SiteTools() {
  const theme = usePreference("verdant-theme");
  const dark = theme === "dark";
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  function toggle() {
    try {
      setPreference("verdant-theme", dark ? "light" : "dark");
    } catch {
      document.documentElement.dataset.theme = dark ? "light" : "dark";
    }
  }
  return (
    <>
      <div className="site-tools">
        <button
          className="icon-button"
          onClick={() => dialog.current?.showModal()}
          aria-label="Search site pages"
        >
          <MagnifyingGlassIcon size={20} />
        </button>
        <button
          className="icon-button"
          onClick={toggle}
          aria-label={dark ? "Use light appearance" : "Use dark appearance"}
        >
          {dark ? <SunIcon size={20} /> : <MoonIcon size={20} />}
        </button>
      </div>
      <dialog
        ref={dialog}
        className="search-dialog"
        aria-labelledby="search-title"
      >
        <div className="dialog-heading">
          <h2 id="search-title">Find your way</h2>
          <button
            className="icon-button"
            onClick={() => dialog.current?.close()}
            aria-label="Close search"
          >
            <XIcon size={20} />
          </button>
        </div>
        <label htmlFor="site-search">Search public pages</label>
        <input
          id="site-search"
          type="search"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try privacy or sign in"
        />
        <nav aria-label="Search results">
          {pages
            .filter((p) => p.title.toLowerCase().includes(query.toLowerCase()))
            .map((p) => (
              <Link
                onClick={() => dialog.current?.close()}
                href={p.href}
                key={p.href}
              >
                {p.title}
                <span aria-hidden="true">↗</span>
              </Link>
            ))}
          {!pages.some((p) =>
            p.title.toLowerCase().includes(query.toLowerCase()),
          ) && <p role="status">No pages found. Try another word.</p>}
        </nav>
      </dialog>
    </>
  );
}
export function BackToTop() {
  return (
    <a href="#top" className="back-top" aria-label="Back to top">
      <ArrowUpIcon size={20} />
    </a>
  );
}
