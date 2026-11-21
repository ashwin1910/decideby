import { Badge, Card, DaysLeft } from '../components';
import { fmt } from '../lib/dates';
import { DECISION_LABEL, supplierOf, tierOf } from '../lib/logic';
import { useStore } from '../store';
import LegalQueue from './LegalQueue';

/** What Legal sees: letters waiting for Legal's approval, then the term review queue. */
export default function LegalHome() {
  const { rows, records, now, go } = useStore();
  // Large-tier letters (and protective notices) are approved by Legal.
  const waiting = rows.filter((r) => {
    const rec = records[r.c.id];
    return rec?.letter?.status === 'drafted' && rec.decidedOn <= now && tierOf(r.c) === 'large';
  });
  return (
    <div className="stack">
      <div className="hero">
        <p className="eyebrow">Legal inbox · Avery Stone</p>
        <h1>
          {waiting.length ? (
            <>
              <span className="hl">{waiting.length} letter{waiting.length === 1 ? '' : 's'}</span> waiting for your approval.
            </>
          ) : (
            'No letters waiting for your approval.'
          )}
        </h1>
        <p className="muted">
          Legal approves notices on large contracts and verifies only the terms the rule flags. Small contracts use your standing template; mid-sized letters are
          approved by Procurement.
        </p>
      </div>

      <Card title="Letters waiting for Legal approval">
        {waiting.length ? (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Decision</th>
                  <th>Send window closes</th>
                  <th>
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((r) => {
                  const rec = records[r.c.id]!;
                  return (
                    <tr key={r.c.id}>
                      <td>
                        <b>{supplierOf(r.c).name}</b>
                        <div className="muted sm">decided {fmt(rec.decidedOn)} by {rec.decidedBy}</div>
                      </td>
                      <td>
                        {DECISION_LABEL[rec.decision]} {rec.protective && <Badge tone="amber">Protective notice</Badge>}
                      </td>
                      <td>{r.dr.noticeDeadline ? <DaysLeft date={r.dr.noticeDeadline} now={now} /> : '—'}</td>
                      <td>
                        <button type="button" className="primary sm" aria-label={`Review letter for ${supplierOf(r.c).name}`} onClick={() => go('brief/' + r.c.id)}>
                          Review letter →
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Nothing to approve. Letters appear here when an owner or Procurement decides to exit, reduce or renegotiate a large contract.</p>
        )}
      </Card>

      <LegalQueue />
    </div>
  );
}
