import type { ReactNode } from 'react';
import { Card } from '../components';

function T({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table className="tbl case-tbl">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{j === 0 ? <b>{c}</b> : c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Case() {
  return (
    <div className="stack case">
      <div className="hero">
        <p className="eyebrow">The case</p>
        <h1>DecideBy: the right person decides each renewal before the last safe day.</h1>
        <p className="muted">
          An intelligent repository for a growing company with no contract team. It builds a searchable, AI-understood record of every signed supplier contract
          from the shared drive, the procurement inbox and the list of suppliers the company pays.
        </p>
      </div>

      <Card title="1 · Why this stage: Intelligent Repository">
        <p>Every failure the brief names happens after signing, and the contracts already signed keep renewing whether or not intake improves.</p>
        <ul>
          <li>
            <b>The brief's three failures are post-signature:</b> unreviewed auto-renewals, missed service levels, and invoices that don't match agreed prices.
          </li>
          <li>
            <b>Intake and negotiation help one future contract at a time.</b> The money sits in the thousands of contracts already signed.
          </li>
          <li>
            <b>"AI-understood" has a precise meaning:</b> the repository knows 14 terms in every contract and what each requires next, and by when.
          </li>
          <li>
            <b>The real cost is the backlog, not the daily load.</b> Reading 2,500 contracts at 30–45 minutes each is 1,250–1,875 hours — roughly 0.7–1 person-year
            before the first renewal is handled. The daily load is about 10 renewals per working day with 1-year terms, or about 4 at 2.5 years.
          </li>
        </ul>
      </Card>

      <Card title="2 · Stakeholder map">
        <p>
          The core conflict is <b>continuity versus savings</b>. DecideBy handles it with a default recommendation the owner can override only with a reason, and a
          protective notice when nobody decides.
        </p>
        <T
          head={['Stakeholder', 'Role', 'Wants', 'Conflicts with', 'How DecideBy handles it']}
          rows={[
            ['Budget owner', 'Decides', 'No disruption, little admin', 'Procurement and the CFO', 'Brief with a default recommendation; overriding needs a one-line reason'],
            ['Invoice approver', 'Consulted', 'Keep using the supplier', 'Often has no authority to cancel', 'Asked three questions: still use it, how it performs, would we miss it'],
            ["Owner's manager", 'Escalation (mid & large)', 'Few notifications', 'The escalation design', "Escalated only when the owner hasn't decided; never for small contracts"],
            ['Procurement', 'Runs the process', 'Leverage, claimable savings', 'Owners; Legal over notices', 'Triage dashboard, takeover before the deadline, savings recorded'],
            ['Legal', 'Verifies terms, approves notices', 'Correct notices, little review', 'Procurement sending under standing permission', 'Writes the templates, decides which tier may use them; reviews only flagged terms'],
            ['CFO', 'Sponsor', 'Savings, predictable spend', 'Units wanting continuity', 'Value-weighted north star; savings recorded per outcome'],
            ['Finance & AP', 'Pays invoices', 'Invoices that match', 'Approvers who pass without checking', 'Rate check against the contract in the brief'],
            ['IT & Security', 'Grants access', 'Minimal access', 'Mailbox = personal data', 'Read-only; one mailbox and named folders; no retention or training'],
            ['Supplier', 'Counterparty', 'Quiet auto-renewal with an increase', 'Everyone on the buying side', "Valid notices sent inside the window, to the contract's notice address"],
          ]}
        />
      </Card>

      <Card title="3 · The problem and the evidence">
        <p>
          Contracts renew at higher prices, and invoices drift from agreed rates, because nobody knows the exit window, the owner or the agreed price. The evidence
          covers staffing, logistics and general procurement, not just software.
        </p>
        <T
          head={['Evidence', 'Figure', 'Supplier types', 'Source']}
          rows={[
            ['Value lost after signing', '11% of contract value; poor renewal planning about 2–3%', 'All', 'WorldCC and Ironclad'],
            ['Remedies not collected', "52% failed to collect a contractual remedy in the past year because it wasn't tracked (2,005 leaders)", 'All', 'Agiloft 2026 survey'],
            ['Agreed rates hard to find', '56% struggle to find approved vendor terms or rate cards, leading to overpayment', 'All', 'Unit4 Scanmarket'],
            ['Staffing bills drift', 'Higher-rate job classes billed for lower-rate work; more hours than timekeeping showed', 'Staffing', 'apexanalytix case study'],
            ['Freight bills drift', 'Overcharges of 8–10% of invoiced value; ~1 in 5 invoices flagged', 'Logistics', 'Beacon'],
            ['Pricing errors in AP', '13% of lost profit', 'All', 'apexanalytix 2026 Global Overpayment Report'],
            ['Small renewals unreviewed', '70% of tail-spend renewals had no review vs 14.6% of larger', 'Software', 'Vertice'],
            ['Price rises at renewal', '79% of IT leaders faced increases in the past 12 months', 'Software', 'Zylo'],
          ]}
        />
        <p>
          <b>Sizing, as an upper bound:</b> if all $100M of supplier spend were under contract and renewed each year, 2–3% leakage at renewal would cost $2–3M a
          year. The real figure is lower; the point is the order of magnitude.
        </p>
      </Card>

      <Card title="4 · Success metrics">
        <p>
          <b>North star:</b> the share of renewal-eligible contract value decided before its decide-by date <i>and</i>, where a notice is needed, with the notice
          sent inside its valid window. A decision whose letter never goes out does not count. All targets are hypotheses for a 90-day pilot.
        </p>
        <T
          head={['By', 'Target']}
          rows={[
            ['Day 30', 'Every triage contract has a budget owner and a brief; 80% of in-scope suppliers covered'],
            ['Day 60', '80% of triage contract value decided on time with notices sent in the window; zero too-late deadlines found by Legal'],
            ['Day 90', '90% of value due in the period decided on time; first outcomes and savings recorded'],
          ]}
        />
        <T
          head={['Type', 'Metric', 'Target or limit']}
          rows={[
            ['Working', 'Coverage of in-scope suppliers', '80% by day 30'],
            ['Working', 'Too-late deadlines on contracts Legal verified', 'Zero'],
            ['Working', 'Budget owners found automatically', 'Most need no manual assignment'],
            ['Working', 'Median days from brief to decision', 'Falls month on month'],
            ['Working', 'Savings vs auto-renewal price; overcharges recovered', 'Reported in dollars'],
            ['Guardrail', 'Override rate: "renew as-is" when brief said renegotiate/reduce', 'Over 50% is a rethink signal'],
            ['Guardrail', 'Wrong notices sent', 'Zero'],
            ['Guardrail', 'Lawyer minutes per verified contract', 'Falls over time'],
            ['Guardrail', 'Alerts per owner per month', 'Kept low; no manager alerts for small'],
          ]}
        />
        <h4>What would make us rethink</h4>
        <T
          head={['Signal', 'What it means', 'What changes']}
          rows={[
            ['Over 40% of mid & large decisions escalated', "Owners aren't the right people", 'Move to a procurement-led process'],
            ['Any too-late deadline, or extraction below 95%', "The AI can't be trusted to go first", 'People enter terms, AI suggests'],
            ['Override rate over 50%', "Recommendations aren't trusted or good", 'Rework the brief with owners'],
            ['Recommendations followed, savings stay small', "The money isn't at renewal", 'Shift effort to invoice checks'],
            ['Coverage stalls below 60%', 'Contracts live in unconnected sources', 'Connect inboxes, portals, e-signature; chase owners'],
          ]}
        />
      </Card>

      <Card title="5 · Assumptions">
        <T
          head={['Area', 'Assumption']}
          rows={[
            ['Company', '3,000 employees, about 2,500 suppliers across software, staffing, logistics, facilities, consulting and marketing'],
            ['Spend', 'About $100M a year with suppliers; most are one-off or small'],
            ['In-scope suppliers', 'Paid in at least 3 of the last 12 months, or more than $10k a year'],
            ['People', 'Procurement team of 2–3, Legal team of 2–3 lawyers, no contract manager'],
            ['Systems', 'Shared drive; one procurement mailbox; ERP with supplier, cost centre and approver; HR reporting lines; some e-signature'],
            ['Documents', 'About 1.5 per supplier, mostly English PDFs, some scanned'],
            ['Contract types', 'Auto-renewing, fixed-term and evergreen; notice periods 30–90 days; some notice windows'],
            ['Tiers', 'Small under $10k a year; mid $10k–100k; large over $100k or business-critical'],
            ['Notices', 'Sent from the procurement mailbox, signed by the Head of Procurement, on Legal-approved templates'],
            ['Data', 'Read-only access to one mailbox and named folders; AI provider set not to retain or train'],
            ['Effort', 'Reading one contract by hand takes 30–45 minutes'],
          ]}
        />
      </Card>

      <Card title="Scope: in, narrowed and cut">
        <T
          head={['Item', 'Status', 'Why']}
          rows={[
            ['Repository: 14 terms per contract, cited search', 'In', '"Searchable and AI-understood" means more than renewal dates'],
            ['Renewal decision loop, triage to outcome', 'In, end to end', 'Renewal is when the company has leverage'],
            ['Invoice rate check', 'Narrowed to contracts with a rate card', 'Others have no unit price to check'],
            ['Supplier performance', "Narrowed to the approver's answers and service-credit clauses", 'No SLA data in an email-and-Excel company'],
            ['Connecting Drive, mailbox, ERP', 'Simulated with seeded files', 'Real logins add demo risk and prove nothing new'],
            ['Drafting and negotiation; intake forms', 'Cut', 'Different stages; help one future contract at a time'],
            ['Live SLA monitoring; supplier portal; non-English', 'Cut', 'Data does not exist yet / not needed to prove the loop'],
          ]}
        />
      </Card>

      <Card title="How comparable companies do it">
        <T
          head={['Comparable', 'How they do it', 'What DecideBy borrows', 'What is different here']}
          rows={[
            ['Sirion', 'Conformed contracts, smart renewals, Renewal/Obligations/Invoice agents; renewal guide advising a 3–6 month start', 'Terms in force after amendments; renewal insights; invoice checks; large-tier lead time', 'Coverage against suppliers paid, first-week triage, budget-owner assignment, recorded outcomes'],
            ['Omnea', 'Renewal as a decision with an owner and timeline; at Jobber renewal assessments fell from 63 to 18.5 days', 'Renewal as a decision; surveys to owners before renewal', 'Owner found from cost centres; deadline shown with its clause; send window enforced'],
            ['Tropic and Vertice', 'Purchase requests across categories; renewal intelligence built around software', 'More autonomy on small contracts', 'Invoices as the evidence for staffing, facilities, logistics'],
            ['DocuSign Agreement Manager', 'AI repository tracks renewal dates, SLAs, rebates; alerts before auto-renewals', 'Alerts from extracted dates', 'The alert is where DecideBy starts, not where it stops'],
          ]}
        />
      </Card>

      <Card title="How this fits Sirion" className="accent-card">
        <p>
          In production, DecideBy's reading, renewal tracking and invoice checks would come from Sirion's existing agents; what it adds is coverage counting, triage,
          owner assignment and the decision loop.
        </p>
        <T
          head={['Piece of the prototype', 'In production at Sirion']}
          rows={[
            ['Reading terms; terms in force after amendments', 'Extraction Agent and conformed contracts'],
            ['Renewal tracking', 'Renewal Agent and smart renewals'],
            ['Invoice rate check', 'Invoice Agent'],
            ['Search and questions', 'Search Agent and AskSirion'],
            ['Coverage against suppliers paid, first-week triage, budget-owner assignment, send-window hold, recorded outcomes', "DecideBy's contribution"],
          ]}
        />
        <p className="muted sm">This mapping is a reading of Sirion's public pages; corrections welcome.</p>
      </Card>
    </div>
  );
}
