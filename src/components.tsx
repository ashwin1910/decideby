import type { ReactNode } from 'react';
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
  takeover: 'red',
  overdue: 'red',
  approval: 'amber',
  held: 'neutral',
  ready: 'blue',
  unsent: 'red',
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
