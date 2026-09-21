import { PolicyPage } from "@/components/policy-page";
export const metadata = {
  title: "Privacy policy",
  description:
    "Privacy policy for the Verdant product demonstration. Draft pending operator review.",
};
export default function Page() {
  return (
    <PolicyPage title="Privacy policy">
      <section>
        <h2>About this demonstration</h2>
        <p>
          Verdant demonstrates estate administration, resident accounts, billing
          and gate access for communities in Nigeria. Evergreen is a fictional
          estate name. Please use sample data when exploring the demonstration.
        </p>
      </section>
      <section>
        <h2>Information used by the application</h2>
        <p>
          Account and estate features may process names, email addresses, phone
          numbers, household details, charges, payment references, visitor
          details and entry logs. Passwords are handled by the authentication
          provider. Card details are entered with the payment provider, rather
          than in Verdant forms.
        </p>
      </section>
      <section>
        <h2>Services and access</h2>
        <p>
          The application integrates Supabase for authentication and records,
          Paystack for payments, Resend for email and KudiSMS for text messages.
          Each integration receives information needed for its function when
          that function is used. Authorised estate staff and residents have
          different levels of record access. Hosting providers may also process
          technical request logs.
        </p>
      </section>
      <section>
        <h2>Choices and storage</h2>
        <p>
          No advertising or third-party analytics tracker is included in this
          site. Optional campaign attribution is off until you choose to enable
          it in cookie preferences. Theme preferences are stored on this device.
          See the cookie policy for details.
        </p>
      </section>
      <section>
        <h2>Before live use</h2>
        <p>
          The operator must publish its identity and contact, identify the
          lawful basis for each processing purpose, set retention and deletion
          periods, document service-provider arrangements and international
          transfers, and provide a working process for privacy requests. These
          items are not yet finalised. Do not submit identity documents or other
          unnecessary sensitive data.
        </p>
      </section>
      <section>
        <h2>Privacy rights</h2>
        <p>
          Applicable rights and obligations must be assessed under the Nigeria
          Data Protection Act 2023. Information about privacy rights and
          complaints is available from the Nigeria Data Protection Commission.
          This draft does not claim that the product or its operator is
          certified compliant.
        </p>
      </section>
      <p>
        <a href="https://ndpc.gov.ng/faqs/">
          Nigeria Data Protection Commission guidance
        </a>
      </p>
    </PolicyPage>
  );
}
