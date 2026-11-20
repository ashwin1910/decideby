import { useMemo, useState } from 'react';
import { Badge, Card, DaysLeft, StageBadge, Stat, TierBadge } from '../components';
import { CONTRACTS, GO_LIVE, SUPPLIERS } from '../data/seed';
import { addDays, diffDays, fmt } from '../lib/dates';
import { money, moneyK, rateCheck, STAGE_LABEL, supplierOf, tierOf, TYPE_LABEL, type Stage } from '../lib/logic';
import { useStore, type Row } from '../store';

export function inScope(s: (typeof SUPPLIERS)[number]) {
  return s.monthsPaid >= 3 || s.annualSpend > 10_000;
}

export function northStar(rows: Row[]) {
  // Renewal-eligible = decide-by date falls inside the 90-day pilot.
  const end = addDays(GO_LIVE, 90);
  const eligible = rows.filter((r) => r.dr.decideBy <= end);
  const total = eligible.reduce((a, r) => a + supplierOf(r.c).annualSpend, 0);
  const onTime = eligible.filter((r) => r.rec && r.rec.decidedOn <= r.dr.decideBy);
  const done = onTime.reduce((a, r) => a + supplierOf(r.c).annualSpend, 0);
  return { total, done, pct: total ? done / total : 0, n: eligible.length, nDone: onTime.length };
}

type Filter = 'all' | 'triage' | 'open' | 'decided';

export default function Triage() {
  const { rows, now, go } = useStore();
  const [filter, setFilter] = useState<Filter>('open');

  const week1 = rows.filter((r) => diffDays(r.dr.decideBy, GO_LIVE) <= 45);
  const week1Value = week1.reduce((a, r) => a + supplierOf(r.c).annualSpend, 0);
  const ns = northStar(rows);
  const scope = SUPPLIERS.filter(inScope);
  const covered = scope.filter((s) => s.status === 'contract');
  const over = CONTRACTS.reduce((a, c) => a + rateCheck(c).total, 0);

  const sorted = useMemo(
    () =>
      [...rows]
        .filter((r) => (filter === 'triage' ? r.sch.triage : filter === 'open' ? !r.rec : filter === 'decided' ? !!r.rec : true))
        .sort((a, b) => a.dr.decideBy.localeCompare(b.dr.decideBy) || supplierOf(b.c).annualSpend - supplierOf(a.c).annualSpend),
    [rows, filter],
  );

  const counts = rows.reduce<Record<Stage, number>>((m, r) => ({ ...m, [r.stage]: (m[r.stage] ?? 0) + 1 }), {} as Record<Stage, number>);
  const stages: Stage[] = ['brief', 'reminder', 'escalated', 'takeover', 'overdue', 'decided'];

  return (
    <div className="stack">
      <div className="hero">
        <p className="eyebrow">First-week triage · go-live {fmt(GO_LIVE)}</p>
        <h1>
          Week 1: <span className="hl">{week1.length} contracts</span> worth <span className="hl">{moneyK(week1Value)}</span> a year must be decided within 45 days.
        </h1>
        <p className="muted">
          Every contract is ranked by days left to its decide-by date, then by annual value. Contracts already inside their normal lead time run on the short triage
          schedule: brief on day 0, manager after 3 business days (mid and large), procurement after 5.
        </p>
      </div>

      <div className="stats">
        <Stat
          label="North star · value decided before decide-by"
          value={`${Math.round(ns.pct * 100)}%`}
          sub={`${moneyK(ns.done)} of ${moneyK(ns.total)} due in the 90-day pilot (${ns.nDone}/${ns.n} contracts)`}
          tone="accent"
        />
        <Stat label="Coverage of in-scope suppliers" value={`${Math.round((covered.length / scope.length) * 100)}%`} sub={`${covered.length} of ${scope.length} have a signed contract found`} />
        <Stat label="On triage schedule" value={rows.filter((r) => r.sch.triage).length} sub="already inside their lead time at go-live" />
        <Stat label="Overcharges found by rate check" value={money(over)} sub="billed above the contract rate" tone="warn" />
      </div>

      <Card
        title="Where every renewal stands on the simulated date"
        aside={<span className="muted sm">Move the slider above to watch undecided contracts escalate</span>}
      >
        <div className="pipeline">
          {stages.map((s) => (
            <div key={s} className={`pipe pipe-${s}`}>
              <div className="pipe-n">{counts[s] ?? 0}</div>
              <div className="pipe-l">{STAGE_LABEL[s]}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Renewal queue"
        aside={
          <div className="seg">
            {(['open', 'triage', 'decided', 'all'] as Filter[]).map((f) => (
              <button key={f} className={filter === f ? 'on' : ''} onClick={() => setFilter(f)}>
                {{ open: 'Undecided', triage: 'Triage', decided: 'Decided', all: 'All' }[f]}
              </button>
            ))}
          </div>
        }
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Tier</th>
                <th>Type</th>
                <th className="num">Annual</th>
                <th>Decide by</th>
                <th>Notice deadline</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Budget owner</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const s = supplierOf(r.c);
                return (
                  <tr key={r.c.id} className="click" onClick={() => go('contract/' + r.c.id)}>
                    <td>
                      <b>{s.name}</b>
                      <div className="muted sm">
                        {s.category}
                        {r.c.family && <> · <span title="Synthetic family with a known correct answer">answer-keyed</span></>}
                      </div>
                    </td>
                    <td>
                      <TierBadge tier={tierOf(r.c)} />
                    </td>
                    <td className="sm">{TYPE_LABEL[r.c.dates.type]}</td>
                    <td className="num">{moneyK(s.annualSpend)}</td>
                    <td>
                      <DaysLeft date={r.dr.decideBy} now={now} />
                    </td>
                    <td className="sm">{r.dr.noticeDeadline ? fmt(r.dr.noticeDeadline) : <span className="muted">none needed</span>}</td>
                    <td>{r.sch.triage ? <Badge tone="red">Triage</Badge> : <Badge>Normal</Badge>}</td>
                    <td>
                      <StageBadge stage={r.stage} />
                      {r.rec && <div className="muted sm cap">{r.rec.decision}</div>}
                    </td>
                    <td className="sm">{r.owner.owner.name}</td>
                    <td>
                      <button
                        className="link"
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
                  <td colSpan={10} className="muted center">
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
