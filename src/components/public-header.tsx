"use client";
import Link from "next/link";
import { useState } from "react";
import { SiteTools } from "./site-tools";
export function PublicHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="public-header">
      <Link href="/" className="wordmark" aria-label="Verdant home">
        <span className="brand-mark">V</span>verdant
        <span className="brand-period">.</span>
      </Link>
      <button
        className="menu-button"
        aria-expanded={open}
        aria-controls="public-navigation"
        onClick={() => setOpen(!open)}
      >
        {open ? "Close menu" : "Menu"}
      </button>
      <nav
        id="public-navigation"
        className={open ? "public-nav open" : "public-nav"}
        aria-label="Main navigation"
      >
        <Link href="/#how-it-works" onClick={() => setOpen(false)}>
          How it works
        </Link>
        <Link href="/#questions" onClick={() => setOpen(false)}>
          Questions
        </Link>
        <Link href="/login" className="action">
          Sign in <span aria-hidden="true">↗</span>
        </Link>
      </nav>
      <SiteTools />
    </header>
  );
}
