import { COST_CENTRES, GO_LIVE, INVOICES, PEOPLE, SUPPLIERS } from '../data/seed';
import type { Contract, Person, Supplier, Tier, TermKey } from '../data/types';
import {
  addBusinessDays,
  addDays,
  addMonths,
  diffDays,
  fmt,
  maxDate,
  minDate,
  onOrBeforeBusinessDay,
  subBusinessDaysDetail,
  type ISODate,
} from './dates';

export const BUFFER_BUSINESS_DAYS = 10;
export const LEAD_DAYS: Record<Tier, number> = { small: 30, mid: 90, large: 180 };

export const supplierOf = (c: Contract): Supplier => SUPPLIERS.find((s) => s.id === c.supplierId)!;
export const person = (id?: string): Person | undefined => PEOPLE.find((p) => p.id === id);

export function tierOf(c: Contract): Tier {
  const v = supplierOf(c).annualSpend;
  if (v > 100_000 || c.critical) return 'large';
  if (v >= 10_000) return 'mid';
  return 'small';
}

export const TIER_LABEL: Record<Tier, string> = { small: 'Small', mid: 'Mid-sized', large: 'Large' };
export const TYPE_LABEL = { auto: 'Auto-renews', window: 'Notice window', fixed: 'Fixed term', evergreen: 'Evergreen' } as const;

export const TERM_LABEL: Record<TermKey, string> = {
  parties: 'Parties',
  effective: 'Effective date',
  end: 'End date / term',
  renewal: 'Renewal term',
  notice: 'Notice period',
  tfc: 'Termination for convenience',
  priceIncrease: 'Price increases',
  minCommit: 'Minimum commitment',
  liability: 'Liability cap',
  assignment: 'Assignment & change of control',
  law: 'Governing law',
  audit: 'Audit rights',
  payment: 'Payment terms',
  noticeAddress: 'Notice address & method',
};

/** Terms that trigger an action. Legal verifies these only when low-confidence or on a large contract. */
export const ACTION_TERMS: TermKey[] = ['end', 'renewal', 'notice', 'tfc', 'priceIncrease'];

// ---------------------------------------------------------------------------
// Date engine
// ---------------------------------------------------------------------------

export interface DateResult {
  termEnd: ISODate | null;
  renewalsSoFar: number;
  noticeDeadline: ISODate | null; // legal deadline (close of send window)
  windowOpen: ISODate | null; // earliest valid send date
  decideBy: ISODate;
  missedPrior?: { deadline: ISODate; renewedOn: ISODate };
  steps: string[];
}

const fmtShort = (d: ISODate) => fmt(d).replace(/ \d{4}$/, '');
/** "(skips 25 Dec, 1 Jan)" when holidays were skipped while counting business days. */
export const skipsNote = (skipped: ISODate[]) => (skipped.length ? ` (skips ${[...skipped].sort().map(fmtShort).join(', ')})` : '');

function backNotice(end: ISODate, days: number, unit: 'calendar' | 'business' | 'ambiguous', steps: string[]): ISODate {
  if (unit === 'calendar') {
    const d = addDays(end, -days);
    steps.push(`Notice deadline = term end ${fmt(end)} − ${days} calendar days = ${fmt(d)}.`);
    return d;
  }
  if (unit === 'business') {
    const { date: d, skipped } = subBusinessDaysDetail(end, days);
    steps.push(`Notice deadline = term end ${fmt(end)} − ${days} business days${skipsNote(skipped)} = ${fmt(d)}.`);
    return d;
  }
  const cal = addDays(end, -days);
  const { date: bus, skipped } = subBusinessDaysDetail(end, days);
  const d = minDate(cal, bus);
  steps.push(
    `Wording is ambiguous ("days" vs business days). Calendar reading gives ${fmt(cal)}; business-day reading gives ${fmt(bus)}${skipsNote(skipped)}. The deadline leans early: ${fmt(d)}.`,
  );
  return d;
}

export function computeDates(c: Contract, today: ISODate = GO_LIVE): DateResult {
  const d = c.dates;
  const steps: string[] = [];
  const tier = tierOf(c);

  if (d.type === 'fixed') {
    const end = d.fixedEnd!;
    const raw = addDays(end, -LEAD_DAYS[tier]);
    const decideBy = onOrBeforeBusinessDay(raw);
    steps.push(`Fixed term ends on ${fmt(end)}; no notice is needed.`);
    steps.push(`Decide-by = end date − ${TIER_LABEL[tier].toLowerCase()}-tier lead time (${LEAD_DAYS[tier]} days) = ${fmt(raw)}.`);
    if (decideBy !== raw) steps.push(`${fmt(raw)} is not a business day, so decide-by moves back to ${fmt(decideBy)}.`);
    return { termEnd: end, renewalsSoFar: 0, noticeDeadline: null, windowOpen: null, decideBy, steps };
  }

  if (d.type === 'evergreen') {
    let review = d.effective;
    let years = 0;
    while (review <= today) {
      years++;
      review = addMonths(d.effective, 12 * years);
    }
    steps.push(`Evergreen from ${fmt(d.effective)}: no deadline, so a review date is set on each anniversary.`);
    const decideBy = onOrBeforeBusinessDay(review);
    steps.push(`Next anniversary after ${fmt(today)} = ${fmt(review)} → decide-by.`);
    if (decideBy !== review) steps.push(`${fmt(review)} is not a business day, so decide-by moves back to ${fmt(decideBy)}.`);
    steps.push(`Notice may be sent any time; ${d.noticeDays} days' notice sets the end date.`);
    return { termEnd: null, renewalsSoFar: years - 1, noticeDeadline: null, windowOpen: null, decideBy, steps };
  }

  // auto or window: roll the term forward
  let end = addMonths(d.effective, d.initialTermMonths!);
  let renewals = 0;
  steps.push(`Effective ${fmt(d.effective)}; initial term ${d.initialTermMonths} months → first term ends ${fmt(end)}.`);
  let noticeDays = d.noticeDays;
  if (d.amendment?.termEnd) {
    // roll the original terms up to the amendment, then apply it
    while (end <= d.amendment.signedOn) {
      end = addMonths(end, d.renewalTermMonths!);
      renewals++;
    }
    if (renewals) steps.push(`Rolled forward ${renewals} renewal term(s) before the amendment signed ${fmt(d.amendment.signedOn)}.`);
    end = d.amendment.termEnd;
    steps.push(`Amendment signed ${fmt(d.amendment.signedOn)} sets the current term end to ${fmt(end)}.`);
  }
  if (d.amendment?.noticeDays) {
    noticeDays = d.amendment.noticeDays;
    steps.push(`Amendment changes the notice period from ${d.noticeDays} to ${noticeDays} days.`);
  }

  const deadlineFor = (e: ISODate, s: string[]) =>
    d.type === 'window' ? addDays(e, -d.windowCloseDays!) : backNotice(e, noticeDays!, d.noticeUnit, s);

  const before = renewals;
  while (end <= today) {
    end = addMonths(end, d.renewalTermMonths!);
    renewals++;
  }
  if (renewals > before) steps.push(`Rolled forward ${renewals - before} renewal term(s) of ${d.renewalTermMonths} months → current term ends ${fmt(end)}.`);

  let missedPrior: DateResult['missedPrior'];
  const scratch: string[] = [];
  if (deadlineFor(end, scratch) < today) {
    missedPrior = { deadline: deadlineFor(end, []), renewedOn: end };
    steps.push(`The notice deadline for this term (${fmt(missedPrior.deadline)}) has already passed: it renews on ${fmt(end)}. Working on the next term.`);
    end = addMonths(end, d.renewalTermMonths!);
    renewals++;
  }

  let noticeDeadline: ISODate;
  let windowOpen: ISODate;
  if (d.type === 'window') {
    noticeDeadline = addDays(end, -d.windowCloseDays!);
    windowOpen = addDays(end, -d.windowOpenDays!);
    steps.push(`Window opens ${d.windowOpenDays} days before ${fmt(end)} = ${fmt(windowOpen)} (leans late, so a notice is never sent too early).`);
    steps.push(`Window closes ${d.windowCloseDays} days before ${fmt(end)} = ${fmt(noticeDeadline)} (leans early).`);
  } else {
    noticeDeadline = deadlineFor(end, steps);
    windowOpen = today;
    steps.push('Notice may be sent any time before the deadline.');
  }
  const { date: decideBy, skipped } = subBusinessDaysDetail(noticeDeadline, BUFFER_BUSINESS_DAYS);
  steps.push(
    `Decide-by = notice deadline − ${BUFFER_BUSINESS_DAYS} business days (approval and delivery buffer)${skipsNote(skipped)} = ${fmt(decideBy)}.`,
  );
  return { termEnd: end, renewalsSoFar: renewals, noticeDeadline, windowOpen: maxDate(windowOpen, GO_LIVE), decideBy, missedPrior, steps };
}

// ---------------------------------------------------------------------------
// Owner assignment
// ---------------------------------------------------------------------------

export interface OwnerResult {
  owner: Person;
  costCentre: string;
  approver: Person;
  manager?: Person;
  reason: string[];
}

export function spendByCC(supplierId: string, since?: ISODate) {
  const m = new Map<string, number>();
  INVOICES.filter((i) => i.supplierId === supplierId && (!since || i.date >= since)).forEach((i) => m.set(i.costCentre, (m.get(i.costCentre) ?? 0) + i.amount));
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function assignOwner(c: Contract): OwnerResult {
  const s = supplierOf(c);
  const split = spendByCC(s.id);
  const total = split.reduce((a, [, v]) => a + v, 0);
  const reason: string[] = [];
  let [ccId, top] = split[0];
  const share = top / total;
  reason.push(`Spend by cost centre (12 months of invoices): ${split.map(([cc, v]) => `${cc} ${Math.round((v / total) * 100)}%`).join(', ')}.`);
  if (split.length > 1 && share < 0.4) {
    reason.push(`Shared tool: no cost centre has 40% or more, so it goes to the largest cost centre (${ccId}).`);
  } else {
    reason.push(`${ccId} books the most spend (${Math.round(share * 100)}%).`);
  }
  let cc = COST_CENTRES.find((x) => x.id === ccId)!;
  const approver = person(cc.approverId)!;
  let owner = person(cc.ownerId);
  let manager = owner ? person(owner.managerId) : undefined;
  if (owner) {
    reason.push(`Budget owner of ${cc.id} ${cc.name}: ${owner.name}.`);
  } else {
    owner = person(approver.managerId);
    manager = owner ? person(owner.managerId) : undefined;
    reason.push(`${cc.id} ${cc.name} has no cost-centre owner on record → falls to the invoice approver's manager.`);
    if (!owner) {
      owner = person('p-proc')!;
      reason.push('No manager on record → falls to Procurement.');
    } else reason.push(`Approver ${approver.name}'s manager: ${owner.name}.`);
  }
  reason.push(`Invoice approver ${approver.name} is consulted with three questions.`);
  return { owner: owner!, costCentre: cc.id, approver, manager, reason };
}

// ---------------------------------------------------------------------------
// Schedule & status
// ---------------------------------------------------------------------------

export interface Milestone {
  key: 'brief' | 'reminder' | 'escalate' | 'takeover' | 'decideBy';
  label: string;
  date: ISODate;
}

export interface Schedule {
  triage: boolean;
  milestones: Milestone[];
}

export function scheduleOf(c: Contract, dr: DateResult): Schedule {
  const tier = tierOf(c);
  const normalBrief = addDays(dr.decideBy, -LEAD_DAYS[tier]);
  if (normalBrief < GO_LIVE) {
    const ms: Milestone[] = [{ key: 'brief', label: 'Brief sent (day 0)', date: GO_LIVE }];
    if (tier !== 'small') ms.push({ key: 'escalate', label: 'Manager escalation (3 business days)', date: addBusinessDays(GO_LIVE, 3) });
    ms.push({ key: 'takeover', label: 'Procurement takes over (5 business days)', date: addBusinessDays(GO_LIVE, 5) });
    ms.push({ key: 'decideBy', label: 'Decide-by date', date: dr.decideBy });
    return { triage: true, milestones: ms };
  }
  const ms: Milestone[] = [{ key: 'brief', label: `Brief sent (${LEAD_DAYS[tier]} days before)`, date: normalBrief }];
  if (tier === 'small') ms.push({ key: 'reminder', label: 'One reminder (15 days before)', date: addDays(dr.decideBy, -15) });
  if (tier === 'mid') ms.push({ key: 'escalate', label: 'Manager escalation (60 days before)', date: addDays(dr.decideBy, -60) });
  if (tier === 'large') ms.push({ key: 'escalate', label: 'Manager escalation (120 days before)', date: addDays(dr.decideBy, -120) });
  const tk = { small: 7, mid: 30, large: 90 }[tier];
  ms.push({ key: 'takeover', label: `Procurement takes over (${tk} days before${tier === 'large' ? ', with Legal' : ''})`, date: addDays(dr.decideBy, -tk) });
  ms.push({ key: 'decideBy', label: 'Decide-by date', date: dr.decideBy });
  return { triage: false, milestones: ms };
}

export type Stage = 'scheduled' | 'brief' | 'reminder' | 'escalated' | 'takeover' | 'overdue' | 'decided' | 'missed';

export const STAGE_LABEL: Record<Stage, string> = {
  scheduled: 'Scheduled',
  brief: 'Brief with owner',
  reminder: 'Reminder sent',
  escalated: 'Escalated to manager',
  takeover: 'Procurement took over',
  overdue: 'Past decide-by',
  decided: 'Decided',
  missed: 'Auto-renewed (missed)',
};

/** What stageAt needs to know about a recorded decision, as of the simulated date. */
export interface StageDecision {
  decision: Decision;
  decidedOn: ISODate;
  /** date a valid notice left (email sent / letter dispatched), if it has */
  sentOn?: ISODate;
}

/** True when the notice deadline (or window close) has passed without a valid notice or a timely decision to renew. */
export function isMissed(dr: DateResult, now: ISODate, d?: StageDecision): boolean {
  if (!dr.noticeDeadline || now <= dr.noticeDeadline) return false;
  if (!d || d.decidedOn > dr.noticeDeadline) return true;
  if (d.decision === 'renew') return false;
  return !(d.sentOn && d.sentOn <= dr.noticeDeadline);
}

export function stageAt(sch: Schedule, dr: DateResult, now: ISODate, d?: StageDecision): Stage {
  if (isMissed(dr, now, d)) return 'missed';
  if (d) return 'decided';
  if (now > dr.decideBy) return 'overdue';
  // latest escalation step already reached, by date (not by list order)
  const rank: Record<Milestone['key'], number> = { brief: 1, reminder: 2, escalate: 3, takeover: 4, decideBy: 0 };
  const reached = sch.milestones.filter((m) => m.key !== 'decideBy' && m.date <= now).sort((a, b) => rank[b.key] - rank[a.key])[0];
  if (!reached) return 'scheduled';
  return ({ brief: 'brief', reminder: 'reminder', escalate: 'escalated', takeover: 'takeover' } as const)[reached.key as Exclude<Milestone['key'], 'decideBy'>];
}

// ---------------------------------------------------------------------------
// Brief: price if renewed, rate check, recommendation
// ---------------------------------------------------------------------------

export function last12Spend(c: Contract) {
  return INVOICES.filter((i) => i.supplierId === c.supplierId).reduce((a, i) => a + i.amount, 0);
}

export interface RateFinding {
  invoiceId: string;
  date: ISODate;
  item: string;
  qty: number;
  billed: number;
  contract: number;
  overcharge: number;
  note: string;
}

export function rateCheck(c: Contract): { checked: number; findings: RateFinding[]; total: number } {
  if (!c.rateCard) return { checked: 0, findings: [], total: 0 };
  const inv = INVOICES.filter((i) => i.supplierId === c.supplierId && i.lines);
  const findings: RateFinding[] = [];
  inv.forEach((i) =>
    i.lines!.forEach((l) => {
      const rc = c.rateCard!.find((r) => r.item === l.item);
      if (!rc) return;
      const inForce = rc.increaseEffective && i.date >= rc.increaseEffective ? Math.round(rc.rate * (1 + (rc.increasePct ?? 0) / 100) * 100) / 100 : rc.rate;
      if (l.rate > inForce + 0.001) {
        findings.push({
          invoiceId: i.id,
          date: i.date,
          item: l.item,
          qty: l.qty,
          billed: l.rate,
          contract: inForce,
          overcharge: Math.round((l.rate - inForce) * l.qty * 100) / 100,
          note: rc.increaseEffective && i.date < rc.increaseEffective ? `Increase billed before its effective date (${fmt(rc.increaseEffective)})` : 'Billed above the rate card',
        });
      }
    }),
  );
  return { checked: inv.length, findings, total: Math.round(findings.reduce((a, f) => a + f.overcharge, 0)) };
}

export type Decision = 'renew' | 'renegotiate' | 'reduce' | 'exit' | 'midterm' | 'nextcycle';

export const DECISION_LABEL: Record<Decision, string> = {
  renew: 'Renew',
  renegotiate: 'Renegotiate',
  reduce: 'Reduce',
  exit: 'Exit',
  midterm: 'Renewed: negotiate mid-term',
  nextcycle: 'Set next-cycle reminder',
};

export function recommend(c: Contract): { action: Decision; reasons: string[] } {
  const a = c.approverAnswers;
  const reasons: string[] = [];
  const rc = rateCheck(c);
  if (a?.stillUsed === 'no' || a?.wouldMiss === 'no') {
    if (a.stillUsed === 'no') reasons.push('Approver says the supplier is no longer used.');
    if (a.wouldMiss === 'no') reasons.push('Approver would not miss it.');
    if (a.note) reasons.push(`Approver: “${a.note}”`);
    return { action: 'exit', reasons };
  }
  if (a?.stillUsed === 'partly') {
    reasons.push('Approver says it is only partly used.');
    if (a.note) reasons.push(`Approver: “${a.note}”`);
    return { action: 'reduce', reasons };
  }
  if (a?.note && /seats? paid.*active/.test(a.note)) {
    reasons.push(`Usage below what is paid for: ${a.note}`);
    return { action: 'reduce', reasons };
  }
  if (rc.findings.length) reasons.push(`Rate check: ${money(rc.total)} billed above the contract (${rc.findings.length} invoice lines) — leverage.`);
  if (c.priceIncreasePct >= 4) reasons.push(`Price increase clause allows +${c.priceIncreasePct}% on renewal.`);
  if (a?.performance === 'mixed' || a?.performance === 'poor') reasons.push(`Performance reported as ${a.performance}${a.note ? `: “${a.note}”` : ''}`);
  if (c.serviceCredit?.claimable) reasons.push(`Service credit may be claimable (${c.serviceCredit.claimable}).`);
  if (reasons.length) return { action: 'renegotiate', reasons };
  reasons.push('Still used, performing well, and no price increase above 4%.');
  return { action: 'renew', reasons };
}

export const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const moneyK = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`);

// ---------------------------------------------------------------------------
// Verification & quote check
// ---------------------------------------------------------------------------

export function quoteFound(c: Contract, k: TermKey): boolean {
  const t = c.terms.find((x) => x.key === k)!;
  if (!t.quote) return false;
  const doc = c.docs.find((d) => d.id === t.docId);
  return !!doc && doc.text.includes(t.quote);
}

export type TermStatus = 'trusted' | 'verify' | 'unverified' | 'notFound';

export function termStatus(c: Contract, k: TermKey): TermStatus {
  const t = c.terms.find((x) => x.key === k)!;
  if (!t.quote) return 'notFound';
  if (!quoteFound(c, k)) return 'unverified';
  if (ACTION_TERMS.includes(k) && (t.confidence < 0.8 || tierOf(c) === 'large')) return 'verify';
  return 'trusted';
}

export const daysLeft = (d: ISODate, now: ISODate) => diffDays(d, now);
