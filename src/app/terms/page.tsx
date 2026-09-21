import { PolicyPage } from "@/components/policy-page";
export const metadata = {
  title: "Terms and conditions",
  description:
    "Terms and conditions for the Verdant product demonstration. Draft pending operator review.",
};
export default function Page() {
  return (
    <PolicyPage title="Terms and conditions">
      <section>
        <h2>Demonstration status</h2>
        <p>
          This site presents Verdant, an estate-management product in
          development. Estate names and demonstration records are illustrative.
          They do not represent customer endorsements, adoption figures or
          guaranteed results.
        </p>
      </section>
      <section>
        <h2>Account use</h2>
        <p>
          Use only an account you are authorised to access. Keep sign-in details
          private. Do not attempt to access another household’s records, tamper
          with payments or misuse visitor invitations. Estate administrators
          determine which people are invited into their workspace.
        </p>
      </section>
      <section>
        <h2>Product functions</h2>
        <p>
          The application provides resident records, billing tools and gate
          access workflows. Estate decisions and charges remain the
          responsibility of the relevant estate operator. Access logs and
          visitor codes are operational tools and are not a guarantee of
          physical security.
        </p>
      </section>
      <section>
        <h2>Commercial terms pending</h2>
        <p>
          No public subscription pricing or commercial service commitment has
          been established. The legal operator, contact details, service terms
          and complaint process must be published before commercial use. Nothing
          in this draft removes rights that cannot lawfully be excluded under
          applicable Nigerian law.
        </p>
      </section>
      <p>
        <a href="https://fccpc.gov.ng/consumers/">
          Federal Competition and Consumer Protection Commission
        </a>
      </p>
    </PolicyPage>
  );
}
