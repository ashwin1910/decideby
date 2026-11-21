import { useState, type ReactNode } from 'react';
import { PEOPLE } from './data/seed';
import { useStore } from './store';
import type { Tier } from './data/types';
import { diffDays, fmt, type ISODate } from './lib/dates';
import { STAGE_LABEL, TIER_LABEL, type Stage, type TermStatus } from './lib/logic';

export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function TierBadge({ tier }: { tier: Tier }) {
  return <Badge tone={tier === 'large' ? 'violet' : tier === 'mid' ? 'blue' : 'neutral'}>{TIER_LABEL[tier]}</Badge>;
}

const STAGE_TONE: Record<Stage, string> = {
  scheduled: 'neutral',
  brief: 'blue',
  reminder: 'amber',
  escalated: 'amber',
  takeover: 'amber',
  overdue: 'red',
  approval: 'amber',
  held: 'neutral',
  ready: 'blue',
  unsent: 'amber',
  decided: 'green',
  missed: 'red',
};

export function StageBadge({ stage }: { stage: Stage }) {
  return <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>;
}

export function DaysLeft({ date, now }: { date: ISODate; now: ISODate }) {
  const n = diffDays(date, now);
  const tone = n < 0 ? 'red' : n <= 14 ? 'amber' : 'muted';
  return (
    <span className={`days days-${tone}`}>
      {fmt(date)}
      <small>{n < 0 ? `${-n}d overdue` : n === 0 ? 'today' : `${n}d left`}</small>
    </span>
  );
}

const STATUS: Record<TermStatus, [string, string]> = {
  trusted: ['green', 'Trusted'],
  verify: ['amber', 'Legal verifies'],
  unverified: ['red', 'Quote not in document'],
  notFound: ['neutral', 'Not found → review'],
};

export function TermStatusBadge({ s }: { s: TermStatus }) {
  return <Badge tone={STATUS[s][0]}>{STATUS[s][1]}</Badge>;
}

export function Card({ title, aside, children, className = '' }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || aside) && (
        <header className="card-h">
          {title && <h3>{title}</h3>}
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: string }) {
  return (
    <div className={`stat ${tone ? 'stat-' + tone : ''}`}>
      <div className="stat-l">{label}</div>
      <div className="stat-v">{value}</div>
      {sub && <div className="stat-s">{sub}</div>}
    </div>
  );
}

/** One-tap reassignment of a contract's budget owner. */
export function ReassignOwner({ contractId, currentName }: { contractId: string; currentName: string }) {
  const { owners, reassign, now } = useStore();
  const ov = owners[contractId];
  const candidates = PEOPLE.filter((p) => !p.id.startsWith('p-ap') && p.id !== 'p-legal');
  return (
    <label className="field inline reassign">
      <span>Reassign to</span>
      <select
        aria-label={`Reassign budget owner (currently ${currentName})`}
        value={ov?.personId ?? ''}
        onChange={(e) => reassign(contractId, e.target.value ? { personId: e.target.value, on: now } : undefined)}
      >
        <option value="">{ov ? 'Original owner (auto-assigned)' : `${currentName} (auto-assigned)`}</option>
        {candidates.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.title}
          </option>
        ))}
      </select>
    </label>
  );
}

const TOUR_KEY = 'decideby.tour.v1';
const TOUR: { title: string; text: string; path: string; day?: number }[] = [
  { title: 'Triage', text: 'Week 1: the contracts that must be decided within 45 days, from the seed data.', path: 'triage', day: 0 },
  { title: 'BrightStaff', text: 'The amendment moved the deadline; the rate check shows the 6% increase billed early — leverage to renegotiate.', path: 'brief/brightstaff' },
  { title: 'Northwind exit, held', text: 'Choose Exit and approve: the letter is held until the window opens on 16 Dec.', path: 'brief/northwind' },
  {
    title: 'Ask a question',
    text: "Not about renewals: which suppliers can we exit for convenience on 30 days' notice?",
    path: `repository?q=${encodeURIComponent("which suppliers can we exit for convenience on 30 days' notice?")}`,
  },
  { title: 'Move the slider', text: 'Day 6: undecided contracts escalate on the triage schedule; two have auto-renewed.', path: 'triage', day: 6 },
  { title: 'Outcome and evaluation', text: "Record BrightStaff's outcome, then end on the evaluation page and the north star.", path: 'evaluation' },
];

/** Dismissible first-visit guide that follows the 3-minute demo script. */
export function TourChip() {
  const { go, setOffset } = useStore();
  const [state, setState] = useState<'chip' | number | 'gone'>(() => {
    try {
      return localStorage.getItem(TOUR_KEY) === 'dismissed' ? 'gone' : 'chip';
    } catch {
      return 'chip';
    }
  });
  const dismiss = () => {
    try {
      localStorage.setItem(TOUR_KEY, 'dismissed');
    } catch {
      /* ignore */
    }
    setState('gone');
  };
  const open = (i: number) => {
    const st = TOUR[i];
    if (st.day != null) setOffset(st.day);
    go(st.path);
    setState(i);
  };
  if (state === 'gone') return null;
  if (state === 'chip')
    return (
      <div className="tour chip-mode" role="region" aria-label="3-minute tour">
        <button type="button" className="tour-start" onClick={() => open(0)}>
          ▶ 3-minute tour
        </button>
        <button type="button" className="tour-x" aria-label="Dismiss tour" onClick={dismiss}>
          ×
        </button>
      </div>
    );
  const st = TOUR[state];
  return (
    <div className="tour" role="region" aria-label="3-minute tour">
      <ol className="tour-steps">
        {TOUR.map((t, i) => (
          <li key={t.title}>
            <button type="button" className={i === state ? 'on' : ''} aria-current={i === state ? 'step' : undefined} onClick={() => open(i)}>
              {i + 1}. {t.title}
            </button>
          </li>
        ))}
      </ol>
      <p className="tour-text">{st.text}</p>
      <div className="row gap">
        {state < TOUR.length - 1 ? (
          <button type="button" className="primary sm" onClick={() => open(state + 1)}>
            Next: {TOUR[state + 1].title} →
          </button>
        ) : (
          <button type="button" className="primary sm" onClick={dismiss}>
            Finish tour
          </button>
        )}
        <button type="button" className="ghost sm" aria-label="Dismiss tour" onClick={dismiss}>
          Close
        </button>
      </div>
    </div>
  );
}
