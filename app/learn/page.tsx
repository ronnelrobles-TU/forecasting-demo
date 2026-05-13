import Link from 'next/link'

export default function LearnPage() {
  return (
    <main className="learn-page">

      {/* ── Hero ── */}
      <section className="learn-hero">
        <div className="learn-hero-badge">Beginner-friendly guide</div>
        <h1 className="learn-hero-title">WFM Forecasting, explained simply</h1>
        <p className="learn-hero-sub">
          Workforce Management forecasting answers one question:{' '}
          <strong>how many agents should be working at 9:30 AM on a Tuesday?</strong>{' '}
          This guide walks you through every concept, from raw call volume to a scheduled headcount number, no prior experience needed.
        </p>
        <Link href="/" className="learn-cta">Try the live demo →</Link>
      </section>

      {/* ── The problem ── */}
      <section className="learn-section">
        <h2 className="learn-h2">The staffing problem</h2>
        <p className="learn-p">
          Every contact centre faces the same trade-off. Staff too few agents and customers wait too long, your service level collapses and people hang up angry. Staff too many and agents sit idle, burning payroll for nothing.
        </p>
        <div className="learn-split">
          <div className="learn-split-card learn-split-bad">
            <div className="learn-split-icon">📞</div>
            <div className="learn-split-title">Too few agents</div>
            <ul className="learn-split-list">
              <li>Calls queue up faster than they're answered</li>
              <li>Average wait time climbs</li>
              <li>Service level target is missed</li>
              <li>Customers abandon, or escalate</li>
              <li>Agents get overwhelmed and burn out</li>
            </ul>
          </div>
          <div className="learn-split-card learn-split-good">
            <div className="learn-split-icon">💸</div>
            <div className="learn-split-title">Too many agents</div>
            <ul className="learn-split-list">
              <li>Agents wait for calls, low occupancy</li>
              <li>Payroll cost is higher than it needs to be</li>
              <li>Management asks why the model is wrong</li>
              <li>Agent engagement drops from boredom</li>
              <li>Budget gets cut next quarter</li>
            </ul>
          </div>
        </div>
        <p className="learn-p learn-p-em">
          The goal: staff the <em>minimum</em> number of agents needed to hit a service level target, for every 30-minute window of every day.
        </p>
      </section>

      {/* ── 6 inputs ── */}
      <section className="learn-section">
        <h2 className="learn-h2">The 6 inputs you control</h2>
        <p className="learn-p">Every number in the staffing engine comes from six inputs. Learn what they mean and you understand the whole model.</p>
        <div className="learn-input-grid">
          {[
            {
              num: '01',
              name: 'Volume',
              unit: 'calls / 30 min',
              color: 'blue',
              desc: 'How many contacts arrive in each 30-minute window. This is the foundation of everything, it comes from historical data, trend analysis, and business forecasts.',
              tip: 'Volume varies by hour, day-of-week, and season. The intraday curve in the demo shows this pattern: a morning peak around 10 AM, an afternoon peak around 3 PM.',
            },
            {
              num: '02',
              name: 'AHT',
              anchor: 'aht',
              unit: 'Average Handle Time · seconds',
              color: 'purple',
              desc: 'Total time an agent spends on one contact: talk time + any hold time + after-call work (notes, system updates). 360 seconds = 6 minutes per call.',
              tip: 'AHT is the single biggest lever on staffing. Cutting AHT by 60 seconds on 500 calls/hour saves roughly 8 agent positions.',
            },
            {
              num: '03',
              name: 'Service Level',
              anchor: 'sl',
              unit: '% of calls answered within threshold',
              color: 'green',
              desc: 'Your quality commitment to callers. "80/20" means 80% of calls answered within 20 seconds. This is the target the Erlang C engine optimises for.',
              tip: 'Higher service level = more agents required. Going from 80% to 90% in 20 seconds typically adds 10-15% to required headcount.',
            },
            {
              num: '04',
              name: 'SL Threshold',
              anchor: 'sl-threshold',
              unit: 'seconds',
              color: 'orange',
              desc: 'The time limit in your service level definition. Combined with the % above: "80% in 20 seconds." Different clients often have different thresholds.',
              tip: 'Tighter thresholds (10 s vs 30 s) require significantly more agents for the same service level %, because less time is allowed for queued calls to clear.',
            },
            {
              num: '05',
              name: 'Shrinkage',
              anchor: 'shrinkage',
              unit: '% of paid time not on phones',
              color: 'red',
              desc: 'Agents are paid but unavailable for calls: scheduled breaks, team meetings, training, coaching sessions, system downtime. Typical range: 25-35%.',
              tip: '30% shrinkage means: for every 10 agents needed on the phones, you must schedule 14-15. Shrinkage is often underestimated and is a top cause of understaffing.',
            },
            {
              num: '06',
              name: 'Absenteeism',
              unit: '% of scheduled agents who don\'t show',
              color: 'gray',
              desc: 'Agents who are scheduled but absent: sick leave, personal days, no-shows. This sits on top of shrinkage, both eat into your available headcount.',
              tip: 'At 8% absenteeism, roughly 1 in 12 scheduled agents won\'t show up. High absenteeism signals engagement or scheduling problems worth addressing directly.',
            },
          ].map(({ num, name, anchor, unit, color, desc, tip }: { num: string; name: string; anchor?: string; unit: string; color: string; desc: string; tip: string }) => (
            <div key={num} id={anchor} className={`learn-input-card learn-input-card--${color}`}>
              <div className="learn-input-num">{num}</div>
              <div className="learn-input-name">{name}</div>
              <div className="learn-input-unit">{unit}</div>
              <p className="learn-input-desc">{desc}</p>
              <details className="learn-tip">
                <summary>Pro tip</summary>
                <p>{tip}</p>
              </details>
            </div>
          ))}
        </div>
      </section>

      {/* ── Erlang C ── */}
      <section className="learn-section">
        <h2 id="erlang-c" className="learn-h2">What is Erlang C?</h2>
        <div className="learn-erlang-intro">
          <div className="learn-erlang-portrait">
            <div className="learn-erlang-avatar">A.K.E</div>
            <div className="learn-erlang-caption">Agner Krarup Erlang<br />1878 - 1929</div>
          </div>
          <div>
            <p className="learn-p">
              Erlang C is a queuing formula invented in 1917 by Danish telephone engineer <strong>Agner Krarup Erlang</strong> to figure out how many operators a telephone exchange needed. Over a century later, it's still the standard model used in contact centres worldwide.
            </p>
            <p className="learn-p">
              The formula models a queue where callers <em>wait</em> rather than hang up. It takes three things, call volume, handle time, and a service level target, and outputs the minimum number of agents needed to meet that target.
            </p>
          </div>
        </div>

        <h3 className="learn-h3">Step 1, Traffic intensity (Erlangs)</h3>
        <p className="learn-p">
          Before running Erlang C, convert your inputs into <strong>Erlangs</strong>, a unit of telephone traffic that represents "how many agents would be 100% busy if there were no queue at all."
        </p>
        <div className="learn-formula-box">
          <div className="learn-formula-line">
            <span className="learn-formula-sym">A</span>
            <span className="learn-formula-eq">=</span>
            <span className="learn-formula-term">calls per 30 min</span>
            <span className="learn-formula-op">÷</span>
            <span className="learn-formula-term">1800 seconds</span>
            <span className="learn-formula-op">×</span>
            <span className="learn-formula-term">AHT (seconds)</span>
          </div>
          <div className="learn-formula-example">
            Example: 450 calls ÷ 1800 × 360 s AHT = <strong>90 Erlangs</strong>
          </div>
          <p className="learn-formula-note">
            90 Erlangs means 90 agents would be continuously busy just handling arriving calls, with zero waiting time. Since real queues aren't perfectly smooth, you always need <em>more</em> than 90 agents.
          </p>
        </div>

        <h3 className="learn-h3">Step 2, Finding the minimum agent count</h3>
        <p className="learn-p">
          Erlang C finds the smallest N (number of agents) where the probability of waiting, combined with the expected wait time, keeps you above your service level target. The formula for service level is:
        </p>
        <div className="learn-formula-box learn-formula-box--subtle">
          <div className="learn-formula-def">
            <span className="learn-formula-sym">SL(N, A)</span>
            <span className="learn-formula-eq">=</span>
            <span>1 − C(N, A) × e<sup>−(N − A) × threshold / AHT</sup></span>
          </div>
          <p className="learn-formula-note">
            <strong>C(N, A)</strong> is the Erlang C probability, the chance a caller must wait at all given N agents and A Erlangs of traffic. The exponential term captures how fast the queue clears. As N increases, SL climbs until it crosses your target.
          </p>
        </div>
        <p className="learn-p">
          The demo iterates N upward from the minimum possible value until SL(N, A) ≥ your SL target, that N is the "Erlang C agents" number you see in the KPI cards.
        </p>
      </section>

      {/* ── Staffing chain ── */}
      <section className="learn-section">
        <h2 className="learn-h2">From calls to scheduled headcount</h2>
        <p className="learn-p">Erlang C gives you agents <em>required on the phones</em>. Two more adjustments turn that into a real schedule number.</p>

        <div className="learn-chain">
          <div className="learn-chain-step">
            <div className="learn-chain-box learn-chain-box--blue">
              <div className="learn-chain-box-num">1</div>
              <div className="learn-chain-box-name">Call volume</div>
              <div className="learn-chain-box-eg">e.g. 450 calls/30 min</div>
            </div>
            <div className="learn-chain-arrow">→</div>
          </div>
          <div className="learn-chain-step">
            <div className="learn-chain-box learn-chain-box--purple">
              <div className="learn-chain-box-num">2</div>
              <div className="learn-chain-box-name">Traffic intensity</div>
              <div className="learn-chain-box-eg">A = 90 Erlangs</div>
            </div>
            <div className="learn-chain-arrow">→</div>
          </div>
          <div className="learn-chain-step">
            <div className="learn-chain-box learn-chain-box--orange">
              <div className="learn-chain-box-num">3</div>
              <div className="learn-chain-box-name">Erlang C formula</div>
              <div className="learn-chain-box-eg">meets SL target?</div>
            </div>
            <div className="learn-chain-arrow">→</div>
          </div>
          <div className="learn-chain-step">
            <div className="learn-chain-box learn-chain-box--green">
              <div className="learn-chain-box-num">4</div>
              <div className="learn-chain-box-name">Required agents</div>
              <div className="learn-chain-box-eg">N on phones</div>
            </div>
            <div className="learn-chain-arrow">→</div>
          </div>
          <div className="learn-chain-step">
            <div className="learn-chain-box learn-chain-box--red">
              <div className="learn-chain-box-num">5</div>
              <div className="learn-chain-box-name">÷ (1 − shrink%)</div>
              <div className="learn-chain-box-eg">add back unavail. time</div>
            </div>
            <div className="learn-chain-arrow">→</div>
          </div>
          <div className="learn-chain-step">
            <div className="learn-chain-box learn-chain-box--final">
              <div className="learn-chain-box-num">6</div>
              <div className="learn-chain-box-name">Scheduled HC</div>
              <div className="learn-chain-box-eg">÷ (1 − absent%)</div>
            </div>
          </div>
        </div>

        <div className="learn-chain-example">
          <div className="learn-chain-example-title">Worked example</div>
          <div className="learn-chain-example-steps">
            {[
              ['Volume → Erlangs', '450 calls ÷ 1800 s × 360 s AHT = 90.0 Erlangs'],
              ['Erlang C → N agents', 'Iterate N until SL(N, 90) ≥ 80% in 20 s → N = 97 agents'],
              ['Add shrinkage (32%)', '97 ÷ (1 − 0.32) = 142.6 → 143 agents scheduled'],
              ['Add absenteeism (9%)', '143 ÷ (1 − 0.09) = 157.1 → 158 final scheduled HC'],
            ].map(([step, calc]) => (
              <div key={step} className="learn-chain-example-row">
                <span className="learn-chain-example-step">{step}</span>
                <span className="learn-chain-example-calc">{calc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── KPIs ── */}
      <section className="learn-section">
        <h2 className="learn-h2">Understanding the output KPIs</h2>
        <div className="learn-kpi-list">
          {[
            {
              name: 'Erlang C agents',
              tldr: 'Minimum agents needed on the phones to hit your SL target.',
              detail: 'This is the raw Erlang C output, the theoretical minimum. It assumes every agent is available 100% of the time and always shows up. Reality requires adjustments (see below).',
              watch: 'If this number is very close to your Erlangs (A), your occupancy will be near 100% and small demand spikes will cause major service level collapses.',
            },
            {
              name: 'Scheduled HC',
              tldr: 'Agents you actually need on the roster, after accounting for shrinkage and absenteeism.',
              detail: 'Scheduled HC = Erlang C agents ÷ (1 − shrinkage) ÷ (1 − absenteeism). This is the number you present to operations for shift planning.',
              watch: 'The gap between "Erlang C agents" and "Scheduled HC" is entirely explained by shrinkage + absenteeism. Reducing either has direct cost impact.',
            },
            {
              name: 'Service Level',
              tldr: '% of calls answered within your threshold, your primary quality KPI.',
              detail: 'The demo shows the theoretical SL given the computed N agents. In practice, SL is measured from actual ACD data and reported interval-by-interval.',
              watch: 'SL is non-linear: it\'s flat near your target agent count, then drops steeply when understaffed. Even one fewer agent than needed can drop SL by 5-10 points.',
            },
            {
              name: 'Occupancy',
              anchor: 'occupancy',
              tldr: 'What fraction of logged-in time agents spend actually handling contacts.',
              detail: 'Occupancy = A ÷ N. At 85-88%, agents are busy but have breathing room between calls. Above 90%, fatigue and error rates rise sharply. Below 75%, you\'re overstaffed.',
              watch: 'Occupancy and service level are in tension. Chasing 95% SL pushes N up and occupancy down, agents have more idle time. The sweet spot is typically 80-88%.',
            },
            {
              name: 'Avg ASA',
              anchor: 'asa',
              tldr: 'Average Speed of Answer, mean wait time across all calls.',
              detail: 'ASA includes calls answered immediately (wait = 0) and those that queue. A good SL doesn\'t guarantee a low ASA, if 20% of calls wait a long time, ASA can be high even at 80% SL.',
              watch: 'ASA is driven by the tail of the wait-time distribution. Erlang C assumes exponential service times; in practice the tail can be longer, making ASA worse than predicted.',
            },
          ].map(({ name, anchor, tldr, detail, watch }: { name: string; anchor?: string; tldr: string; detail: string; watch: string }) => (
            <div key={name} id={anchor} className="learn-kpi-item">
              <div className="learn-kpi-item-name">{name}</div>
              <div className="learn-kpi-item-tldr">{tldr}</div>
              <p className="learn-kpi-item-detail">{detail}</p>
              <div className="learn-kpi-item-watch">
                <span className="learn-kpi-watch-label">Watch for:</span> {watch}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Campaign rules ── */}
      <section className="learn-section">
        <h2 className="learn-h2">Campaign rule layers</h2>
        <p className="learn-p">
          The demo lets you switch between five campaigns. Each has a <strong>rule layer</strong>, a set of constraints on top of the Erlang C numbers that reflect the real-world complexity of BPO (Business Process Outsourcing) operations.
        </p>
        <div className="learn-rules-grid">
          {[
            { icon: '🌏', title: 'Geo & site', desc: 'Which physical site handles the campaign, Manila, Cebu, Clark, Davao. Affects labour cost, talent pool, and compliance requirements.' },
            { icon: '🕐', title: 'Coverage hours', desc: 'When agents must be available. US Telco needs 24/7 follow-the-sun coverage; UK Fintech is GMT business hours only. Shapes shift patterns completely differently.' },
            { icon: '🔒', title: 'Compliance', desc: 'HIPAA for US Healthcare, KYC for UK Fintech. These require certified agents, secure systems, and often dedicated seats, shrinking the eligible agent pool.' },
            { icon: '🗣️', title: 'Language & skill', desc: 'PH Telco Davao requires Bisaya/Tagalog dual speakers. UK Fintech needs senior-tier agents only. Skill constraints reduce the usable headcount below the scheduled number.' },
            { icon: '📈', title: 'Surge patterns', desc: 'US Healthcare spikes in Q4 (open enrolment). AU Retail surges around holidays. These seasonal patterns require advance staffing plans, not just real-time Erlang C.' },
            { icon: '🌀', title: 'Flex events', desc: 'PH Telco Davao has a typhoon clause, operations can shift on short notice. These irregular events require buffer capacity built into the base schedule.' },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="learn-rule-card">
              <div className="learn-rule-icon">{icon}</div>
              <div className="learn-rule-title">{title}</div>
              <div className="learn-rule-desc">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOOP ── */}
      <section id="hoop" className="learn-section">
        <h2 className="learn-h2">HOOP, Hours of Operation</h2>
        <p className="learn-p">
          The HOOP is the time window when a campaign is open and accepting contacts. US Telco runs 24/7 (HOOP 00:00-24:00); UK Fintech runs GMT business hours (HOOP 09:00-18:00). The cockpit truncates the demand curve at HOOP edges, no calls arrive outside the window, and no agents are scheduled there.
        </p>
        <p className="learn-p">
          Different geos and verticals have radically different HOOPs. A 16-hour HOOP needs roughly half the daily agent-hours of a 24-hour HOOP at the same volume, but creates a different staffing-shape problem (peak-and-trough vs. flat coverage).
        </p>
      </section>

      {/* ── Abandons ── */}
      <section id="abandons" className="learn-section">
        <h2 className="learn-h2">Abandons, when callers hang up</h2>
        <p className="learn-p">
          An <strong>abandon</strong> is a caller who hangs up before being answered, usually because the wait got too long. Industry convention removes abandons from the SL denominator: they never got a chance to be answered fast enough or slow enough, so counting them either way distorts the metric.
        </p>
        <p className="learn-p">
          The cockpit models abandons with a probability ramp: callers tolerate the wait up to a campaign-specific threshold (e.g. 60 seconds), after which the per-second probability of dropping ramps with shape parameter <code>beta</code>. UK Fintech uses 45s/0.08 (impatient), AU Retail Chat uses 90s/0.03 (patient). When the queue gets long, abandons are usually what saves the SL number, and what wrecks the customer experience.
        </p>
      </section>

      {/* ── Glossary ── */}
      <section className="learn-section">
        <h2 className="learn-h2">Quick reference glossary</h2>
        <div className="learn-glossary">
          {[
            ['AHT', 'Average Handle Time. Total agent time per contact: talk + hold + after-call work.'],
            ['Erlangs', 'Unit of telephone traffic. A = (calls/sec) × AHT. Represents simultaneous full-time demand.'],
            ['Erlang C', 'Queuing formula that models a waiting room (no abandons). Output: P(wait > 0) given N agents and A Erlangs.'],
            ['Service Level', 'Quality target: X% of contacts answered within Y seconds. Industry standard is 80/20.'],
            ['ASA', 'Average Speed of Answer. Mean wait time across all contacts, including those answered instantly.'],
            ['Occupancy', 'A ÷ N. Fraction of logged-in time agents spend on contacts. Target: 80-88%.'],
            ['Shrinkage', 'Paid time unavailable for calls: breaks, training, meetings, coaching, off-phone activities.'],
            ['Absenteeism', 'Scheduled agents who are absent: sick, personal days, no-shows.'],
            ['Scheduled HC', 'Final headcount for rostering. = Erlang agents ÷ (1 − shrink) ÷ (1 − absent).'],
            ['Intraday', 'Within a single day. Intraday management adjusts staffing in real time vs. the forecast.'],
            ['BPO', 'Business Process Outsourcing. A third-party company (like a Philippine call centre) that handles customer contacts on behalf of a client.'],
            ['FTE', 'Full-Time Equivalent. A measure of total agent capacity normalised to a standard work week.'],
          ].map(([term, def]) => (
            <div key={term} className="learn-glossary-row">
              <dt className="learn-glossary-term">{term}</dt>
              <dd className="learn-glossary-def">{def}</dd>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="learn-cta-section">
        <div className="learn-cta-box">
          <div className="learn-cta-title">Ready to see it in action?</div>
          <p className="learn-cta-desc">
            Open the live demo, pick a campaign, and drag the sliders. Watch how changing AHT or shrinkage cascades through the staffing chain in real time.
          </p>
          <Link href="/" className="learn-cta">Go to the demo →</Link>
        </div>
      </section>

    </main>
  )
}
