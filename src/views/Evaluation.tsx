import { Badge, Card, Stat } from '../components';
import { CONTRACTS } from '../data/seed';
import { diffDays, fmt } from '../lib/dates';
import { computeDates, moneyK, quoteFound, supplierOf } from '../lib/logic';
import { SYSTEM, TERM_KEYS, termRequest } from '../lib/prompt';
import { useStore } from '../store';
import { northStar } from './Triage';

interface Check {
  id: string;
  supplier: string;
  field: string;
  got: string | null;
  want: string;
  verdict: 'exact' | 'late' | 'early';
}

function runFamilyTest(): Check[] {
  const out: Check[] = [];
  CONTRACTS.filter((c) => c.answerKey).forEach((c) => {
    const r = computeDates(c);
    const k = c.answerKey!;
    const add = (field: string, got: string | null, want: string | undefined, lateIfLater: boolean) => {
      if (!want) return;
      const verdict = got === want ? 'exact' : (lateIfLater ? got! > want : got! < want) ? 'late' : 'early';
      out.push({ id: c.id, supplier: supplierOf(c).name, field, got, want, verdict });
    };
    add('Decide-by date', r.decideBy, k.decideBy, true);
    add('Notice deadline', r.noticeDeadline, k.noticeDeadline, true);
    // For a window opening, the dangerous error is opening too EARLY (an invalid notice).
    add('Window opens', r.windowOpen, k.windowOpen, false);
  });
  return out;
}

export default function Evaluation() {
  const { rows } = useStore();
  const checks = runFamilyTest();
  const late = checks.filter((c) => c.verdict === 'late').length;
  const early = checks.filter((c) => c.verdict === 'early').length;
  const exact = checks.filter((c) => c.verdict === 'exact').length;
  const families = new Set(checks.map((c) => c.id)).size;
  const bound = (3 / families) * 100; // rule of three: 95% upper bound with zero failures

  const allTerms = CONTRACTS.flatMap((c) => c.terms.map((t) => ({ c, t })));
  const verified = allTerms.filter(({ c, t }) => quoteFound(c, t.key)).length;
  const notFound = allTerms.filter(({ t }) => !t.quote).length;
  const unverified = allTerms.length - verified - notFound;
  const ns = northStar(rows);

  return (
    <div className="stack">
      <div className="hero">
        <p className="eyebrow">Evaluation</p>
        <h1>A deadline that comes out too late costs a whole renewal. So the too-late rate is shown first.</h1>
      </div>

      <Card title="Test 2 · Deadlines across contract families" aside={<span className="muted sm">Run live in your browser against the answer key</span>}>
        <div className="stats">
          <Stat label="Too-late deadlines (dangerous)" value={late} tone={late ? 'bad' : 'good'} sub={late ? 'DecideBy is not trusted to go first' : 'Bar met: zero too-late'} />
          <Stat label="Too-early" value={early} sub="costs a few weeks of attention" />
          <Stat label="Exact" value={`${exact}/${checks.length}`} sub={`${families} synthetic families`} />
          <Stat label="95% upper bound on true too-late rate" value={`≈${bound.toFixed(0)}%`} sub={`zero failures in ${families} families only proves this much`} />
        </div>
        <div className="table-wrap">
          <table className="tbl compact">
            <thead>
              <tr>
                <th>Family</th>
                <th>Date</th>
                <th>DecideBy</th>
                <th>Answer key</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {[...checks]
                .sort((a, b) => ['late', 'early', 'exact'].indexOf(a.verdict) - ['late', 'early', 'exact'].indexOf(b.verdict))
                .map((c) => (
                  <tr key={c.id + c.field}>
                    <td>{c.supplier}</td>
                    <td>{c.field}</td>
                    <td>{fmt(c.got)}</td>
                    <td>{fmt(c.want)}</td>
                    <td>
                      {c.verdict === 'exact' ? (
                        <Badge tone="green">Exact</Badge>
                      ) : (
                        <Badge tone={c.verdict === 'late' ? 'red' : 'amber'}>
                          {c.verdict === 'late' ? 'Too late' : 'Too early'} by {Math.abs(diffDays(c.got!, c.want))}d
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="muted sm">
          The plan calls for about 40 families; this build seeds {families}, covering an amendment that moves the deadline, a notice window, fixed-term, evergreen,
          a contract renewed five times, an ambiguous "days" clause and a business-day notice period. Because even zero too-late deadlines in a small set only bounds
          the true rate, Legal keeps verifying large contracts during the pilot.
        </p>
      </Card>

      <Card title="Test 1 · Reading single contracts (CUAD)" aside={<Badge tone="amber">Not run in this build</Badge>}>
        <p>
          Planned: about 100 <a href="https://huggingface.co/datasets/theatticusproject/cuad" target="_blank" rel="noreferrer">CUAD</a> contracts labelled by lawyers (CC BY 4.0). Measures
          accuracy per term and how often "not found" was correct. The bar is reported with its margin of error: 95% on 100 contracts means the true figure is roughly
          89–98%.
        </p>
        <p className="muted sm">
          Run live on any contract record to see the model's extraction checked against the quotes.
        </p>
        <h4>Quote check across the seeded repository (live)</h4>
        <div className="stats">
          <Stat label="Terms extracted" value={allTerms.length} />
          <Stat label="Quote found verbatim" value={verified} tone="good" />
          <Stat label="Quote not in document" value={unverified} tone={unverified ? 'bad' : undefined} sub="marked unverified" />
          <Stat label="Not found" value={notFound} sub="sent to the review queue" />
        </div>
      </Card>

      <Card title="Prompt" aside={<span className="muted sm">Sent by “Re-run live” on a contract record</span>}>
        <p className="sm">
          One call per contract family to Google Gemini (the newest Flash-Lite model the key can use, falling back to other Flash models if it is busy). The reply
          must follow a strict JSON schema; every quote is then checked verbatim against the documents in code, and the dates are calculated in code, not by the
          model.
        </p>
        <h4>System instruction</h4>
        <pre className="doc prompt">{SYSTEM}</pre>
        <h4>User message</h4>
        <pre className="doc prompt">{`<document id="…" kind="signed | amendment" title="…" signed="…">\n…full text of each document in the family…\n</document>\n\n${termRequest()}`}</pre>
        <h4>Required output (JSON schema)</h4>
        <pre className="doc prompt">{`{ "terms": [ { "key": one of the ${TERM_KEYS.length} keys above,
              "value": short plain-English value,
              "quote": exact sentence from the document, or "" if not found,
              "docId": id of the document quoted, or "",
              "confidence": 0 to 1 } ] }`}</pre>
      </Card>

      <Card title="North star">
        <div className="stats">
          <Stat
            label="Share of renewal-eligible value decided before its decide-by date, with any notice sent inside the window"
            value={`${Math.round(ns.pct * 100)}%`}
            sub={`${moneyK(ns.done)} of ${moneyK(ns.total)} · ${ns.nDone} of ${ns.n} contracts due in the 90-day pilot`}
            tone="accent"
          />
        </div>
        <p className="muted sm">
          A decision only counts once its notice (if one is needed) has left inside the valid window, and missed auto-renewals always count against it. Weighted by value, so one $500k contract counts more than fifty $2k ones. Today's baseline is unknown because nobody measures it — that gap is itself a
          finding. Pilot targets: 80% of triage value by day 60; 90% of value due by day 90.
        </p>
      </Card>
    </div>
  );
}
