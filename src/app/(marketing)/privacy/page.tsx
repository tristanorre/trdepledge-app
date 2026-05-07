import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How T.R. Depledge Gardening & Maintenance collects, uses and protects personal information — written for the Privacy Act 1988 (Cth).",
};

// Last reviewed: bump this when content changes. Shown to the user so
// they can tell whether they're looking at fresh terms.
const EFFECTIVE_DATE = "7 May 2026";

export default function PrivacyPage() {
  return (
    <>
      <section style={{ background: "var(--yellow)", padding: "80px 0", textAlign: "center" }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <div className="eyebrow dark" style={{ justifyContent: "center" }}>Legal</div>
          <h1 className="section-title" style={{ marginBottom: 16 }}>
            Privacy <em>Policy</em>
          </h1>
          <p className="section-lead" style={{ margin: "0 auto" }}>
            How we handle the information you share with us. Effective {EFFECTIVE_DATE}.
          </p>
        </div>
      </section>

      <section style={{ padding: "64px 0", background: "var(--off)" }}>
        <div className="container" style={{ maxWidth: 760 }}>
          <Section title="Who we are">
            <p>
              T.R. Depledge Gardening &amp; Maintenance is a sole-trader business operating from
              Wallaroo, South Australia (ABN registered 30 November 2020). In this policy
              &quot;we&quot;, &quot;us&quot; and &quot;our&quot; refers to T.R. Depledge Gardening &amp; Maintenance.
              Our registered contact is Thomas Depledge.
            </p>
            <p>
              We are committed to protecting your privacy and complying with the Privacy Act
              1988 (Cth) and the Australian Privacy Principles.
            </p>
          </Section>

          <Section title="What we collect">
            <p>When you use our website or services, we may collect:</p>
            <ul>
              <li><strong>Contact details</strong> — name, email address, phone number</li>
              <li><strong>Location</strong> — suburb or property address (for quoting and scheduling)</li>
              <li><strong>Job-related information</strong> — what you&apos;ve asked us to do, photos of the work area, notes our team makes during a job</li>
              <li><strong>Account type</strong> — whether you&apos;re a private client, NDIS participant, aged-care client or business</li>
              <li><strong>Billing details</strong> — for clients we invoice, the information needed to issue an invoice (we do not store credit-card numbers — payment is handled by our invoicing provider)</li>
            </ul>
            <p>
              We do not sell your personal information. We do not use your data for advertising
              or marketing without your prior consent.
            </p>
          </Section>

          <Section title="How we use it">
            <ul>
              <li>To respond to enquiries you submit through the website or by phone</li>
              <li>To plan, quote, schedule and carry out the gardening work you&apos;ve asked us for</li>
              <li>To send you confirmations, reminders or updates about your job by SMS or email</li>
              <li>To issue invoices and keep our financial and tax records (a legal obligation under Australian tax law)</li>
              <li>For NDIS or aged-care clients, to maintain the records required by the NDIS Practice Standards or Home Care Package rules</li>
            </ul>
          </Section>

          <Section title="Who we share it with">
            <p>
              We share information only with the service providers we need to run the business.
              Each one only receives what they need to do their job:
            </p>
            <ul>
              <li><strong>Supabase</strong> (database hosting) — stores enquiries, client records, jobs, photos</li>
              <li><strong>Vercel</strong> (website hosting) — serves the website and app</li>
              <li><strong>Twilio</strong> (SMS gateway) — delivers SMS confirmations and reminders</li>
              <li><strong>Resend</strong> (email delivery) — sends transactional emails (e.g. &quot;new enquiry&quot;)</li>
              <li><strong>OneSignal</strong> (push notifications) — sends push notifications to staff devices</li>
              <li><strong>Xero</strong> (accounting) — for invoicing and payroll</li>
            </ul>
            <p>
              Some of these providers store data outside Australia. We use providers with
              comparable privacy protections, but if you would prefer your information to be
              handled by an Australian-only provider, contact us and we will discuss options.
            </p>
            <p>
              We may also disclose information where required by law (e.g. to a regulator, the
              ATO, or in response to a court order).
            </p>
          </Section>

          <Section title="How long we keep it">
            <p>
              Enquiry submissions that don&apos;t turn into jobs are kept for up to 12 months and
              then deleted. Active and former client records, invoices and job histories are
              kept for at least 7 years to meet Australian tax-record obligations, then
              archived or deleted.
            </p>
            <p>
              Photos taken during a job are retained alongside the job record. Let us know if
              you&apos;d like a specific photo removed.
            </p>
          </Section>

          <Section title="Your rights">
            <p>You can ask us to:</p>
            <ul>
              <li>Tell you what personal information we hold about you</li>
              <li>Correct anything that&apos;s wrong or out of date</li>
              <li>Delete your information (subject to records we&apos;re legally required to keep)</li>
              <li>Stop sending you SMS or email reminders</li>
            </ul>
            <p>
              We&apos;ll respond within 30 days. There&apos;s no charge for a reasonable request.
            </p>
          </Section>

          <Section title="Cookies and analytics">
            <p>
              The marketing pages don&apos;t use third-party tracking cookies or analytics. The
              field-management app sets a session cookie when staff log in — that&apos;s how we
              keep you signed in across pages. It&apos;s deleted when you log out.
            </p>
          </Section>

          <Section title="Security">
            <p>
              We use HTTPS across the site and the app. Staff accounts are password-protected
              and field workers use a personal PIN. The job database is locked down so that
              only authenticated staff (or our server code on their behalf) can read or write
              records — the public website cannot read your data.
            </p>
            <p>
              No system is perfectly secure. If we ever become aware of a breach affecting your
              information, we will notify you and the Office of the Australian Information
              Commissioner (OAIC) as required under the Notifiable Data Breaches scheme.
            </p>
          </Section>

          <Section title="Complaints">
            <p>
              If you&apos;re unhappy with how we&apos;ve handled your information, contact Thomas
              first — most issues can be sorted out quickly. If you&apos;re not satisfied with our
              response, you can lodge a complaint with the Office of the Australian Information
              Commissioner at <a href="https://www.oaic.gov.au" rel="noopener">oaic.gov.au</a> or
              by calling 1300 363 992.
            </p>
          </Section>

          <Section title="Updates">
            <p>
              We may update this policy when our practices or our service providers change.
              The effective date at the top of this page reflects the latest version.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For privacy questions, requests to access or correct your information, or any
              other concern about this policy:
            </p>
            <ul>
              <li>📞 <a href="tel:0474844204">0474 844 204</a></li>
              <li>✉ <a href="mailto:t.rdepledge@outlook.com">t.rdepledge@outlook.com</a></li>
              <li>📍 Wallaroo, South Australia</li>
            </ul>
          </Section>

          <p style={{ marginTop: 32, fontSize: 13, color: "var(--gray)" }}>
            <Link href="/contact" style={{ color: "var(--navy)" }}>← Back to contact</Link>
          </p>
        </div>
      </section>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginTop: 32 }} className="privacy-section">
      <h2 style={{
        fontFamily: "var(--font-display)", fontSize: 24,
        color: "var(--navy)", marginBottom: 12, lineHeight: 1.2,
      }}>
        {title}
      </h2>
      <div style={{ fontSize: 15, lineHeight: 1.75, color: "#3a3a3a" }}>{children}</div>
    </section>
  );
}
