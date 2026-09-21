import { PolicyPage } from "@/components/policy-page";
export const metadata = {
  title: "Refund policy",
  description:
    "Refund policy for the Verdant product demonstration. Draft pending operator review.",
};
export default function Page() {
  return (
    <PolicyPage title="Refund policy">
      <section>
        <h2>Policy not yet established</h2>
        <p>
          Verdant does not yet have agreed commercial refund rules. No refund
          window, eligibility promise or blanket no-refund condition is being
          advertised.
        </p>
      </section>
      <section>
        <h2>Estate charges and subscriptions</h2>
        <p>
          Estate dues are separate from a future subscription to Verdant. The
          authorised estate operator must explain what each charge covers, how
          disputes are handled and which refund rules apply before accepting
          real payments.
        </p>
      </section>
      <section>
        <h2>Before accepting payments</h2>
        <p>
          A legal operator, support contact, pricing, cancellation process and
          refund terms must be published and reviewed for applicable Nigerian
          consumer law. This draft is not a substitute for those decisions. Do
          not make a real payment as part of a product demonstration.
        </p>
      </section>
      <section>
        <h2>Payment queries</h2>
        <p>
          Keep the payment reference and contact the administrator who provided
          your account if you encounter a test-payment problem. Never share your
          password, card PIN or one-time payment code. No public support email
          has been designated yet.
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
