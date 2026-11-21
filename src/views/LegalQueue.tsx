import { useState } from 'react';
import { Badge, Card, TermStatusBadge, TierBadge } from '../components';
import { fmt } from '../lib/dates';
import { ACTION_TERMS, supplierOf, TERM_LABEL, termStatus, tierOf } from '../lib/logic';
import { useStore } from '../store';

/** Legal's review queue: only terms that trigger an action and are low-confidence or on a large contract. */
export default function LegalQueue() {
  const { rows, go } = useStore();
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  // Every term that isn't plainly trusted...
  const flagged = rows.flatMap((r) => r.c.terms.map((t) => ({ r, c: r.c, t, s: termStatus(r.c, t.key) })).filter((x) => x.s !== 'trusted'));
  // ...but Legal reviews only the documented rule: a term that triggers an action AND is low-confidence or on a large contract.
  const inRule = (x: (typeof flagged)[number]) => ACTION_TERMS.includes(x.t.key) && (x.t.confidence < 0.8 || tierOf(x.c) === 'large');
  const byDeadline = (a: (typeof flagged)[number], b: (typeof flagged)[number]) => a.r.dr.decideBy.localeCompare(b.r.dr.decideBy) || a.t.confidence - b.t.confidence;
  const queue = flagged.filter(inRule).sort(byDeadline);
  const outside = flagged.filter((x) => !inRule(x)).sort(byDeadline);

  return (
    <Card
        title={`Legal review queue · ${queue.length} terms`}
        aside={
          <span className="muted sm">
            {flagged.length} flagged → {queue.length} after the rule: action terms that are low-confidence or on a large contract. Sorted by days to decide-by.
          </span>
        }
      >
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Term</th>
                <th>Why it's here</th>
                <th>Quote</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {queue.map(({ r, c, t, s }) => {
                const k = c.id + t.key;
                return (
                  <tr key={k}>
                    <td>
                      <button className="link" onClick={() => go('contract/' + c.id)}>
                        {supplierOf(c).name}
                      </button>
                      <div className="row gap">
                        <TierBadge tier={tierOf(c)} />
                        <span className="muted sm">decide by {fmt(r.dr.decideBy)}</span>
                      </div>
                    </td>
                    <td>{TERM_LABEL[t.key]}</td>
                    <td>
                      <TermStatusBadge s={s} />
                      <div className="muted sm">
                        {s === 'notFound'
                          ? '"Not found" goes to review, never into silence'
                          : s === 'unverified'
                            ? 'Quoted text does not appear in the contract'
                            : t.confidence < 0.8
                              ? `Low confidence (${Math.round(t.confidence * 100)}%) on an action term`
                              : 'Action term on a large contract'}
                      </div>
                    </td>
                    <td className="sm">{t.quote ? <q>{t.quote}</q> : '—'}</td>
                    <td>
                      {confirmed[k] ? (
                        <Badge tone="green">Verified</Badge>
                      ) : (
                        <button className="ghost sm" onClick={() => setConfirmed({ ...confirmed, [k]: true })}>
                          Verify
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {outside.length > 0 && (
          <details className="outside">
            <summary>
              {outside.length} quote problems outside the rule (not-found or not-verbatim on terms that trigger no action) — kept visible, not sent to Legal
            </summary>
            <ul>
              {outside.map(({ c, t, s }) => (
                <li key={c.id + t.key}>
                  <button className="link" onClick={() => go('contract/' + c.id)}>
                    {supplierOf(c).name}
                  </button>{' '}
                  · {TERM_LABEL[t.key]} · <TermStatusBadge s={s} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
  );
}
