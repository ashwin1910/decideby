import { useEffect, useRef, useState } from 'react';
import { Badge, Card, ReassignOwner, StageBadge, TermStatusBadge, TierBadge } from '../components';
import { fmt, fmtWd, diffDays } from '../lib/dates';
import { money, supplierOf, TERM_LABEL, termStatus, tierOf, TYPE_LABEL } from '../lib/logic';
import { useStore } from '../store';
import { REPLAY_STEP_MS, REPLAY_STEPS, replayExtraction, replaySummary, type ReplayResult } from '../lib/replay';

export default function ContractRecord({ id }: { id: string }) {
  const { rows, now, go } = useStore();
  const r = rows.find((x) => x.c.id === id);
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  // Replay state: null = idle, a number = animation step in progress, a result = done.
  const [replay, setReplay] = useState<number | ReplayResult | null>(null);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  if (!r) return <p>Contract not found.</p>;
  const { c, dr, sch, owner } = r;
  const s = supplierOf(c);
  const tier = tierOf(c);

  const runReplay = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    setReplay(0);
    timers.current = [
      ...REPLAY_STEPS.slice(1).map((_, i) => window.setTimeout(() => setReplay(i + 1), REPLAY_STEP_MS * (i + 1))),
      window.setTimeout(() => setReplay(replayExtraction(c, dr)), REPLAY_STEP_MS * REPLAY_STEPS.length),
    ];
  };
  const replaying = typeof replay === 'number';

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
            {sch.triage && <Badge>Triage schedule</Badge>}
            <StageBadge stage={r.stage} />
          </div>
        </div>
        <div className="col gap">
          <button className="primary" onClick={() => go('brief/' + c.id)}>
            Open owner brief →
          </button>
          <button className="ghost" onClick={runReplay} disabled={replaying}>
            ↻ Replay extraction (simulated)
          </button>
          <p className="muted xs replay-note">Demo uses pre-computed AI extraction; in production this step runs an LLM (e.g. Claude) on each document.</p>
        </div>
      </div>
      {replaying && (
        <ol className="replay-steps" role="status" aria-label="Replaying extraction">
          {REPLAY_STEPS.map((label, i) => (
            <li key={label} className={i < (replay as number) ? 'done' : i === replay ? 'current' : ''}>
              {i < (replay as number) ? '✓' : i === replay ? '…' : '·'} {label}
            </li>
          ))}
        </ol>
      )}
      {replay !== null && typeof replay === 'object' && <ReplayPanel result={replay} />}

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
          <ReassignOwner contractId={c.id} currentName={owner.owner.name} />
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

function ReplayPanel({ result }: { result: ReplayResult }) {
  const n = (st: string) => result.rows.filter((r) => r.status === st).length;
  return (
    <Card
      title={replaySummary(result)}
      aside={
        <div className="row gap">
          <Badge tone="green">{n('matched')} matched</Badge>
          {n('changed') > 0 && <Badge tone="amber">{n('changed')} changed</Badge>}
          {n('new') > 0 && <Badge tone="blue">{n('new')} new</Badge>}
          {n('missing') > 0 && <Badge tone="red">{n('missing')} missing</Badge>}
        </div>
      }
    >
      <p className="muted sm">
        Replayed at {result.at.toLocaleTimeString()} from the pre-computed extraction. The verbatim-quote check and the date calculation ran again in code.
      </p>
      <div className="table-wrap">
        <table className="tbl compact">
          <thead>
            <tr>
              <th>Term</th>
              <th>Result</th>
              <th>Stored value</th>
              <th>Extracted value and quote</th>
              <th>Quote check</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <b>{r.label}</b>
                </td>
                <td>
                  <Badge tone={r.status === 'matched' ? 'green' : r.status === 'changed' ? 'amber' : r.status === 'new' ? 'blue' : 'red'}>{r.status}</Badge>
                </td>
                <td>{r.stored}</td>
                <td>
                  {r.extracted}
                  {r.quote && <div className="cite">“{r.quote}”</div>}
                  {r.confidence != null && <div className="muted sm">confidence {Math.round(r.confidence * 100)}%</div>}
                </td>
                <td>{r.quote ? r.quoteVerified ? <Badge tone="green">Verbatim</Badge> : <Badge tone="red">Not in document</Badge> : <Badge>Not found</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
