import { useMemo, useState } from 'react';
import { Card, DaysLeft, StageBadge } from '../components';
import { GO_LIVE, SUPPLIERS } from '../data/seed';
import { addDays, diffDays, fmt } from '../lib/dates';
import { DECISION_LABEL, person, money, moneyK, rateCheck, STAGE_LABEL, supplierOf, TIER_LABEL, tierOf, TYPE_LABEL, type Stage } from '../lib/logic';
import { OWNER_VIEW_ID, useStore, type Row } from '../store';

export function inScope(s: (typeof SUPPLIERS)[number]) {
  return s.monthsPaid >= 3 || s.annualSpend > 10_000;
}

export function onTimeAndSent(r: Row): boolean {
  if (!r.rec || r.rec.decidedOn > r.dr.decideBy || r.stage === 'missed') return false;
  if (!r.rec.letter) return true;
  const sent = r.rec.letter.status === 'sent' ? r.rec.letter.sentOn : undefined;
  if (!sent) return false;
  const opens = r.dr.windowOpen ?? sent;
  return sent >= opens && (!r.dr.noticeDeadline || sent <= r.dr.noticeDeadline);
}

export function northStar(rows: Row[]) {
  // Renewal-eligible = decide-by date falls inside the 90-day pilot.
  const end = addDays(GO_LIVE, 90);
  // Missed auto-renewals always count against the north star.
  const eligible = rows.filter((r) => r.dr.decideBy <= end || r.stage === 'missed');
  const total = eligible.reduce((a, r) => a + supplierOf(r.c).annualSpend, 0);
  // On time = decided before the decide-by date AND, if a notice is needed, sent inside the window.
  const onTime = eligible.filter((r) => onTimeAndSent(r));
  const done = onTime.reduce((a, r) => a + supplierOf(r.c).annualSpend, 0);
  return { total, done, pct: total ? done / total : 0, n: eligible.length, nDone: onTime.length };
}

type Filter = 'action' | 'letters' | 'missed' | 'decided' | 'all' | 'triage' | 'overcharge' | `stage:${Stage}`;

const FILTER_LABEL: Record<string, string> = {
  action: 'Needs action',
  letters: 'Letters',
  missed: 'Missed',
  decided: 'Decided',
  all: 'All',
};

/** Past decide-by, due within 45 days, ready to send (or escalated unsent), or taken over by procurement. */
export function needsAction(r: Row, now: string): boolean {
  if (['overdue', 'takeover', 'ready', 'unsent', 'approval'].includes(r.stage)) return true;
  if (['scheduled', 'brief', 'reminder', 'escalated'].includes(r.stage)) return diffDays(r.dr.decideBy, now) <= 45;
  return false;
}

const SEGMENT_ORDER: Stage[] = ['missed', 'overdue', 'takeover', 'unsent', 'escalated', 'reminder', 'brief', 'approval', 'ready', 'held', 'scheduled', 'decided'];

export default function Triage() {
  const { rows: allRows, now, go, role } = useStore();
  const [filter, setFilter] = useState<Filter>('action');
  // A budget owner sees only the renewals they own.
  const rows = role === 'owner' ? allRows.filter((r) => r.owner.owner.id === OWNER_VIEW_ID) : allRows;
  const ownerName = role === 'owner' ? person(OWNER_VIEW_ID)!.name : null;

  const week1 = rows.filter((r) => diffDays(r.dr.decideBy, GO_LIVE) <= 45);
  const week1Value = week1.reduce((a, r) => a + supplierOf(r.c).annualSpend, 0);
  const ns = northStar(rows);
  const scope = SUPPLIERS.filter(inScope);
  const covered = scope.filter((s) => s.status === 'contract');
  const over = rows.reduce((a, r) => a + rateCheck(r.c).total, 0);
  const actionCount = rows.filter((r) => needsAction(r, now)).length;

  const sorted = useMemo(
    () =>
      [...rows]
        .filter((r) => {
          if (filter.startsWith('stage:')) return r.stage === filter.slice(6);
          switch (filter) {
            case 'action':
              return needsAction(r, now);
            case 'letters':
              return ['approval', 'held', 'ready', 'unsent'].includes(r.stage);
            case 'missed':
              return r.stage === 'missed';
            case 'decided':
              return r.stage === 'decided';
            case 'triage':
              return r.sch.triage;
            case 'overcharge':
              return rateCheck(r.c).total > 0;
            default:
              return true;
          }
        })
        .sort((a, b) => a.dr.decideBy.localeCompare(b.dr.decideBy) || supplierOf(b.c).annualSpend - supplierOf(a.c).annualSpend),
    [rows, filter, now],
  );

  const counts = rows.reduce<Record<Stage, number>>((m, r) => ({ ...m, [r.stage]: (m[r.stage] ?? 0) + 1 }), {} as Record<Stage, number>);
  const special = filter.startsWith('stage:') ? `Status: ${STAGE_LABEL[filter.slice(6) as Stage]}` : filter === 'overcharge' ? 'Overcharged' : filter === 'triage' ? 'Triage schedule' : null;

  return (
    <div className="stack">
      <div className="hero">
        <div className="hero-top">
          <p className="eyebrow">{ownerName ? `My renewals · ${ownerName}` : `First-week triage · go-live ${fmt(GO_LIVE)}`}</p>
          <button type="button" className="link sm" onClick={() => go('case')}>
            Read the case →
          </button>
        </div>
        <h1>
          {ownerName ? 'Your renewals: ' : 'Week 1: '}
          <span className="hl">{week1.length} contracts</span> worth <span className="hl">{moneyK(week1Value)}</span> a year must be decided within 45 days.
        </h1>
        <p className="muted">
          Ranked by days left to the decide-by date, then by value. Contracts already inside their lead time run on the short triage schedule: brief on day 0,
          manager after 3 business days (mid and large), procurement after 5.
        </p>
      </div>

      <section className="card summary" aria-label="Summary">
        <div className="kpis">
          <button type="button" className={`kpi kpi-accent ${filter === 'decided' ? 'on' : ''}`} onClick={() => setFilter('decided')}>
            <span className="kpi-v">{Math.round(ns.pct * 100)}%</span>
            <span className="kpi-l">North star</span>
            <span className="kpi-s">
              value decided on time, notice sent · {moneyK(ns.done)} of {moneyK(ns.total)}
            </span>
          </button>
          <button type="button" className="kpi" onClick={() => go('repository')}>
            <span className="kpi-v">{Math.round((covered.length / scope.length) * 100)}%</span>
            <span className="kpi-l">Coverage</span>
            <span className="kpi-s">
              {covered.length} of {scope.length} in-scope suppliers · see gaps →
            </span>
          </button>
          <button type="button" className={`kpi ${filter === 'action' ? 'on' : ''}`} onClick={() => setFilter('action')}>
            <span className="kpi-v">{actionCount}</span>
            <span className="kpi-l">Needs action now</span>
            <span className="kpi-s">overdue, due ≤ 45 days, ready to send, taken over</span>
          </button>
          <button type="button" className={`kpi kpi-bad ${filter === 'missed' ? 'on' : ''}`} onClick={() => setFilter('missed')}>
            <span className="kpi-v">{counts.missed ?? 0}</span>
            <span className="kpi-l">Missed</span>
            <span className="kpi-s">auto-renewed, no valid notice</span>
          </button>
          <button type="button" className={`kpi kpi-warn ${filter === 'overcharge' ? 'on' : ''}`} onClick={() => setFilter('overcharge')}>
            <span className="kpi-v">{money(over)}</span>
            <span className="kpi-l">Overcharges</span>
            <span className="kpi-s">billed above contract rates</span>
          </button>
        </div>

        <div className="segbar" role="img" aria-label={`Where all ${rows.length} renewals stand on the simulated date`}>
          {SEGMENT_ORDER.filter((st) => counts[st]).map((st) => (
            <button
              type="button"
              key={st}
              className={`seg-part seg-${st}`}
              style={{ flexGrow: counts[st] }}
              title={`${STAGE_LABEL[st]}: ${counts[st]}`}
              aria-label={`Show ${STAGE_LABEL[st]} (${counts[st]})`}
              onClick={() => setFilter(`stage:${st}`)}
            />
          ))}
        </div>
        <ul className="legend">
          {SEGMENT_ORDER.map((st) => (
            <li key={st} className={`pipe pipe-${st} ${counts[st] ? '' : 'zero'}`}>
              <span className={`dot seg-${st}`} />
              <span className="pipe-l">{STAGE_LABEL[st]}</span> <b className="pipe-n">{counts[st] ?? 0}</b>
            </li>
          ))}
        </ul>
      </section>

      <Card
        title="Renewal queue"
        aside={
          <div className="row gap wrap">
            {special && (
              <button type="button" className="chip on" onClick={() => setFilter('action')} aria-label={`Clear filter ${special}`}>
                {special} ×
              </button>
            )}
            <div className="seg">
              {(['action', 'letters', 'missed', 'decided', 'all'] as Filter[]).map((f) => (
                <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                  {FILTER_LABEL[f]}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="table-wrap queue-wrap">
          <table className="tbl queue">
            <thead>
              <tr>
                <th>Supplier</th>
                <th className="num">Value</th>
                <th>Decide by</th>
                <th>Status</th>
                <th>Owner</th>
                <th>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const s = supplierOf(r.c);
                return (
                  <tr key={r.c.id} className="click" onClick={() => go('contract/' + r.c.id)}>
                    <td>
                      <button
                        type="button"
                        className="link row-title"
                        aria-label={`Open contract record for ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          go('contract/' + r.c.id);
                        }}
                      >
                        <b>{s.name}</b>
                      </button>
                      <div className="muted sm">{s.category}</div>
                      <div className="meta">
                        {TIER_LABEL[tierOf(r.c)]} · {TYPE_LABEL[r.c.dates.type]}
                        {r.sch.triage && ' · triage schedule'}
                        {r.c.family && ' · answer-keyed'}
                      </div>
                    </td>
                    <td className="num">{moneyK(s.annualSpend)}</td>
                    <td>
                      <DaysLeft date={r.dr.decideBy} now={now} />
                    </td>
                    <td>
                      <StageBadge stage={r.stage} />
                      {r.rec && <div className="muted sm">{DECISION_LABEL[r.rec.decision]}</div>}
                    </td>
                    <td className="sm">{r.owner.owner.name}</td>
                    <td>
                      <button
                        type="button"
                        className="ghost sm"
                        aria-label={`Open brief for ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          go('brief/' + r.c.id);
                        }}
                      >
                        Brief →
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!sorted.length && (
                <tr>
                  <td colSpan={6} className="muted center">
                    Nothing here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
