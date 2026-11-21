import { useState, type ReactNode } from 'react';
import { Badge, Card, DaysLeft, ReassignOwner, StageBadge, TierBadge } from '../components';
import { COMPANY } from '../data/seed';
import type { Contract, TermKey } from '../data/types';
import { addDays, diffDays, fmt, type ISODate } from '../lib/dates';
import {
  priceBaseline,
  money,
  person,
  rateCheck,
  recommend,
  unsentEscalationDate,
  UNSENT_ESCALATION_BUSINESS_DAYS,
  DECISION_LABEL,
  supplierOf,
  TERM_LABEL,
  tierOf,
  type Decision,
  type DateResult,
} from '../lib/logic';
import { useStore, type DecisionRecord, type Row } from '../store';

const ACTIONS: { k: Decision; label: string; desc: string }[] = [
  { k: 'renew', label: 'Renew', desc: 'Keep it as is' },
  { k: 'renegotiate', label: 'Renegotiate', desc: 'Notice, then new terms' },
  { k: 'reduce', label: 'Reduce', desc: 'Cut scope or seats' },
  { k: 'exit', label: 'Exit', desc: 'Do not renew' },
];

/** Once the send window has closed, a notice is invalid: the contract has renewed. */
const LATE_ACTIONS: { k: Decision; label: string; desc: string }[] = [
  { k: 'midterm', label: DECISION_LABEL.midterm, desc: 'It has renewed; ask for better terms within the new term' },
  { k: 'nextcycle', label: DECISION_LABEL.nextcycle, desc: 'Decide well before the next notice deadline' },
];

const KEY_TERMS: TermKey[] = ['end', 'renewal', 'notice', 'tfc', 'priceIncrease', 'minCommit', 'noticeAddress'];

function needsNotice(c: Contract, d: Decision) {
  if (d === 'renew' || d === 'midterm' || d === 'nextcycle') return false;
  if (c.dates.type === 'fixed') return false;
  return true;
}

function approverFor(c: Contract) {
  const t = tierOf(c);
  if (t === 'small') return { who: "Legal's standing template", id: 'template' };
  if (t === 'mid') return { who: `${person('p-proc')!.name} (Procurement)`, id: 'p-proc' };
  return { who: `${person('p-legal')!.name} (Legal)`, id: 'p-legal' };
}

export const METHOD_LABEL = { courier: 'courier', certified: 'certified mail', email: 'email' } as const;

export function letterFooter(c: Contract, tracking?: string) {
  const { method, address } = c.notice;
  if (method === 'email') return `Sent by email from the procurement mailbox to ${address}.`;
  const how = method === 'courier' ? 'Delivered by courier' : 'Sent by certified mail, return receipt requested,';
  return `${how} to ${address}.${tracking ? ` Tracking no. ${tracking}.` : ''}`;
}

export function letterText(c: Contract, dr: DateResult, d: Decision, sendOn: ISODate, tracking?: string) {
  const s = supplierOf(c);
  const noticeQuote = c.terms.find((t) => t.key === 'notice')!.quote;
  const addr = `${METHOD_LABEL[c.notice.method]} — ${c.notice.address}`;
  const evergreenEnd = c.dates.type === 'evergreen' ? addDays(sendOn, c.dates.noticeDays!) : null;
  const intent =
    c.dates.type === 'evergreen'
      ? `gives notice of termination of the Agreement, effective ${fmt(evergreenEnd)} (${c.dates.noticeDays} days from the date of this notice)`
      : `gives notice that it will not renew the Agreement at the end of the current term on ${fmt(dr.termEnd)}`;
  const tail =
    d === 'renegotiate'
      ? `\n\n${COMPANY} would like to continue working with ${s.name} and invites a proposal on revised terms before that date.`
      : d === 'reduce'
        ? `\n\n${COMPANY} is open to continuing on a reduced scope and invites a proposal on that basis.`
        : '';
  return `${fmt(sendOn)}

To: ${s.name}
Delivery: ${addr}

Re: ${c.title}

In accordance with the Agreement — "${noticeQuote}" — ${COMPANY} hereby ${intent}.${tail}

${person('p-proc')!.name}
${person('p-proc')!.title}, ${COMPANY}
${letterFooter(c, tracking)}`;
}

export default function Brief({ id }: { id: string }) {
  const { rows, now, go, records, setRecord } = useStore();
  const r = rows.find((x) => x.c.id === id);
  const [choice, setChoice] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  if (!r) return <p>Contract not found.</p>;
  const { c, dr, owner } = r;
  const rec = records[c.id];
  const s = supplierOf(c);
  const tier = tierOf(c);
  const rc = rateCheck(c);
  const windowClosed = !!dr.noticeDeadline && now > dr.noticeDeadline;
  const baseReco = recommend(c);
  // After the window closes, exit / renegotiate / reduce are no longer possible.
  const reco = windowClosed
    ? baseReco.action === 'renew'
      ? { action: 'nextcycle' as Decision, reasons: [...baseReco.reasons, 'The contract has renewed; set a reminder so the next cycle is decided on time.'] }
      : { action: 'midterm' as Decision, reasons: [`The window to ${baseReco.action} closed on ${fmt(dr.noticeDeadline)}; the contract has renewed.`, ...baseReco.reasons] }
    : baseReco;
  const actions = windowClosed ? LATE_ACTIONS : ACTIONS;
  const pb = priceBaseline(c);
  const autoRenewPrice = pb.baseline;
  const picked = choice && actions.some((a) => a.k === choice) ? choice : reco.action;
  const overriding = picked !== reco.action;

  const decide = (protective = false) => {
    const d: Decision = protective ? 'renegotiate' : picked;
    const r2: DecisionRecord = {
      decision: d,
      recommended: reco.action,
      overrideReason: overriding && !protective ? reason.trim() : undefined,
      decidedOn: now,
      decidedBy: protective ? `${person('p-proc')!.name} (protective notice)` : actor.label,
      protective,
    };
    if (needsNotice(c, d)) {
      r2.letter = tier === 'small' ? { status: 'approved', approvedBy: "Legal's standing template", approvedOn: now } : { status: 'drafted' };
    }
    setRecord(c.id, r2);
  };

  // Once procurement has taken over (or the decide-by date has passed), procurement decides, not the owner.
  const procTook = r.stage === 'takeover' || r.stage === 'overdue';
  const actor = procTook
    ? { label: `${person('p-proc')!.name} (Procurement, took over from ${owner.owner.name})` }
    : { label: owner.owner.name };

  const update = (patch: Partial<DecisionRecord>) => setRecord(c.id, { ...rec!, ...patch });

  const windowNotOpen = !!dr.noticeDeadline && now < dr.windowOpen!;
  const canProtect =
    !rec && !windowClosed && tier === 'large' && !c.critical && c.renewOnNewTermsAfterNotice && (r.stage === 'takeover' || r.stage === 'overdue') && !!dr.noticeDeadline;

  // Where the brief is in its four steps: Decide -> Approve -> Send/Dispatch -> Outcome.
  const step = !rec ? 1 : rec.letter && rec.letter.status === 'drafted' ? 2 : rec.letter && rec.letter.status !== 'sent' ? 3 : rec.outcome ? 5 : 4;
  const STEPS = ['Decide', 'Approve', c.notice.method === 'email' ? 'Send' : 'Dispatch', 'Outcome'];

  return (
    <div className="stack brief">
      <button className="link back" onClick={() => go('contract/' + c.id)}>
        ← Contract record
      </button>
      <div className="brief-head">
        <p className="eyebrow">Owner brief · one page</p>
        <h1>{s.name}</h1>
        <p className="muted">
          For <b>{owner.owner.name}</b> ({owner.owner.title}), budget owner of {owner.costCentre}. Consulted: {owner.approver.name}.
        </p>
        <div className="row gap wrap">
          <TierBadge tier={tier} />
          <StageBadge stage={r.stage} />
          {r.sch.triage && <Badge>Triage schedule</Badge>}
          <ReassignOwner contractId={c.id} currentName={owner.owner.name} />
        </div>
      </div>

      {/* ---------------- Decision first (sticky) ---------------- */}
      <section className={`card decision-card ${rec ? 'done' : 'active'}`} aria-label="Decision">
        <div className="decision-top">
          <div className="decide-box">
            <div className="muted sm">Decide by</div>
            <DaysLeft date={dr.decideBy} now={now} />
            {dr.noticeDeadline && (
              <div className="muted sm">
                Send window {fmt(dr.windowOpen)} – {fmt(dr.noticeDeadline)}
              </div>
            )}
          </div>
          <div className="reco">
          <div>
            <div className="muted sm">Default recommendation</div>
            <div className="reco-a">{DECISION_LABEL[reco.action]}</div>
          </div>
          <ul>
            {reco.reasons.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
          </div>
        </div>
        {rec ? (
          <div className="note ok">
            <b>{DECISION_LABEL[rec.decision]}</b> — decided by {rec.decidedBy} on {fmt(rec.decidedOn)}
            {rec.decidedOn <= dr.decideBy ? ' (before the decide-by date)' : ' (after the decide-by date)'}.
            {rec.overrideReason && <> Override reason: “{rec.overrideReason}”.</>}
            <button className="link sm" onClick={() => setRecord(c.id, undefined)}>
              Undo
            </button>
          </div>
        ) : (
          <>
            {windowClosed && (
              <div className="note bad" role="alert">
                <b>The send window closed on {fmt(dr.noticeDeadline)}.</b> A notice now would be invalid, so the contract has renewed on its terms. Renegotiate and
                Exit are no longer available; negotiate within the new term or set a reminder for the next cycle.
              </div>
            )}
            <div className={`choices ${windowClosed ? 'two-up' : ''}`}>
              {actions.map((a) => (
                <button
                  key={a.k}
                  type="button"
                  className={`choice ${picked === a.k ? 'on' : ''}`}
                  aria-pressed={picked === a.k}
                  aria-label={`${a.label}: ${a.desc}${reco.action === a.k ? ' (recommended)' : ''}`}
                  onClick={() => setChoice(a.k)}
                >
                  <b>{a.label}</b>
                  <span>{a.desc}</span>
                  {reco.action === a.k && <em>recommended</em>}
                </button>
              ))}
            </div>
            {overriding && (
              <label className="field">
                <span>Overriding the recommendation needs a one-line reason</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Ops relies on them for peak season; will renegotiate next year" />
              </label>
            )}
            <div className="row gap">
              <button className="primary" disabled={overriding && reason.trim().length < 5} onClick={() => decide()}>
                {tier === 'small' ? `Confirm “${DECISION_LABEL[picked]}” (one tap)` : `Record decision: ${DECISION_LABEL[picked]}`}
              </button>
              <span className="muted sm">as {actor.label}</span>
            </div>
            {canProtect && (
              <div className="note bad">
                <b>Nobody has decided and procurement has taken over.</b> This large, non-critical contract allows renewing on new terms after notice, so procurement can
                send a protective notice of non-renewal to keep leverage while it renegotiates (needs human approval).
                <div>
                  <button className="danger sm" onClick={() => decide(true)}>
                    Draft protective notice
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* ---------------- Supporting evidence ---------------- */}
      <div className="evidence">
        <Section title="Terms in force (after amendments)">
          <dl className="kv">
            {KEY_TERMS.map((k) => {
              const t = c.terms.find((x) => x.key === k)!;
              const doc = c.docs.find((d) => d.id === t.docId);
              return (
                <div key={k}>
                  <dt>{TERM_LABEL[k]}</dt>
                  <dd>
                    {t.value}
                    {t.quote && (
                      <div className="cite" title={t.quote}>
                        “{t.quote.length > 140 ? t.quote.slice(0, 140) + '…' : t.quote}” — {doc?.title}
                      </div>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </Section>
        <Section title={pb.contracted ? 'Price: increase already contracted' : 'Price if renewed'} aside={<span className="muted sm">{money(autoRenewPrice)} next 12 months</span>}>
            <div className="price">
              <div>
                <div className="muted sm">Last 12 months billed</div>
                <div className="big">{money(pb.spend)}</div>
                {pb.overbilled > 0 && <div className="muted sm">{money(pb.contractedSpend)} at contracted rates</div>}
              </div>
              <div className="arrow">→</div>
              <div>
                <div className="muted sm">
                  {pb.contracted
                    ? `Next 12 months: +${pb.pct}% contracted from ${fmt(pb.from)} (${pb.source})`
                    : pb.pct
                      ? `Next 12 months if it renews (up to +${pb.pct}%)`
                      : 'Next 12 months if it renews (fees fixed)'}
                </div>
                <div className="big">{money(autoRenewPrice)}</div>
              </div>
            </div>
            <p className="muted sm">
              {pb.contracted && dr.termEnd && pb.from && pb.from < dr.termEnd
                ? `The increase applies inside the current term (which ends ${fmt(dr.termEnd)}), so it is owed whatever is decided at renewal. `
                : ''}
              {pb.explain}
            </p>
        </Section>
        {c.rateCard && (
          <Section
            title="Rate check against the contract"
            open={rc.findings.length > 0}
            aside={rc.findings.length ? <Badge tone="red">{money(rc.total)} over</Badge> : rc.checked ? <Badge tone="green">Clean</Badge> : <Badge>Not checkable</Badge>}
          >
              {rc.findings.length ? (
                <>
                  <p>
                    {rc.findings.length} invoice lines billed above the rate in force. {rc.findings[0].note}.
                  </p>
                  <div className="table-wrap">
                    <table className="tbl compact">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Role</th>
                          <th className="num">Billed</th>
                          <th className="num">Contract</th>
                          <th className="num">Over</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rc.findings.map((f) => (
                          <tr key={f.invoiceId + f.item}>
                            <td>{fmt(f.date)}</td>
                            <td>{f.item}</td>
                            <td className="num">${f.billed.toFixed(2)}</td>
                            <td className="num">${f.contract.toFixed(2)}</td>
                            <td className="num">{money(f.overcharge)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="muted">{rc.checked ? `${rc.checked} invoices checked line by line; all at or below the rate card.` : 'Not checkable: invoices are billed as totals, with no unit prices to compare against the rate card.'}</p>
              )}
            {(rc.total > 0 || !!c.serviceCredit?.amount) && <CreditCard row={r} overcharge={rc.total} serviceCredit={c.serviceCredit?.amount ?? 0} />}
          </Section>
        )}
        {!c.rateCard && !!c.serviceCredit?.amount && <CreditCard row={r} overcharge={0} serviceCredit={c.serviceCredit.amount} />}
        <Section title="Approver input" aside={c.approverAnswers ? <span className="muted sm">answered by {owner.approver.name}</span> : <Badge>No answer yet</Badge>}>
            {c.approverAnswers ? (
              <dl className="kv three">
                <div>
                  <dt>Do we still use it?</dt>
                  <dd className="cap">{c.approverAnswers.stillUsed}</dd>
                </div>
                <div>
                  <dt>How is it performing?</dt>
                  <dd className="cap">{c.approverAnswers.performance}</dd>
                </div>
                <div>
                  <dt>Would we miss it?</dt>
                  <dd className="cap">{c.approverAnswers.wouldMiss}</dd>
                </div>
                {c.approverAnswers.note && <p className="quote-note">“{c.approverAnswers.note}” — {owner.approver.name}</p>}
              </dl>
            ) : (
              <p className="muted">
                {owner.approver.name} has been asked the three questions; no answer yet.
              </p>
            )}
            {c.serviceCredit && (
              <div className="note">
                <b>Service credit:</b> “{c.serviceCredit.clause}”
                {c.serviceCredit.claimable && (
                  <>
                    {' '}
                    <b className="tone-amber">Could be claimed:</b> {c.serviceCredit.claimable}
                    {c.serviceCredit.amount ? ` — about ${money(c.serviceCredit.amount)}.` : '.'}
                  </>
                )}
              </div>
            )}
        </Section>
      </div>

      {/* ---------------- Stepper ---------------- */}
      <ol className="stepper" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className={step > i + 1 ? 'done' : step === i + 1 ? 'current' : ''} aria-current={step === i + 1 ? 'step' : undefined}>
            <span className="step-n">{step > i + 1 ? '✓' : i + 1}</span>
            {label}
            {i === 1 && rec && !rec.letter && <span className="muted sm"> · not needed</span>}
          </li>
        ))}
      </ol>

      {/* ---------------- Step 2: notice ---------------- */}
      {rec && (
        <Card title="Approve and send the notice" className={rec.letter?.status === 'sent' || !rec.letter ? 'done' : 'active'}>
          {!rec.letter ? (
            <p className="muted">
              {rec.decision === 'renew'
                ? 'Renewing: no notice is sent. The contract renews on its terms.'
                : rec.decision === 'midterm'
                  ? 'No notice: the contract has renewed. Procurement opens a mid-term negotiation with the supplier.'
                  : rec.decision === 'nextcycle'
                    ? `No notice: the contract has renewed. A reminder is set for the next cycle's brief.`
                    : 'Fixed term: no notice is needed; it ends on its own. Procurement starts the new agreement or the exit plan.'}
            </p>
          ) : (
            <>
              {r.stage === 'ready' && (
                <div className="note ok" role="status">
                  <b>Ready to send.</b> The window opened on {fmt(dr.windowOpen)} and closes on {fmt(dr.noticeDeadline)}. If it is still unsent on{' '}
                  {fmt(unsentEscalationDate(dr))} it is escalated.
                </div>
              )}
              {r.stage === 'unsent' && (
                <div className="note bad" role="alert">
                  <b>Escalated: the letter is still unsent</b> {UNSENT_ESCALATION_BUSINESS_DAYS} business days before the window closes on {fmt(dr.noticeDeadline)}.
                  Escalated to {person('p-proc')!.name} (Procurement){tier !== 'small' && r.owner.manager ? ` and ${r.owner.manager.name}` : ''}.
                </div>
              )}
              <pre className="letter">{letterText(c, dr, rec.decision, rec.letter.sentOn ?? now, rec.letter.tracking)}</pre>
              <div className="letter-steps">
                <div className={`ls ${rec.letter.status !== 'drafted' ? 'ok' : ''}`}>
                  <b>Approve</b>
                  {rec.letter.status === 'drafted' ? (
                    <button
                      className="primary sm"
                      onClick={() => update({ letter: { status: 'approved', approvedBy: approverFor(c).who, approvedOn: now } })}
                    >
                      Approve as {approverFor(c).who}
                    </button>
                  ) : (
                    <span className="muted sm">
                      {rec.letter.approvedBy}, {fmt(rec.letter.approvedOn)}
                    </span>
                  )}
                </div>
                <SendStep row={r} now={now} windowNotOpen={windowNotOpen} windowClosed={windowClosed} onUpdate={update} />
              </div>
            </>
          )}
        </Card>
      )}

      {/* ---------------- Step 3: outcome ---------------- */}
      {rec && (!rec.letter || rec.letter.status === 'sent') && <OutcomeStep row={r} autoRenewPrice={autoRenewPrice} />}
    </div>
  );
}

function OutcomeStep({ row, autoRenewPrice }: { row: Row; autoRenewPrice: number }) {
  const { records, setRecord, now, credits } = useStore();
  const rec = records[row.c.id]!;
  const credit = credits[row.c.id];
  const [recovered, setRecovered] = useState(String(rec.outcome?.recovered ?? (credit ? credit.overcharge + credit.serviceCredit : 0)));
  const explain = priceBaseline(row.c).explain;
  const def = rec.decision === 'exit' ? 0 : rec.decision === 'renew' ? autoRenewPrice : Math.round(autoRenewPrice * 0.94);
  const [price, setPrice] = useState(String(rec.outcome?.newAnnual ?? def));
  const [term, setTerm] = useState(String(rec.outcome?.termMonths ?? (rec.decision === 'exit' ? 0 : 12)));
  const [note, setNote] = useState(rec.outcome?.note ?? '');
  const savings = autoRenewPrice - Number(price || 0);

  if (rec.outcome)
    return (
      <Card title="Outcome recorded" className="done">
        <div className="stats">
          <div className="stat">
            <div className="stat-l">New annual price</div>
            <div className="stat-v">{money(rec.outcome.newAnnual)}</div>
          </div>
          <div className="stat">
            <div className="stat-l">Term</div>
            <div className="stat-v">{rec.outcome.termMonths ? `${rec.outcome.termMonths} mo` : 'Ended'}</div>
          </div>
          <div className="stat stat-accent">
            <div className="stat-l">Savings vs baseline (per year)</div>
            <div className="stat-v">{money(rec.outcome.savings)}</div>
          </div>
          <div className="stat">
            <div className="stat-l">Recovered (credits)</div>
            <div className="stat-v">{money(rec.outcome.recovered ?? 0)}</div>
          </div>
        </div>
        <p className="muted sm">{explain}</p>
        {rec.outcome.note && <p className="muted">“{rec.outcome.note}”</p>}
        <p className="note ok">Recorded {fmt(rec.outcome.recordedOn)}. Next year's brief starts from this outcome.</p>
        <button className="link sm" onClick={() => setRecord(row.c.id, { ...rec, outcome: undefined })}>
          Edit outcome
        </button>
      </Card>
    );

  return (
    <Card title="Record the outcome" className="active">
      <div className="form-row">
        <label className="field">
          <span>New annual price ($)</span>
          <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label className="field">
          <span>New term (months, 0 if ended)</span>
          <input type="number" value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
        <label className="field">
          <span>Recovered ($, credits received)</span>
          <input type="number" value={recovered} onChange={(e) => setRecovered(e.target.value)} />
        </label>
        <label className="field grow">
          <span>Note</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 6% increase withdrawn; overcharge credited" />
        </label>
      </div>
      <p>
        Baseline {money(autoRenewPrice)} → savings <b className={savings >= 0 ? 'tone-green' : 'tone-red'}>{money(savings)}</b> a year
        {Number(recovered) > 0 && <>, plus {money(Number(recovered))} recovered once</>}.
      </p>
      <p className="muted sm">{explain}</p>
      <button
        className="primary"
        onClick={() =>
          setRecord(row.c.id, {
            ...rec,
            outcome: { newAnnual: Number(price || 0), termMonths: Number(term || 0), autoRenewPrice, savings, recovered: Number(recovered || 0), note, recordedOn: now },
          })
        }
      >
        Record outcome
      </button>
    </Card>
  );
}

function SendStep({
  row,
  now,
  windowNotOpen,
  windowClosed,
  onUpdate,
}: {
  row: Row;
  now: ISODate;
  windowNotOpen: boolean;
  windowClosed: boolean;
  onUpdate: (patch: Partial<DecisionRecord>) => void;
}) {
  const { records } = useStore();
  const { c, dr } = row;
  const rec = records[c.id]!;
  const letter = rec.letter!;
  const [tracking, setTracking] = useState('');
  const tier = tierOf(c);
  const email = c.notice.method === 'email';
  const title = email ? 'Send by email, inside the window' : `Dispatch by ${METHOD_LABEL[c.notice.method]}, inside the window`;

  let body;
  if (letter.status === 'sent') {
    body = (
      <span className="muted sm">
        {email ? `Emailed ${fmt(letter.sentOn)} to ${c.notice.address}` : `Dispatched by ${METHOD_LABEL[c.notice.method]} ${fmt(letter.sentOn)} · tracking ${letter.tracking}`}
      </span>
    );
  } else if (letter.status === 'drafted') {
    body = <span className="muted sm">Waiting for approval</span>;
  } else if (windowNotOpen) {
    body = (
      <span className="held">
        ⏸ Held until the window opens on <b>{fmt(dr.windowOpen)}</b> ({diffDays(dr.windowOpen!, now)} days). Move the slider to release it.
      </span>
    );
  } else if (windowClosed) {
    body = <span className="tone-red sm">Window closed on {fmt(dr.noticeDeadline)} — sending now would be invalid.</span>;
  } else if (email) {
    body = (
      <button className="primary sm" onClick={() => onUpdate({ letter: { ...letter, status: 'sent', sentOn: now } })}>
        {tier === 'small' ? `DecideBy emails ${c.notice.address} now` : `Send by email to ${c.notice.address}`}
      </button>
    );
  } else if (letter.status === 'approved') {
    body = (
      <button className="primary sm" onClick={() => onUpdate({ letter: { ...letter, status: 'packed', packedOn: now } })}>
        Generate dispatch pack
      </button>
    );
  } else {
    body = (
      <div className="col gap">
        <div className="dispatch-pack">
          <div className="muted sm">Dispatch pack · {METHOD_LABEL[c.notice.method]}</div>
          <div className="address-label">
            <b>{supplierOf(c).name}</b>
            <br />
            {c.notice.address}
          </div>
          <pre className="letter">{letterText(c, dr, rec.decision, now)}</pre>
        </div>
        <div className="row gap wrap">
          <button className="ghost sm" onClick={() => window.print()}>
            Print pack
          </button>
          <label className="field inline">
            <span>Tracking number</span>
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="e.g. 1Z 999 AA1 0123 4567 84" />
          </label>
          <button
            className="primary sm"
            disabled={tracking.trim().length < 4}
            onClick={() => onUpdate({ letter: { ...letter, status: 'sent', sentOn: now, tracking: tracking.trim() } })}
          >
            Mark dispatched
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`ls ${letter.status === 'sent' ? 'ok' : ''}`}>
      <b>{title}</b>
      {body}
    </div>
  );
}

function CreditCard({ row, overcharge, serviceCredit }: { row: Row; overcharge: number; serviceCredit: number }) {
  const { credits, requestCredit, now } = useStore();
  const { c } = row;
  const req = credits[c.id];
  const total = overcharge + serviceCredit;
  const ap = person('p-ap5')!;
  const draft = `To: ${supplierOf(c).name} — accounts receivable (${c.notice.address})
Cc: ${ap.name}, ${ap.title}, Accounts Payable, ${COMPANY}

Re: Request for credit note — ${c.title}

Please issue a credit note for ${money(total)}:${overcharge ? `
- ${money(overcharge)} billed above the contracted rates (increase billed before its effective date); invoice lines attached.` : ''}${serviceCredit ? `
- about ${money(serviceCredit)} service credit under the clause “${c.serviceCredit!.clause}”` : ''}

${person('p-proc')!.name}
${person('p-proc')!.title}, ${COMPANY}`;
  return (
    <Card title="Money to recover" aside={<Badge tone="amber">{money(total)}</Badge>}>
      <p className="sm">
        {overcharge > 0 && <>{money(overcharge)} overbilled</>}
        {overcharge > 0 && serviceCredit > 0 && ' + '}
        {serviceCredit > 0 && <>about {money(serviceCredit)} service credit</>}. Raise it now; it does not depend on the renewal decision.
      </p>
      {req ? (
        <>
          <pre className="letter">{draft}</pre>
          <p className="note ok">
            Credit note requested on {fmt(req.requestedOn)}; Accounts Payable copied. Record the amount received in the outcome.
            <button className="link sm" onClick={() => requestCredit(c.id, undefined)}>
              Undo
            </button>
          </p>
        </>
      ) : (
        <button className="primary sm" onClick={() => requestCredit(c.id, { requestedOn: now, overcharge, serviceCredit })}>
          Request credit note
        </button>
      )}
    </Card>
  );
}

/** A collapsible evidence section. */
function Section({ title, aside, open = false, children }: { title: string; aside?: ReactNode; open?: boolean; children: ReactNode }) {
  return (
    <details className="card section" open={open}>
      <summary>
        <h3>{title}</h3>
        {aside}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
