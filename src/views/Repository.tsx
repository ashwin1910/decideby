import { useMemo, useState } from 'react';
import { Badge, Card, Stat, TierBadge } from '../components';
import { CONTRACTS, COST_CENTRES, INVOICES, SUPPLIERS } from '../data/seed';
import type { TermKey } from '../data/types';
import { fmt } from '../lib/dates';
import { moneyK, person, supplierOf, TERM_LABEL, tierOf } from '../lib/logic';
import { parseQuery, runQuery } from '../lib/search';
import { useStore } from '../store';
import { inScope } from './Triage';
import LegalQueue from './LegalQueue';

const EXAMPLES = [
  'auto-renewing staffing contracts over $50k with notice deadlines in the next 90 days',
  "which suppliers can we exit for convenience on 30 days' notice?",
  'software contracts with a price increase over $100k',
  'contracts governed by the law of New York with audit rights',
  'who owns the Atlas Freight contract and when is it due?',
];

export default function Repository() {
  const { rows, now, go } = useStore();
  const [q, setQ] = useState(EXAMPLES[0]);
  const [asked, setAsked] = useState(EXAMPLES[0]);
  const [connected, setConnected] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const docs = CONTRACTS.flatMap((c) => c.docs);
  const byKind = (k: string) => docs.filter((d) => d.kind === k).length + (k === 'draft' ? SUPPLIERS.filter((s) => s.draftDoc).length : 0);
  const scope = SUPPLIERS.filter(inScope);
  const covered = scope.filter((s) => s.status === 'contract');
  const gaps = scope.filter((s) => s.status !== 'contract');

  const parsed = useMemo(() => parseQuery(asked, now), [asked, now]);
  const { filters, unparsed, show } = parsed;
  const results = useMemo(() => runQuery(parsed, rows.map((r) => ({ ...r, owner: r.owner.owner, ownerInfo: r.owner }))), [parsed, rows]);
  const citeKeys = [...new Set(filters.map((f) => f.cite))].filter((k) => k !== 'parties') as TermKey[];
  const cols: TermKey[] = citeKeys.length ? citeKeys : show.owner || show.due ? [] : ['renewal'];
  const partial = unparsed.length > 0;

  const ownerOf = (sid: string) => {
    const s = SUPPLIERS.find((x) => x.id === sid)!;
    const cc = COST_CENTRES.find((c) => c.id === s.ccSplit[0][0])!;
    return person(cc.ownerId) ?? person(person(cc.approverId)?.managerId);
  };

  return (
    <div className="stack">
      <div className="hero">
        <p className="eyebrow">Intelligent repository</p>
        <h1>Every signed supplier contract, read and searchable — with a quote behind every answer.</h1>
      </div>

      <div className="two">
        <Card
          title="Sources (read-only)"
          aside={
            <button
              className="ghost sm"
              disabled={syncing}
              onClick={() => {
                setSyncing(true);
                setTimeout(() => {
                  setSyncing(false);
                  setConnected(true);
                }, 1200);
              }}
            >
              {syncing ? 'Syncing…' : connected ? '↻ Re-sync' : 'Connect the drive'}
            </button>
          }
        >
          <ul className="sources">
            <li>
              <b>Shared drive</b> › Contracts <Badge tone="green">connected</Badge>
              <div className="muted sm">Seeded folder for the demo — no real Google login</div>
            </li>
            <li>
              <b>Procurement mailbox</b> · named folders only <Badge tone="green">connected</Badge>
              <div className="muted sm">E-signature envelopes and attachments</div>
            </li>
            <li>
              <b>ERP invoice export</b> · supplier, cost centre, approver <Badge tone="green">connected</Badge>
              <div className="muted sm">{INVOICES.length} invoices, 12 months</div>
            </li>
          </ul>
          <div className="kinds">
            <Stat label="Signed" value={byKind('signed')} />
            <Stat label="Amendments" value={byKind('amendment')} />
            <Stat label="Drafts only" value={byKind('draft')} />
            <Stat label="Duplicates" value={byKind('duplicate')} />
          </div>
          <p className="muted sm">Grouped into {CONTRACTS.length} contract families. AI provider set not to retain or train on company data.</p>
        </Card>

        <Card title="Coverage of in-scope suppliers" aside={<b className="big-sm">{Math.round((covered.length / scope.length) * 100)}%</b>}>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${(covered.length / scope.length) * 100}%` }} />
          </div>
          <p className="muted sm">
            In scope = paid in 3+ of the last 12 months, or over $10k a year: {scope.length} of {SUPPLIERS.length} suppliers. {covered.length} have a signed contract
            found. Target: 80% by day 30.
          </p>
          <ul className="gaps">
            {gaps.map((s) => (
              <li key={s.id}>
                <b>{s.name}</b> <span className="muted sm">{moneyK(s.annualSpend)}/yr</span>
                <div className="sm">
                  {s.status === 'missing' && (
                    <>
                      <Badge tone="amber">No contract found</Badge> Upload request sent to {ownerOf(s.id)?.name}
                    </>
                  )}
                  {s.status === 'draftOnly' && (
                    <>
                      <Badge tone="red">Finding</Badge> Only an unsigned draft exists: “{s.draftDoc!.title}”
                    </>
                  )}
                  {s.status === 'onlineTerms' && (
                    <>
                      <Badge tone="amber">Gap</Badge> Terms held online, not in the drive: {s.onlineTermsUrl}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Search and ask, with citations">
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            setAsked(q);
          }}
        >
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about any of the terms…" />
          <button className="primary">Ask</button>
        </form>
        <div className="chips">
          {EXAMPLES.map((x) => (
            <button
              key={x}
              className="chip"
              onClick={() => {
                setQ(x);
                setAsked(x);
              }}
            >
              {x}
            </button>
          ))}
        </div>
        <div className="row gap wrap sm">
          <span className="muted">Understood as:</span>
          {filters.length ? filters.map((f) => <Badge key={f.label} tone="blue">{f.label}</Badge>) : <span className="muted">no filters recognised</span>}
          {show.owner && <Badge tone="blue">Answer: owner</Badge>}
          {show.due && <Badge tone="blue">Answer: due dates</Badge>}
          {partial && (
            <span className="tone-red" role="status">
              Couldn't interpret: {unparsed.map((u) => `'${u}'`).join(', ')}
            </span>
          )}
        </div>
        {partial && results.length > 0 ? (
          <p className="note warn">
            <b>Partial answer.</b> These {results.length} contracts match only the parts above that were understood — the list ignores {unparsed.map((u) => `'${u}'`).join(', ')}. Rephrase or
            pick an example to get a full answer.
          </p>
        ) : (
          <p className="answer">
            {partial && !filters.length ? (
              <>No answer: the question wasn't understood. Try one of the examples.</>
            ) : (
              <>
                <b>{results.length}</b> contract{results.length === 1 ? '' : 's'} match.
                {results.length === 0 && filters.some((f) => f.label === 'Liability uncapped') && ' Every contract in the repository has a liability cap.'}
              </>
            )}
          </p>
        )}
        {results.length > 0 && (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Tier</th>
                  <th className="num">Annual</th>
                  {show.owner && <th>Budget owner</th>}
                  {show.due && <th>Decide by · notice deadline</th>}
                  {cols.map((k) => (
                    <th key={k}>{TERM_LABEL[k]} (cited)</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.c.id} className="click" onClick={() => go('contract/' + r.c.id)}>
                    <td>
                      <b>{supplierOf(r.c).name}</b>
                      <div className="muted sm">{supplierOf(r.c).category}</div>
                    </td>
                    <td>
                      <TierBadge tier={tierOf(r.c)} />
                    </td>
                    <td className="num">{moneyK(supplierOf(r.c).annualSpend)}</td>
                    {show.owner && (
                      <td>
                        <b>{r.owner.name}</b>
                        <div className="muted sm">{r.owner.title} · {r.ownerInfo.costCentre}</div>
                      </td>
                    )}
                    {show.due && (
                      <td>
                        {fmt(r.dr.decideBy)}
                        <div className="muted sm">{r.dr.noticeDeadline ? `notice by ${fmt(r.dr.noticeDeadline)}` : 'no notice needed'}</div>
                      </td>
                    )}
                    {cols.map((k) => {
                      const t = r.c.terms.find((x) => x.key === k)!;
                      return (
                        <td key={k}>
                          {t.value}
                          {k === 'notice' && r.dr.noticeDeadline && <div className="sm">Deadline {fmt(r.dr.noticeDeadline)}</div>}
                          {t.quote && <div className="cite">“{t.quote}”</div>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted sm">
          In this prototype the question is parsed into filters over the extracted terms in code, so every answer is traceable to a quoted clause.
        </p>
      </Card>

      <LegalQueue />
    </div>
  );
}
