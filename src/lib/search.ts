// Plain-language search parsed into filters over the extracted terms.
// Every word of the question is either mapped to a filter, recognised as filler,
// or reported back as "couldn't interpret" — the list is never presented as a
// full answer when part of the question was ignored.
import { PEOPLE, SUPPLIERS } from '../data/seed';
import type { Contract, Person, TermKey } from '../data/types';
import { diffDays, type ISODate } from './dates';
import { moneyK, supplierOf, type DateResult } from './logic';

export interface SearchRow {
  c: Contract;
  dr: DateResult;
  owner: Person;
}

export interface SearchFilter {
  label: string;
  /** Filters in the same group are OR-ed (e.g. two suppliers); groups are AND-ed. */
  group: string;
  test: (r: SearchRow) => boolean;
  cite: TermKey;
}

export interface ParsedQuery {
  filters: SearchFilter[];
  unparsed: string[];
  show: { owner: boolean; due: boolean };
}

const STOP = new Set(
  (
    'which what who whom whose where show list find give get me us our we i my you the a an all any every are is be been there that those these ' +
    'with have has having of in on for and or to by contracts contract suppliers supplier vendors vendor agreements agreement it its do does did ' +
    'can could will would should please from at as how many much about still currently company terms term clause clauses one ones them they their ' +
    'whom need needs us? anything something'
  ).split(' '),
);

const NEGATION = /\b(?:not|cannot|can't|cant|can not|without|no|unable to|don't|doesn't|isn't|aren't|never)\b(?:\s+[\w']+){0,3}\s*$/;

const CATEGORY_WORDS: Record<string, string> = {
  staffing: 'Staffing', logistics: 'Logistics', freight: 'Logistics', shipping: 'Logistics', software: 'Software', saas: 'Software',
  facilities: 'Facilities', consulting: 'Consulting', marketing: 'Marketing',
};

const KEYWORDS = new Set(['evergreen', 'summit', 'signal', 'pulse', 'vector', 'prism', 'granite', 'cardinal']);
const TRAILING = /\s+(lines|co\.?|inc\.?|solutions|services|service|partners|group|agency|advisors|advisory|studio|company|llc)$/;

function supplierAliases() {
  const firstCount = new Map<string, number>();
  SUPPLIERS.forEach((s) => {
    const f = s.name.toLowerCase().split(/\s+/)[0];
    firstCount.set(f, (firstCount.get(f) ?? 0) + 1);
  });
  const out: { alias: string; id: string; name: string }[] = [];
  SUPPLIERS.forEach((s) => {
    const full = s.name.toLowerCase().replace(/[.,]/g, '');
    const set = new Set([full, full.replace(TRAILING, '')]);
    const first = full.split(/\s+/)[0].replace(/&/g, '');
    if (firstCount.get(first) === 1 && first.length >= 5 && !KEYWORDS.has(first) && !CATEGORY_WORDS[first]) set.add(first);
    set.forEach((a) => a.length >= 4 && out.push({ alias: a, id: s.id, name: s.name }));
  });
  return out.sort((a, b) => b.alias.length - a.alias.length);
}
const ALIASES = supplierAliases();

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&');

export function parseQuery(q: string, now: ISODate): ParsedQuery {
  const s = q.toLowerCase().replace(/[’‘]/g, "'");
  const used = new Array<boolean>(s.length).fill(false);
  const filters: SearchFilter[] = [];
  const show = { owner: false, due: false };

  const free = (i: number, j: number) => used.slice(i, j).every((u) => !u);
  const take = (i: number, j: number) => {
    for (let k = i; k < j; k++) used[k] = true;
  };
  /** All non-overlapping matches of re that don't touch text already consumed. */
  const matchAll = (re: RegExp) => {
    const g = new RegExp(re.source, 'g');
    const out: RegExpExecArray[] = [];
    let m: RegExpExecArray | null;
    while ((m = g.exec(s))) {
      if (!m[0]) {
        g.lastIndex++;
        continue;
      }
      if (free(m.index, m.index + m[0].length)) {
        take(m.index, m.index + m[0].length);
        out.push(m);
      }
    }
    return out;
  };
  const first = (re: RegExp) => matchAll(re)[0] ?? null;
  /** Is the match preceded (within a few words) by a negation? Consumes the negation if so. */
  const negated = (m: RegExpExecArray) => {
    const start = Math.max(0, m.index - 40);
    const before = s.slice(start, m.index);
    const n = NEGATION.exec(before);
    if (!n) return false;
    const negWord = /\b(?:not|cannot|can't|cant|can not|without|no|unable to|don't|doesn't|isn't|aren't|never)\b/.exec(before.slice(n.index))!;
    const i = start + n.index + negWord.index;
    take(i, i + negWord[0].length);
    return true;
  };
  const add = (f: SearchFilter) => filters.push(f);

  // --- notice deadline within N days -------------------------------------
  const next = first(/(?:\b(?:with\s+)?(?:a\s+)?(?:notice\s+)?(?:deadlines?|due)\s+)?\b(?:in|within)\s+(?:the\s+)?next\s+(\d+)\s+days\b|\bnext\s+(\d+)\s+days\b/);
  if (next) {
    const n = Number(next[1] ?? next[2]);
    show.due = true;
    add({
      label: `Notice deadline within ${n} days`,
      group: 'next',
      test: (r) => !!r.dr.noticeDeadline && diffDays(r.dr.noticeDeadline, now) >= 0 && diffDays(r.dr.noticeDeadline, now) <= n,
      cite: 'notice',
    });
  }

  // --- answer cues -------------------------------------------------------
  if (matchAll(/\bwho\s+(?:owns|decides|is responsible for)|\bowner(?:s|ship)?\b|\bowned by\b/).length) show.owner = true;
  if (matchAll(/\bwhen\s+(?:is|are|does)\s+(?:it|they|this|that)?\s*(?:due|renew\w*|expire\w*)|\bwhen\b|\bdue(?:\s+date)?\b|\bdeadlines?\b/).length) show.due = true;

  // --- supplier names (longest alias first) ------------------------------
  ALIASES.forEach(({ alias, id, name }) => {
    if (first(new RegExp(`\\b${esc(alias)}\\b`)) && !filters.some((f) => f.label === `Supplier: ${name}`))
      add({ label: `Supplier: ${name}`, group: 'supplier', test: (r) => r.c.supplierId === id, cite: 'parties' });
  });

  // --- owner names -------------------------------------------------------
  PEOPLE.forEach((p) => {
    const full = p.name.toLowerCase();
    const firstName = full.split(' ')[0];
    if (first(new RegExp(`\\b(?:${esc(full)}|${esc(firstName)})(?:'s)?\\b`)))
      add({ label: `Owner: ${p.name}`, group: 'owner', test: (r) => r.owner.id === p.id, cite: 'parties' });
  });

  // --- categories --------------------------------------------------------
  matchAll(/\b(staffing|logistics|freight|shipping|software|saas|facilities|consulting|marketing)\b/).forEach((m) => {
    const cat = CATEGORY_WORDS[m[1]];
    const neg = negated(m);
    if (!filters.some((f) => f.label.endsWith(`category ${cat}`)))
      add({ label: `${neg ? 'Not ' : ''}category ${cat}`, group: neg ? `notcat-${cat}` : 'category', test: (r) => (supplierOf(r.c).category === cat) !== neg, cite: 'parties' });
  });

  // --- uncapped liability (before plain "liability") ---------------------
  const unc = first(/\b(?:uncapped|unlimited)\s+liability\b|\bliability\s+(?:is\s+|that is\s+)?(?:uncapped|unlimited|not capped)\b|\b(?:no|without(?: a)?)\s+(?:liability\s+)?cap\b|\bnot capped\b|\buncapped\b/);
  if (unc)
    add({ label: 'Liability uncapped', group: 'liability', test: (r) => /unlimited|uncapped|no cap/i.test(r.c.terms.find((t) => t.key === 'liability')!.value), cite: 'liability' });

  // --- contract type -----------------------------------------------------
  const auto = first(/\bauto[- ]?renew\w*/);
  if (auto) {
    const neg = negated(auto);
    add({ label: neg ? 'Does not auto-renew' : 'Auto-renewing', group: 'autorenew', test: (r) => (r.c.dates.type === 'auto' || r.c.dates.type === 'window') !== neg, cite: 'renewal' });
  }
  if (first(/\bevergreen\b/)) add({ label: 'Evergreen', group: 'type', test: (r) => r.c.dates.type === 'evergreen', cite: 'renewal' });
  if (first(/\bfixed[- ]term\b/)) add({ label: 'Fixed term', group: 'type', test: (r) => r.c.dates.type === 'fixed', cite: 'end' });
  if (first(/\bnotice windows?\b/)) add({ label: 'Notice window', group: 'type', test: (r) => r.c.dates.type === 'window', cite: 'notice' });

  // --- value -------------------------------------------------------------
  const amount = (m: RegExpExecArray) => Number(m[1].replace(/,/g, '')) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1);
  const over = first(/\b(?:over|above|more than|greater than)\s*\$?(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b|>\s*\$?(\d[\d,]*)\s*(k|m)?/);
  if (over) {
    const v = amount(over);
    add({ label: `Annual value > ${moneyK(v)}`, group: 'over', test: (r) => supplierOf(r.c).annualSpend > v, cite: 'parties' });
  }
  const under = first(/\b(?:under|below|less than)\s*\$?(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b/);
  if (under) {
    const v = amount(under);
    add({ label: `Annual value < ${moneyK(v)}`, group: 'under', test: (r) => supplierOf(r.c).annualSpend < v, cite: 'parties' });
  }

  // --- termination for convenience ---------------------------------------
  const tfc = first(/\b(?:(?:terminat\w*|exit|cancel\w*|end)\s+(?:it\s+|them\s+|the contract\s+)?)?for\s+convenience\b|\bconvenience\b/);
  if (tfc) {
    const neg = negated(tfc);
    const days = first(/\b(?:on|with|upon|giving)?\s*(\d+)\s*days?'?\s*(?:'s)?\s*(?:written\s+)?notice\b/);
    const max = days ? Number(days[1]) : null;
    add(
      neg
        ? { label: 'No termination for convenience', group: 'tfc', test: (r) => r.c.tfcDays == null, cite: 'tfc' }
        : {
            label: max ? `Termination for convenience on ≤ ${max} days' notice` : 'Termination for convenience allowed',
            group: 'tfc',
            test: (r) => r.c.tfcDays != null && (max == null || r.c.tfcDays <= max),
            cite: 'tfc',
          },
    );
  }

  // --- other clauses -----------------------------------------------------
  const inc = first(/\bprice\s+(?:increase|rise|escalation)s?\b|\bincreases?\b/);
  if (inc) {
    const neg = negated(inc);
    add({ label: neg ? 'No price increase clause' : 'Price increase clause', group: 'inc', test: (r) => (r.c.priceIncreasePct > 0) !== neg, cite: 'priceIncrease' });
  }
  const audit = first(/\baudit(?:\s+rights?)?\b/);
  if (audit) {
    const neg = negated(audit);
    add({ label: neg ? 'No audit rights' : 'Has audit rights', group: 'audit', test: (r) => !!r.c.terms.find((t) => t.key === 'audit')?.quote !== neg, cite: 'audit' });
  }
  const min = first(/\bminimum(?:\s+(?:purchase|spend|annual spend))?(?:\s+commitments?)?\b|\bcommitments?\b/);
  if (min) {
    const neg = negated(min);
    add({ label: neg ? 'No minimum commitment' : 'Minimum commitment', group: 'min', test: (r) => r.c.terms.find((t) => t.key === 'minCommit')!.value.startsWith('$') !== neg, cite: 'minCommit' });
  }
  const law = first(/\b(?:governed\s+by\s+)?(?:the\s+)?(?:governing\s+)?laws?\s+(?:of\s+)?(?:the\s+state\s+of\s+)?(new york|delaware|california|texas|illinois|ohio|indiana|new jersey|washington|massachusetts)\b/);
  if (law) add({ label: `Governing law: ${law[1].replace(/\b\w/g, (x) => x.toUpperCase())}`, group: 'law', test: (r) => r.c.terms.find((t) => t.key === 'law')!.value.toLowerCase() === law[1], cite: 'law' });
  if (!unc && first(/\bliability(?:\s+caps?)?\b|\bcapped\b/)) add({ label: 'Show liability cap', group: 'show-liability', test: () => true, cite: 'liability' });
  const crit = first(/\b(?:business[- ])?critical\b/);
  if (crit) {
    const neg = negated(crit);
    add({ label: neg ? 'Not business-critical' : 'Business-critical', group: 'critical', test: (r) => r.c.critical !== neg, cite: 'parties' });
  }

  // --- leftovers ---------------------------------------------------------
  const unparsed: string[] = [];
  let phrase: string[] = [];
  const flush = () => {
    if (phrase.length) unparsed.push(phrase.join(' '));
    phrase = [];
  };
  const word = /[a-z0-9$][a-z0-9$'.,-]*/g;
  let m: RegExpExecArray | null;
  let lastEnd = 0;
  while ((m = word.exec(s))) {
    const w = m[0].replace(/[.,?!]+$/, '');
    const consumed = !free(m.index, m.index + m[0].length) && used.slice(m.index, m.index + w.length).every(Boolean);
    const gap = s.slice(lastEnd, m.index);
    if (/[?!.;]/.test(gap)) flush();
    if (consumed || STOP.has(w) || !w) flush();
    else phrase.push(w);
    lastEnd = m.index + m[0].length;
  }
  flush();
  return { filters, unparsed, show };
}

/** Rows matching every filter group (OR within a group). */
export function runQuery<T extends SearchRow>(p: ParsedQuery, rows: T[]): T[] {
  if (!p.filters.length) return p.unparsed.length || !(p.show.owner || p.show.due) ? [] : rows;
  const groups = new Map<string, SearchFilter[]>();
  p.filters.forEach((f) => groups.set(f.group, [...(groups.get(f.group) ?? []), f]));
  return rows.filter((r) => [...groups.values()].every((g) => g.some((f) => f.test(r))));
}
