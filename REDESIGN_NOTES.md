# Verdant redesign and launch review

Updated 21 September 2026. This is a pitch demonstration, not a certified production launch.

## Scope delivered

Existing routes retain their purpose. No separate demo, pricing, contact or marketing pages were added. The four requested policy routes are `/privacy`, `/terms`, `/cookies`, `/refunds`; the custom missing-page screen uses Next.js's existing 404 convention.

- New homepage: forest green, lime accents, Manrope headings and DM Sans body text, original compressed neighbourhood artwork, one workspace CTA and expandable FAQ.
- Shared appearance for admin, resident, gate and authentication screens: typography, surfaces, fields, tables, buttons, spacing, mobile navigation and light/dark preferences.
- Public page search (not a search across private records), sticky navigation, skip link, password visibility, back-to-top control, reduced-motion support and CSS scroll progress where supported.
- Native modal confirmations for resident status, staff removal and visitor cancellation. Existing invitation copy buttons remain available.
- No invented customer, testimonial, adoption metric, operator, address, email or refund promise. Sample-estate labels replace Evergreen in account screens.
- Four policy drafts disclose missing operator/contact/refund decisions. They need review and completion before real public use.
- Optional UTM attribution requires an explicit choice; only five sanitised, length-limited campaign fields are stored in this tab, with no analytics transmission. Declining clears attribution. Authentication storage remains separate.
- Local fonts, responsive WebP image, favicon, social preview, route titles/descriptions, sitemap and robots file. The pitch remains `noindex`; robots disallows crawling. Change indexing deliberately when ready to launch. Set a correct HTTPS site URL; Vercel's production-domain setting takes precedence for metadata.

## Security changes

- Supabase service-role module has a server-only import guard.
- Session refresh proxy for account routes; role checks remain in server layouts/handlers. Private responses are marked no-store.
- Same-origin checks and declared request-size checks on mutation APIs, excluding the signed Paystack webhook.
- Registration now goes through a strict server allowlist, verifies acknowledgement, rejects a honeypot, records acknowledgement version/time, and uses an atomic database-backed five-per-hour submission bucket. Unknown fields cannot set approval state.
- Resident status API requires a UUID and boolean, rejects additional fields, and reports account-lock synchronisation failure instead of silently reporting success.
- Secure production/SameSite=Lax authentication cookies; HSTS, anti-framing, MIME sniffing, referrer and permissions headers. Camera remains available to the gate scanner. Vercel HTTP account/API requests redirect to HTTPS; public HTTPS also depends on hosting configuration.
- CSP restricts framing, objects, base URLs, assets and connections. It retains inline scripts/styles for Next.js and existing UI compatibility; this is not a strict nonce-based CSP.

## Required database step

Apply `supabase/migration_design_security.sql` after the existing migrations and before deploying these changes. It adds registration acknowledgement columns, a private throttle table/function and revokes direct client registration inserts. Existing registration records are retained.

The updated registration endpoint fails closed if that migration has not been applied. No live migration was run during this work.

## Verification

- TypeScript and ESLint pass.
- 48 isolated regression tests pass, including existing payment/visitor/RLS/SMS tests plus registration field tampering, consent, honeypot, validation and atomic rate-limit tests. These tests use an isolated database and mocked notification calls.
- Production build verified; see final response for the latest result.
- Browser inspected homepage in light and dark modes, mobile menu at 390px, search filtering, policy navigation and mobile login/password visibility. Login viewport had no horizontal overflow.
- Authenticated page visual inspection with synthetic components was blocked by automatic browser approval review. Shared styles compile, but this is not equivalent to visually checking every authenticated screen.
- npm audit: zero reported vulnerabilities on 21 September 2026. This does not guarantee absence of vulnerabilities.
- Scanned 206 Git-history blobs for current private environment values and payment-secret patterns: no matches. No history rewrite was needed. This is a bounded scan, not proof that no historical secret of any kind exists.
- No test SMS, email or real payment was sent. No live records were modified by testing.

## Still needs deployment/operator verification

1. Apply the new SQL, then verify registration using approved sample details. Confirm earlier RLS migrations are actually installed in the deployed database.
2. Configure and verify Supabase authentication rate limits and bot/CAPTCHA protection. Registration throttling is not a substitute for login protection, and a honeypot is not a CAPTCHA.
3. Verify production TLS, headers, cookie flags, provider configuration, backups, encryption-at-rest and access policies. Password hashing is handled by Supabase Auth; no custom password store was added. Browser-based Supabase sessions cannot simply be made HttpOnly without changing the authentication architecture.
4. Complete operator identity, support/privacy contact, address, retention/deletion policy, lawful bases, processor agreements, cross-border transfer assessment and applicable Nigerian legal review. No certification or legal-compliance guarantee is made.
5. Define refund/cancellation terms and use payment-provider test mode for demonstrations. This work does not disable the existing payment integration or automatically switch its credentials.
6. Check deployed performance with real device/network conditions and all authenticated roles. A production build is not a Lighthouse score or an exhaustive accessibility audit.
7. No file-upload workflow or third-party advertising/video/map embed was found in the reviewed source. Reassess restrictions if those features are added. No application-level encryption of resident fields was added; provider encryption and key management need verification.

Official review references: https://ndpc.gov.ng/faqs/ and https://fccpc.gov.ng/consumers/ .

## Backup and design record

Pre-redesign source backup: `/Users/simon/.codex/visualizations/2026/09/20/01a0be42-9ee9-7ab3-ab6f-b4566b9f66af/ESTATE-before-redesign-20260921-053517`. Treat this backup as private because it contains environment configuration.

Requested skill installed at `.agents/skills/design-taste-frontend/SKILL.md`. Marketing design dials: variance 7, motion 3, density 4. Existing workspace components retain their functional layout, using the shared visual tokens. Palette: forest #183f32, lime #d7f56a, canvas #f5f7f2; dark canvas #101c17 with high-contrast text. Buttons are pill-shaped; panels use restrained rounded corners. No scroll fade, gradient hero, glass cards or fake reviews.

Artwork: `public/images/verdant-neighbourhood.webp`, generated with the image-generation tool as an original fictional neighbourhood concept; not competitor imagery or a photograph of a claimed customer. Self-hosted WebP, about 347 KB before responsive Next.js optimisation. Fonts are self-hosted via Fontsource; retain their package licence notices. The V monogram is an original code-native brand asset.

Image prompt: An original editorial architectural photograph-style image for Verdant, an estate-management software demonstration. A fictional contemporary Nigerian gated residential street, modest elegant two-storey homes in off-white plaster and warm natural brick, dark forest green gates, lush tropical trees with lime-green sunlit leaves, neat footpaths, one small figure walking in the distance. Slightly elevated street-level camera, morning sunlight and clear shadows, natural greens, inhabited neighbourhood rather than luxury resort. Portrait 4:5 composition. No text, logos, UI, watermark, recognisable real estate or real person.
