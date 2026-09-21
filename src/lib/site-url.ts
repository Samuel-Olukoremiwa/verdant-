export function siteUrl() {
  const deployment = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const configured = deployment
    ? `https://${deployment}`
    : process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      "http://localhost:3000";
  try {
    return new URL(configured);
  } catch {
    return new URL("http://localhost:3000");
  }
}
