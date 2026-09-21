"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePreference, setPreference } from "@/lib/browser-preferences";
const preferenceKey = "verdant-attribution-choice";
export function CookiePreferences({ banner = false }: { banner?: boolean }) {
  const choice = usePreference(preferenceKey);
  const [message, setMessage] = useState("");
  function choose(allow: boolean) {
    const next = allow ? "allowed" : "declined";
    try {
      setPreference(preferenceKey, next);
      sessionStorage.removeItem("verdant-attribution");
      if (allow) {
        const query = new URLSearchParams(location.search),
          data: Record<string, string> = {};
        for (const key of [
          "utm_source",
          "utm_medium",
          "utm_campaign",
          "utm_content",
          "utm_term",
        ]) {
          const value = query.get(key);
          if (value)
            data[key] = value.replace(/[^a-zA-Z0-9 _.-]/g, "").slice(0, 80);
        }
        if (Object.keys(data).length)
          sessionStorage.setItem("verdant-attribution", JSON.stringify(data));
      }
      setMessage("Your preference has been saved.");
    } catch {
      setMessage(
        "Browser storage is unavailable. Optional attribution remains off.",
      );
    }
  }
  useEffect(() => {
    if (choice !== "allowed") return;
    try {
      const q = new URLSearchParams(location.search);
      const data: Record<string, string> = {};
      for (const key of [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
      ]) {
        const value = q.get(key);
        if (value)
          data[key] = value.replace(/[^a-zA-Z0-9 _.-]/g, "").slice(0, 80);
      }
      if (Object.keys(data).length)
        sessionStorage.setItem("verdant-attribution", JSON.stringify(data));
    } catch {}
  }, [choice]);
  if (banner && choice !== null) return null;
  return (
    <section
      className={banner ? "cookie-banner" : "cookie-settings"}
      aria-label="Cookie preferences"
    >
      <div>
        <strong>
          {banner ? "Your visit, your choice." : "Cookie preferences"}
        </strong>
        <p>
          Essential sign-in storage is used when needed. Optional campaign
          attribution stays on this device and is off unless you allow it.{" "}
          <Link href="/cookies">Read the cookie policy</Link>.
        </p>
      </div>
      <div className="header-actions">
        <button className="action secondary" onClick={() => choose(false)}>
          Decline optional
        </button>
        <button className="action secondary" onClick={() => choose(true)}>
          Allow attribution
        </button>
      </div>
      {!banner && (
        <p role="status">
          {message ||
            `Optional attribution: ${choice === "allowed" ? "enabled" : "off"}.`}
        </p>
      )}
    </section>
  );
}
