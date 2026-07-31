import Image from "next/image";

import HireApp from "@/components/hire/HireApp";
import {
  COUNTER_HOURS,
  HIRE_LOCATION,
  HIRE_PHONE,
  HIRE_PHONE_TEL,
  HIRE_POLICY,
  TERMS_ACCORDION_ORDER,
  today,
} from "@/lib/hire";
import { loadHireCatalogue } from "@/lib/hire/repo";
import { getServiceClient } from "@/lib/supabase";

// Availability changes hourly and "today" has to be resolved per request —
// a cached page would show yesterday's calendar to the first visitor each
// morning.
export const dynamic = "force-dynamic";

const STEPS = [
  { n: 1, title: "Pick your tool", body: "Daily rate and bond are shown up front on every item." },
  {
    n: 2,
    title: "Check the calendar",
    body: "Live availability. Anything hatched out is already booked.",
  },
  { n: 3, title: "Send the booking", body: "Thomas confirms by text, usually the same day." },
  { n: 4, title: "Collect and go", body: "Quick run-through on how it works before you leave." },
];

export default async function HirePage() {
  const supabase = getServiceClient();

  // Graceful degradation, matching the rest of the app: without credentials
  // the marketing content still renders and the phone number still works.
  const catalogue = supabase
    ? await loadHireCatalogue(supabase)
    : { today: today(), horizon: today(), entries: [] };

  return (
    <>
      <header className="bar">
        <div className="wrap bar-in">
          <a className="crest" href="#top">
            <Image
              className="crest-logo"
              src="/hire/logo-hire.webp"
              alt="T.R. Depledge DIY Hire, Wallaroo SA"
              width={460}
              height={486}
              priority
            />
            <span className="crest-txt">
              <b>T.R. Depledge</b>
              <span>DIY Hire · {HIRE_LOCATION}</span>
            </span>
          </a>
          <nav>
            <a href="#gear">The gear</a>
            <a href="#booking">Check a date</a>
            <a href="#rules">Hire terms</a>
          </nav>
          <a className="ring" href={`tel:${HIRE_PHONE_TEL}`}>
            {HIRE_PHONE}
          </a>
        </div>
      </header>

      <main>
          <section className="hero speck" id="top">
          <div className="wrap hero-grid">
            <div className="hero-left">
              <p className="eyebrow">Tool hire · {HIRE_LOCATION}</p>
              <h1>
                Hire the
                <br />
                tools. <em>Do it</em>
                <br />
                <em>yourself.</em>
              </h1>
              <span className="strap">Pick up in Wallaroo · Book online</span>
              <p className="lede">
                The same gear Thomas uses on Copper Coast jobs, available by the day when
                you&rsquo;d rather tackle it yourself. Check what&rsquo;s free on the calendar,
                lock in your dates, collect it.
              </p>
              <div className="hero-cta">
                <a className="btn" href="#gear">
                  See what&rsquo;s available
                </a>
                <a className="btn ghost" href="#booking">
                  Check a date
                </a>
              </div>
            </div>
            <div className="hero-art">
              <Image
                src="/hire/logo-hire.webp"
                alt="T.R. Depledge DIY Hire — hire the tools, Wallaroo SA"
                width={460}
                height={486}
                priority
              />
            </div>
          </div>

          <div className="strip">
            <dl className="wrap strip-grid">
              <div>
                <dt>Where you collect</dt>
                <dd>{HIRE_LOCATION} — address sent with your confirmation.</dd>
              </div>
              <div>
                <dt>Counter hours</dt>
                <dd>{COUNTER_HOURS.weekdays}. Closed Saturday and Sunday.</dd>
              </div>
              <div>
                <dt>Bring with you</dt>
                <dd>Photo ID and the card used for the bond.</dd>
              </div>
              <div>
                <dt>Over the weekend</dt>
                <dd>Collect Friday, return Monday — you&rsquo;re only charged for the Friday.</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="steps">
          <div className="wrap">
            <p className="eyebrow">From enquiry to driveway</p>
            <h2>Four steps, no phone tag</h2>
            <div className="step-row">
              {STEPS.map((s) => (
                <div className="step" key={s.n}>
                  <b>{s.n}</b>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <HireApp
          today={catalogue.today}
          horizon={catalogue.horizon}
          entries={catalogue.entries}
        />

        <section className="terms" id="rules">
          <div className="wrap">
            <p className="eyebrow">Before you collect</p>
            <h2>Hire terms</h2>
            {/* Copy comes from HIRE_POLICY, the same source Doug's `hire_policy`
                tool will read — so a wording change lands in both at once. */}
            <div className="acc">
              {TERMS_ACCORDION_ORDER.map((topic, i) => {
                const entry = HIRE_POLICY[topic];
                return (
                  <details key={topic} open={i === 0}>
                    <summary>{entry.title}</summary>
                    <p>{entry.body}</p>
                  </details>
                );
              })}
            </div>
          </div>
        </section>

      </main>

      <div className="rule" />

      <footer>
        <div className="wrap foot">
          <div className="foot-logo">
            <Image
              src="/hire/logo-hire.webp"
              alt="T.R. Depledge DIY Hire, Wallaroo SA"
              width={460}
              height={486}
            />
          </div>
          <div>
            <p className="eyebrow">Talk to Thomas</p>
            <a className="foot-num" href={`tel:${HIRE_PHONE_TEL}`}>
              {HIRE_PHONE}
            </a>
            <p>
              T.R. Depledge Gardening &amp; Maintenance · DIY Hire · {HIRE_LOCATION}. Not sure
              which tool suits the job? Call — we&rsquo;d rather send you out with the right
              one.
            </p>
          </div>
          <div>
            <p className="eyebrow">Counter hours</p>
            <p>
              {COUNTER_HOURS.weekdays}
              <br />
              Saturday {COUNTER_HOURS.saturday.toLowerCase()}
              <br />
              Sunday {COUNTER_HOURS.sunday.toLowerCase()}
            </p>
          </div>
        </div>
      </footer>
    </>
  );
}
