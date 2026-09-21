import { PolicyPage } from "@/components/policy-page";
import { CookiePreferences } from "@/components/cookie-preferences";
export const metadata = {
  title: "Cookie policy",
  description:
    "Cookie policy for the Verdant product demonstration. Draft pending operator review.",
};
export default function Page() {
  return (
    <PolicyPage title="Cookie policy">
      <section>
        <h2>Essential authentication</h2>
        <p>
          Signing in uses Supabase authentication cookies to maintain a session.
          Blocking or deleting them can sign you out or prevent account features
          from working. These are separate from optional analytics choices.
        </p>
      </section>
      <section>
        <h2>Appearance preference</h2>
        <p>
          The verdant-theme browser storage value remembers your light or dark
          appearance choice on this device. It is not an advertising identifier
          and remains until you change it or clear browser storage.
        </p>
      </section>
      <section>
        <h2>Optional campaign attribution</h2>
        <p>
          If you enable it, the site stores only the utm_source, utm_medium,
          utm_campaign, utm_content and utm_term values from the current page
          address in this tab’s session storage. Values are limited in length.
          They are not transmitted to an analytics service. The record is
          cleared when you decline or close the tab. Your preference is stored
          locally until changed.
        </p>
      </section>
      <section>
        <h2>Third-party services</h2>
        <p>
          No social-media, video, advertising or map embeds are included in the
          current site. Payment and authentication providers can have their own
          policies when their services are used. Hosting request logs are
          distinct from optional browser tracking.
        </p>
      </section>
      <section>
        <h2>Managing preferences</h2>
        <p>
          Use Cookie preferences below to enable or decline optional campaign
          attribution. You can also delete site storage through your browser
          settings. Declining optional attribution does not block sign-in or
          other essential features.
        </p>
      </section>
      <CookiePreferences />
    </PolicyPage>
  );
}
