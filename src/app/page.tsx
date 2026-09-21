import Image from "next/image";
import Link from "next/link";
import { PublicHeader } from "@/components/public-header";
import { SiteFooter } from "@/components/site-footer";
export default function Home() {
  return (
    <div className="marketing">
      <PublicHeader />
      <main id="main-content">
        <section className="home-hero">
          <div className="hero-editorial">
            <h1>
              Less admin.
              <br />
              More <span>living.</span>
            </h1>
            <p>
              Bring residents, estate payments and gate access together. Leave
              more room for the everyday.
            </p>
            <Link href="/login" className="action hero-cta">
              Open your workspace <span aria-hidden="true">↗</span>
            </Link>
            <div className="hero-footnote">
              <span className="small-rule" />
              <p>
                For the people who run a community.
                <br />
                And everyone who calls it home.
              </p>
            </div>
          </div>
          <figure className="neighbourhood">
            <Image
              src="/images/verdant-neighbourhood.webp"
              alt="Illustrated concept of a leafy residential street with contemporary homes and green gates"
              fill
              sizes="(max-width: 800px) 100vw, 48vw"
              priority
            />
            <figcaption>
              <span>A little more together.</span>
              <small>Generated concept image · fictional neighbourhood</small>
            </figcaption>
          </figure>
        </section>
        <section className="product-story" id="how-it-works">
          <div className="section-intro">
            <span className="eyebrow">ONE CONNECTED WORKSPACE</span>
            <h2>
              All the moving parts.
              <br />A clearer picture.
            </h2>
            <p>
              From the estate office to the front gate, each person gets the
              tools that fit their day.
            </p>
          </div>
          <div className="feature-rows">
            <article>
              <span className="feature-number">01</span>
              <div>
                <h3>A place for every resident.</h3>
                <p>
                  Keep household records together. Residents can find their
                  account details, gate pass and visitor invitations in one
                  place.
                </p>
              </div>
              <span className="feature-tag">Residents</span>
            </article>
            <article>
              <span className="feature-number">02</span>
              <div>
                <h3>Know where payments stand.</h3>
                <p>
                  Issue estate charges, review balances and track receipts
                  without piecing together separate records.
                </p>
              </div>
              <span className="feature-tag">Billing</span>
            </article>
            <article>
              <span className="feature-number">03</span>
              <div>
                <h3>A better handover at the gate.</h3>
                <p>
                  Check resident passes, redeem visitor codes and keep an entry
                  log that the estate team can review.
                </p>
              </div>
              <span className="feature-tag">Access</span>
            </article>
          </div>
        </section>
        <section id="questions" className="faq-section">
          <div>
            <span className="eyebrow">GOOD TO KNOW</span>
            <h2>
              A few things,
              <br />
              before you step in.
            </h2>
            <p>
              This is a product demonstration for estate communities in Nigeria.
            </p>
          </div>
          <div className="faq-list">
            <details>
              <summary>Who is Verdant for?</summary>
              <p>
                Residents, estate administrators and gate staff. Account
                permissions determine which workspace and records each person
                can access.
              </p>
            </details>
            <details>
              <summary>Is Evergreen a real customer?</summary>
              <p>
                No. Evergreen is a fictional estate used while developing and
                demonstrating Verdant. It is not a customer endorsement.
              </p>
            </details>
            <details>
              <summary>How do I get an account?</summary>
              <p>
                An estate administrator issues account invitations. If you
                already have an account, use the sign-in page to open your
                workspace.
              </p>
            </details>
            <details>
              <summary>Can I purchase a subscription here?</summary>
              <p>
                No public subscription offer is available. Operator details,
                pricing and refund terms must be published before a commercial
                launch.
              </p>
            </details>
          </div>
        </section>
        <section className="closing-note">
          <h2>
            Make room for
            <br />a smoother day.
          </h2>
          <Link href="/login" className="action">
            Open your workspace <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
