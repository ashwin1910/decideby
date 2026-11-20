import { useState } from 'react';
import { Badge, Card, StageBadge, TermStatusBadge, TierBadge } from '../components';
import { fmt, fmtWd, diffDays } from '../lib/dates';
import { money, quoteFound, supplierOf, TERM_LABEL, termStatus, tierOf, TYPE_LABEL, computeDates } from '../lib/logic';
import { GO_LIVE } from '../data/seed';
import { useStore } from '../store';

export default function ContractRecord({ id }: { id: string }) {
  const { rows, now, go } = useStore();
  const r = rows.find((x) => x.c.id === id);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [rerun, setRerun] = useState<'idle' | 'running' | string>('idle');
  if (!r) return <p>Contract not found.</p>;
  const { c, dr, sch, owner } = r;
  const s = supplierOf(c);
  const tier = tierOf(c);

  const runLive = () => {
    setRerun('running');
    setTimeout(() => {
      const verified = c.terms.filter((t) => quoteFound(c, t.key)).length;
      const again = computeDates(c, GO_LIVE);
      const same = again.decideBy === dr.decideBy && again.noticeDeadline === dr.noticeDeadline;
      setRerun(
        `Re-ran at ${new Date().toLocaleTimeString()}: ${verified} of ${c.terms.length} quotes found verbatim in the source documents; dates recalculated — ${same ? 'unchanged' : 'CHANGED'}.`,
      );
    }, 1400);
  };

  const windowState = !dr.noticeDeadline
    ? null
    : now < dr.windowOpen!
      ? { tone: 'amber', text: `Not open yet — opens in ${diffDays(dr.windowOpen!, now)} days. An approved letter is held until then.` }
      : now > dr.noticeDeadline
        ? { tone: 'red', text: 'Closed — a notice now would be invalid.' }
        : { tone: 'green', text: `Open now — ${diffDays(dr.noticeDeadline, now)} days until it closes.` };

  const span = Math.max(1, diffDays(sch.milestones[sch.milestones.length - 1].date, sch.milestones[0].date));
  const pos = (d: string) => Math.min(100, Math.max(0, (diffDays(d, sch.milestones[0].date) / span) * 100));

  return (
    <div className="stack">
      <button className="link back" onClick={() => go('triage')}>
        ← Triage
      </button>
      <div className="rec-head">
        <div>
          <p className="eyebrow">Contract record</p>
          <h1>{s.name}</h1>
          <p className="muted">
            {c.title} · {s.category} · {money(s.annualSpend)} / year
          </p>
          <div className="row gap">
            <TierBadge tier={tier} />
            <Badge>{TYPE_LABEL[c.dates.type]}</Badge>
            {c.critical && <Badge tone="violet">Business-critical</Badge>}
            {sch.triage && <Badge tone="red">Triage schedule</Badge>}
            <StageBadge stage={r.stage} />
          </div>
        </div>
        <div className="col gap">
          <button className="primary" onClick={() => go('brief/' + c.id)}>
            Open owner brief →
          </button>
          <button className="ghost" onClick={runLive} disabled={rerun === 'running'}>
            {rerun === 'running' ? 'Re-running…' : '↻ Re-run live'}
          </button>
        </div>
      </div>
      {rerun !== 'idle' && rerun !== 'running' && <div className="note ok">{rerun}</div>}

      {dr.missedPrior && (
        <div className="note bad">
          <b>Finding:</b> the notice deadline for the term ending {fmt(dr.missedPrior.renewedOn)} was {fmt(dr.missedPrior.deadline)} — already passed at go-live, so
          this contract renews. DecideBy is now working on the following term.
        </div>
      )}

      <div className="two">
        <Card title="Decide-by date" className="date-card">
          <div className="big">{fmtWd(dr.decideBy)}</div>
          <p className="muted">
            Internal date; it leans early. {diffDays(dr.decideBy, now) >= 0 ? `${diffDays(dr.decideBy, now)} days from the simulated date.` : `${-diffDays(dr.decideBy, now)} days overdue.`}
          </p>
        </Card>
        <Card title="Send window" className="date-card">
          {dr.noticeDeadline ? (
            <>
              <div className="big">
                {fmt(dr.windowOpen)} → {fmt(dr.noticeDeadline)}
              </div>
              <p className={`tone-${windowState!.tone}`}>{windowState!.text}</p>
              <p className="muted sm">When a notice to the supplier is valid. Respected exactly.</p>
            </>
          ) : c.dates.type === 'fixed' ? (
            <>
              <div className="big">No notice needed</div>
              <p className="muted">Fixed term ends {fmt(dr.termEnd)} on its own.</p>
            </>
          ) : (
            <>
              <div className="big">Any time</div>
              <p className="muted">Evergreen: {c.dates.noticeDays} days' notice sets the end date.</p>
            </>
          )}
        </Card>
      </div>

      <Card title="How the dates were calculated" aside={<span className="muted sm">Code does the date maths, step by step</span>}>
        <ol className="steps">
          {dr.steps.map((st, i) => (
            <li key={i}>{st}</li>
          ))}
        </ol>
        {c.answerKey && (
          <p className="note">
            Answer key for this synthetic family: decide-by {fmt(c.answerKey.decideBy)}
            {c.answerKey.noticeDeadline && <>, notice deadline {fmt(c.answerKey.noticeDeadline)}</>}
            {c.answerKey.windowOpen && <>, window opens {fmt(c.answerKey.windowOpen)}</>}.{' '}
            {c.answerKey.decideBy === dr.decideBy ? <b className="tone-green">Matches.</b> : <b className="tone-red">Mismatch.</b>}
          </p>
        )}
      </Card>

      <Card title={`${c.terms.length} terms, each with a verbatim quote`} aside={<span className="muted sm">Legal verifies only action terms that are low-confidence or on a large contract</span>}>
        <div className="table-wrap">
          <table className="tbl terms">
            <thead>
              <tr>
                <th>Term</th>
                <th>Value</th>
                <th>Quote (source)</th>
                <th className="num">Conf.</th>
                <th>Check</th>
              </tr>
            </thead>
            <tbody>
              {c.terms.map((t) => {
                const doc = c.docs.find((d) => d.id === t.docId);
                return (
                  <tr key={t.key}>
                    <td>
                      <b>{TERM_LABEL[t.key]}</b>
                    </td>
                    <td>{t.value}</td>
                    <td>
                      {t.quote ? <q>{t.quote}</q> : <span className="muted">Not found in any document</span>}
                      {doc && (
                        <button className="link sm block" onClick={() => setOpenDoc(doc.id)}>
                          {doc.title}
                        </button>
                      )}
                    </td>
                    <td className="num">{Math.round(t.confidence * 100)}%</td>
                    <td>
                      <TermStatusBadge s={termStatus(c, t.key)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="two">
        <Card title="Contract family">
          <ul className="docs">
            {c.docs.map((d) => (
              <li key={d.id}>
                <button className="link" onClick={() => setOpenDoc(openDoc === d.id ? null : d.id)}>
                  {d.title}
                </button>
                <div className="row gap sm">
                  <Badge tone={d.kind === 'signed' ? 'green' : d.kind === 'amendment' ? 'blue' : 'neutral'}>{d.kind}</Badge>
                  <span className="muted">{d.source}</span>
                  {d.signedOn && <span className="muted">signed {fmt(d.signedOn)}</span>}
                </div>
                {openDoc === d.id && <pre className="doc">{d.text}</pre>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Who decides">
          <p>
            <b>{owner.owner.name}</b>, {owner.owner.title} <span className="muted">— budget owner, decides</span>
          </p>
          <p>
            <b>{owner.approver.name}</b>, {owner.approver.title} <span className="muted">— invoice approver, consulted</span>
          </p>
          {owner.manager && (
            <p>
              <b>{owner.manager.name}</b>, {owner.manager.title} <span className="muted">— escalation {tier === 'small' ? '(never for small contracts)' : ''}</span>
            </p>
          )}
          <ul className="reason">
            {owner.reason.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          <p className="muted sm">The owner can reassign in one tap.</p>
        </Card>
      </div>

      <Card title={sch.triage ? 'Schedule — triage (already inside its lead time at go-live)' : `Schedule — ${tier} tier`}>
        <div className="bar-track">
          <div className="bar-fill" style={{ width: `${pos(now)}%` }} />
        </div>
        <ol className="milestones">
          {sch.milestones.map((m) => (
            <li key={m.key} className={now >= m.date ? 'past' : ''}>
              <span className="ms-dot" />
              <span className="ms-date">{fmt(m.date)}</span>
              <span>{m.label}</span>
              {now >= m.date && <span className="muted sm">· reached</span>}
            </li>
          ))}
        </ol>
        <p className="muted sm">Simulated date: {fmt(now)}. {r.rec ? 'Decided — escalation stopped.' : 'Undecided — escalation continues as the slider moves.'}</p>
      </Card>
    </div>
  );
}
