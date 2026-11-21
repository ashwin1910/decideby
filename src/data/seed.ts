// Seeded company for the prototype. Everything here is synthetic.
// The nine contract "families" carry an answer key (hand-computed correct dates)
// that the evaluation page checks the date engine against. Keys were corrected
// in the review pass to skip company holidays (data/holidays.ts) when counting
// business days.

import { addDays, addMonths, fmt, type ISODate } from '../lib/dates';
import type {
  ApproverAnswers,
  Category,
  Contract,
  CostCentre,
  DateTerms,
  Doc,
  Invoice,
  Person,
  RateLine,
  Supplier,
  Term,
  TermKey,
} from './types';

/** Go-live day of the pilot. Fixed so the demo is reproducible. */
export const GO_LIVE: ISODate = '2026-11-23';
export const COMPANY = 'Halden Group, Inc.';

export const PEOPLE: Person[] = [
  { id: 'p-coo', name: 'Lee Whitman', title: 'COO' },
  { id: 'p-cto', name: 'Rina Cho', title: 'CTO' },
  { id: 'p-cmo', name: 'Jordan Blake', title: 'CMO' },
  { id: 'p-cfo', name: 'Taylor Brooks', title: 'CFO' },
  { id: 'p-cro', name: 'Quinn Adeyemi', title: 'CRO' },
  { id: 'p-ops', name: 'Dana Okafor', title: 'Director, Operations', managerId: 'p-coo' },
  { id: 'p-eng', name: 'Sam Patel', title: 'VP Engineering', managerId: 'p-cto' },
  { id: 'p-mkt', name: 'Alex Moreno', title: 'Director, Marketing', managerId: 'p-cmo' },
  { id: 'p-fac', name: 'Chris Lindqvist', title: 'Facilities Manager', managerId: 'p-coo' },
  { id: 'p-fin', name: 'Morgan Hale', title: 'Controller', managerId: 'p-cfo' },
  { id: 'p-it', name: 'Robin Asante', title: 'Head of IT', managerId: 'p-cto' },
  { id: 'p-ap1', name: 'Jamie Ruiz', title: 'Warehouse Supervisor', managerId: 'p-ops' },
  { id: 'p-ap2', name: 'Kai Mendes', title: 'Engineering Manager', managerId: 'p-eng' },
  { id: 'p-ap3', name: 'Sasha Novak', title: 'Marketing Ops Lead', managerId: 'p-mkt' },
  { id: 'p-ap4', name: 'Drew Kimura', title: 'Office Coordinator', managerId: 'p-fac' },
  { id: 'p-ap5', name: 'Pat Oduya', title: 'AP Specialist', managerId: 'p-fin' },
  { id: 'p-ap6', name: 'Riley Fox', title: 'IT Admin', managerId: 'p-it' },
  { id: 'p-ap7', name: 'Ellis Grant', title: 'Sales Ops Analyst', managerId: 'p-cro' },
  { id: 'p-proc', name: 'Casey Ng', title: 'Head of Procurement' },
  { id: 'p-legal', name: 'Avery Stone', title: 'Senior Counsel' },
];

export const COST_CENTRES: CostCentre[] = [
  { id: 'CC-100', name: 'Operations', ownerId: 'p-ops', approverId: 'p-ap1' },
  { id: 'CC-200', name: 'Engineering', ownerId: 'p-eng', approverId: 'p-ap2' },
  { id: 'CC-300', name: 'Marketing', ownerId: 'p-mkt', approverId: 'p-ap3' },
  { id: 'CC-400', name: 'Facilities', ownerId: 'p-fac', approverId: 'p-ap4' },
  { id: 'CC-500', name: 'Finance', ownerId: 'p-fin', approverId: 'p-ap5' },
  { id: 'CC-600', name: 'IT', ownerId: 'p-it', approverId: 'p-ap6' },
  // Owner role vacant: exercises the fallback to the approver's manager.
  { id: 'CC-700', name: 'Sales', approverId: 'p-ap7' },
];

// ---------------------------------------------------------------------------
// Clause builder: document text is assembled from clauses, and every term's
// quote is taken from that text, so the quote check is real.
// ---------------------------------------------------------------------------

const WORDS: Record<number, string> = {
  5: 'five', 10: 'ten', 12: 'twelve', 15: 'fifteen', 24: 'twenty-four', 30: 'thirty', 36: 'thirty-six',
  45: 'forty-five', 60: 'sixty', 90: 'ninety', 120: 'one hundred twenty', 180: 'one hundred eighty',
};
const w = (n: number) => (WORDS[n] ? `${WORDS[n]} (${n})` : `${n}`);
const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const longDate = (d: ISODate) => {
  const [y, m, day] = d.split('-').map(Number);
  const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${M[m - 1]} ${day}, ${y}`;
};

interface Spec {
  id: string;
  supplier: Omit<Supplier, 'id' | 'status'> & { status?: Supplier['status'] };
  title?: string;
  dates: DateTerms;
  tfcDays: number | null;
  priceIncreasePct: number;
  critical?: boolean;
  liability: string;
  law: string;
  minCommit?: number;
  audit: boolean;
  noticeAddress: string;
  rateCard?: RateLine[];
  serviceCredit?: { clause: string; claimable?: string; amount?: number };
  approverAnswers?: ApproverAnswers;
  answerKey?: Contract['answerKey'];
  extraDocs?: Doc[];
  amendmentText?: string[];
  lowConf?: TermKey[];
  paraphrase?: TermKey;
  notFound?: TermKey[];
  renewOnNewTerms?: boolean;
}

function build(spec: Spec): { contract: Contract; supplier: Supplier } {
  const sid = `s-${spec.id}`;
  const name = spec.supplier.name;
  const d = spec.dates;
  const docId = `${spec.id}-msa`;
  const clauses: Partial<Record<TermKey, string>> = {};

  clauses.parties = `This Master Services Agreement is made between ${COMPANY} ("Customer") and ${name} ("Supplier").`;
  clauses.effective = `This Agreement is effective as of ${longDate(d.effective)} (the "Effective Date").`;
  const unit = d.noticeUnit === 'business' ? 'business days' : 'days';
  if (d.type === 'auto') {
    clauses.end = `The initial term of this Agreement is ${w(d.initialTermMonths!)} months from the Effective Date.`;
    clauses.renewal = `Thereafter this Agreement shall automatically renew for successive ${w(d.renewalTermMonths!)} month renewal terms unless either party gives written notice of non-renewal at least ${w(d.noticeDays!)} ${unit} prior to the end of the then-current term.`;
    clauses.notice = clauses.renewal;
  } else if (d.type === 'window') {
    clauses.end = `The initial term of this Agreement is ${w(d.initialTermMonths!)} months from the Effective Date.`;
    clauses.renewal = `This Agreement shall renew automatically for successive ${w(d.renewalTermMonths!)} month terms unless Customer delivers written notice of non-renewal no earlier than ${w(d.windowOpenDays!)} days and no later than ${w(d.windowCloseDays!)} days before the end of the then-current term.`;
    clauses.notice = clauses.renewal;
  } else if (d.type === 'fixed') {
    clauses.end = `This Agreement shall commence on the Effective Date and expire on ${longDate(d.fixedEnd!)}.`;
    clauses.renewal = 'This Agreement shall not renew automatically; any extension requires a written agreement signed by both parties.';
    clauses.notice = clauses.renewal;
  } else {
    clauses.end = `This Agreement shall continue in force until terminated by either party upon ${w(d.noticeDays!)} days' prior written notice.`;
    clauses.renewal = clauses.end;
    clauses.notice = clauses.end;
  }
  clauses.tfc =
    spec.tfcDays != null
      ? `Customer may terminate this Agreement for convenience upon ${w(spec.tfcDays)} days' written notice to Supplier.`
      : 'Neither party may terminate this Agreement for convenience.';
  clauses.priceIncrease =
    spec.priceIncreasePct > 0
      ? `Supplier may increase fees upon renewal by no more than ${spec.priceIncreasePct}% per renewal term, on sixty (60) days' prior written notice.`
      : 'Fees are fixed for the term of this Agreement and any renewal term.';
  clauses.minCommit = spec.minCommit
    ? `Customer commits to a minimum annual spend of ${money(spec.minCommit)}.`
    : 'There is no minimum purchase commitment under this Agreement.';
  clauses.liability = `Each party's aggregate liability under this Agreement shall not exceed ${spec.liability}.`;
  clauses.assignment =
    "Neither party may assign this Agreement without the other party's prior written consent, except to a successor in a merger, acquisition or change of control.";
  clauses.law = `This Agreement is governed by the laws of the State of ${spec.law}.`;
  if (spec.audit) clauses.audit = "Customer may audit Supplier's invoices and supporting records once per year on thirty (30) days' notice.";
  clauses.payment = 'Undisputed invoices are payable within thirty (30) days of receipt.';
  clauses.noticeAddress = `All notices under this Agreement must be in writing and sent ${spec.noticeAddress}.`;

  const order: TermKey[] = ['parties', 'effective', 'end', 'renewal', 'tfc', 'priceIncrease', 'minCommit', 'liability', 'assignment', 'law', 'audit', 'payment', 'noticeAddress'];
  const body: string[] = [];
  const seen = new Set<string>();
  order.forEach((k) => {
    const c = clauses[k];
    if (c && !seen.has(c)) {
      seen.add(c);
      body.push(c);
    }
  });
  if (d.noticeUnit === 'ambiguous') body.push('Capitalised terms not defined here have the meaning given in Schedule 1. Schedule 1 defines "Business Day" but does not state whether periods of "days" refer to Business Days.');
  if (spec.serviceCredit) body.push(spec.serviceCredit.clause);
  if (spec.rateCard) body.push('Schedule 2 (Rate Card): ' + spec.rateCard.map((r) => `${r.item}: ${money(r.rate)} per ${r.unit}`).join('; ') + '.');

  const title = spec.title ?? `Master Services Agreement — ${name}`;
  const msa: Doc = {
    id: docId,
    kind: 'signed',
    title,
    source: `Drive › Contracts › ${spec.supplier.category}`,
    signedOn: d.effective,
    text: [title.toUpperCase(), ...body.map((b, i) => `${i + 1}. ${b}`)].join('\n\n'),
  };

  const docs: Doc[] = [msa];
  let amendDoc: Doc | undefined;
  if (d.amendment && spec.amendmentText) {
    amendDoc = {
      id: d.amendment.docId,
      kind: 'amendment',
      title: `Amendment No. 2 — ${name}`,
      source: 'Procurement mailbox (e-signature envelope)',
      signedOn: d.amendment.signedOn,
      text: [`AMENDMENT NO. 2 TO MASTER SERVICES AGREEMENT — ${name.toUpperCase()}`, ...spec.amendmentText.map((t, i) => `${i + 1}. ${t}`)].join('\n\n'),
    };
    docs.push(amendDoc);
  }
  if (spec.extraDocs) docs.push(...spec.extraDocs);

  const val: Record<TermKey, string> = {
    parties: `${COMPANY} and ${name}`,
    effective: fmt(d.effective),
    end:
      d.type === 'fixed'
        ? `Expires ${fmt(d.fixedEnd!)}`
        : d.type === 'evergreen'
          ? 'No end date (evergreen)'
          : `${d.initialTermMonths}-month initial term`,
    renewal:
      d.type === 'fixed' ? 'Does not renew' : d.type === 'evergreen' ? 'Continues until terminated' : `Auto-renews for ${d.renewalTermMonths}-month terms`,
    notice:
      d.type === 'window'
        ? `Window: ${d.windowOpenDays}–${d.windowCloseDays} days before term end`
        : d.type === 'fixed'
          ? 'None needed'
          : `${d.noticeDays} ${d.noticeUnit === 'business' ? 'business days' : d.noticeUnit === 'ambiguous' ? 'days (unit ambiguous)' : 'days'}${d.type === 'evergreen' ? ' to terminate' : ' before term end'}`,
    tfc: spec.tfcDays != null ? `Yes, ${spec.tfcDays} days' notice` : 'No',
    priceIncrease: spec.priceIncreasePct > 0 ? `Up to ${spec.priceIncreasePct}% per renewal` : 'Fixed',
    minCommit: spec.minCommit ? `${money(spec.minCommit)} / year` : 'None',
    liability: spec.liability,
    assignment: 'Consent needed; change of control allowed',
    law: spec.law,
    audit: spec.audit ? 'Annual, 30 days notice' : 'Not found',
    payment: 'Net 30',
    noticeAddress: spec.noticeAddress,
  };

  const terms: Term[] = (Object.keys(val) as TermKey[]).map((k) => {
    let quote: string | null = clauses[k] ?? null;
    let docRef = docId;
    let value = val[k];
    if (amendDoc && d.amendment) {
      if (k === 'end' && d.amendment.termEnd) {
        quote = spec.amendmentText![0];
        docRef = amendDoc.id;
        value = `Current term ends ${fmt(d.amendment.termEnd)} (amended)`;
      }
      if (k === 'notice' && d.amendment.noticeDays) {
        quote = spec.amendmentText![1];
        docRef = amendDoc.id;
        value = `${d.amendment.noticeDays} days before term end (amended)`;
      }
      if (k === 'priceIncrease' && spec.amendmentText![2]) {
        quote = spec.amendmentText![2];
        docRef = amendDoc.id;
        value = '6% on all rates from 1 Jan 2027 (amended)';
      }
    }
    if (spec.notFound?.includes(k)) quote = null;
    if (spec.paraphrase === k && quote) quote = quote.replace('shall not exceed', 'is capped at');
    let confidence = quote ? 0.93 + ((k.length * 7) % 6) / 100 : 0.4;
    if (spec.lowConf?.includes(k)) confidence = 0.62;
    if (d.noticeUnit === 'ambiguous' && k === 'notice') confidence = 0.58;
    return { key: k, value, quote, docId: docRef, confidence };
  });

  const nm = /^by (courier|certified mail|email) to (.+)$/.exec(spec.noticeAddress);
  if (!nm) throw new Error(`Unrecognised notice method for ${spec.id}`);
  const contract: Contract = {
    id: spec.id,
    notice: { method: nm[1] === 'certified mail' ? 'certified' : (nm[1] as 'courier' | 'email'), address: nm[2] },
    supplierId: sid,
    title,
    dates: d,
    docs,
    terms,
    priceIncreasePct: spec.priceIncreasePct,
    tfcDays: spec.tfcDays,
    critical: !!spec.critical,
    renewOnNewTermsAfterNotice: spec.renewOnNewTerms ?? true,
    rateCard: spec.rateCard,
    serviceCredit: spec.serviceCredit ? { ...spec.serviceCredit, docId } : undefined,
    approverAnswers: spec.approverAnswers,
    family: !!spec.answerKey,
    answerKey: spec.answerKey,
  };
  const supplier: Supplier = { id: sid, status: 'contract', ...spec.supplier };
  return { contract, supplier };
}

// ---------------------------------------------------------------------------
// Synthetic families with known correct dates (the answer key).
// ---------------------------------------------------------------------------

const BRIGHTSTAFF_AMEND = [
  'The current term of the Agreement is extended and shall end on April 4, 2027.',
  'Notice of non-renewal must be given no less than ninety (90) days prior to the end of the then-current term.',
  'All rates in Schedule 2 increase by six percent (6%) with effect from January 1, 2027.',
];

const families: Spec[] = [
  {
    id: 'brightstaff',
    supplier: { name: 'BrightStaff Solutions', category: 'Staffing', annualSpend: 186_000, ccSplit: [['CC-100', 0.92], ['CC-400', 0.08]], monthsPaid: 12 },
    dates: {
      type: 'auto', effective: '2024-01-08', initialTermMonths: 12, renewalTermMonths: 12, noticeDays: 60, noticeUnit: 'calendar',
      amendment: { docId: 'brightstaff-a2', signedOn: '2026-06-15', termEnd: '2027-04-04', noticeDays: 90 },
    },
    amendmentText: BRIGHTSTAFF_AMEND,
    tfcDays: null, priceIncreasePct: 6, liability: 'the fees paid in the prior twelve (12) months', law: 'Illinois', audit: true,
    noticeAddress: 'by courier to BrightStaff Solutions, Attn: Legal, 220 W Lake St, Chicago, IL 60606',
    rateCard: [
      { item: 'Warehouse Associate', unit: 'hour', rate: 28.0, increasePct: 6, increaseEffective: '2027-01-01' },
      { item: 'Forklift Operator', unit: 'hour', rate: 32.5, increasePct: 6, increaseEffective: '2027-01-01' },
      { item: 'Shift Lead', unit: 'hour', rate: 36.0, increasePct: 6, increaseEffective: '2027-01-01' },
    ],
    serviceCredit: {
      clause: "If the Fill Rate falls below 95% in any calendar quarter, Supplier shall credit Customer 3% of that quarter's fees.",
      claimable: 'Approver reports Q3 2026 fill rate of 88%',
      amount: 1380,
    },
    approverAnswers: { stillUsed: 'yes', performance: 'mixed', wouldMiss: 'yes', note: 'Fill rate dropped to about 88% in Q3; no-shows on night shift.' },
    answerKey: { noticeDeadline: '2027-01-04', decideBy: '2026-12-17' },
    extraDocs: [
      {
        id: 'brightstaff-a1', kind: 'amendment', title: 'Amendment No. 1 — BrightStaff Solutions (adds Shift Lead role)',
        source: 'Drive › Contracts › Staffing', signedOn: '2025-02-03',
        text: 'AMENDMENT NO. 1\n\n1. Schedule 2 is amended to add the role "Shift Lead" at $36.00 per hour.',
      },
    ],
  },
  {
    id: 'northwind',
    supplier: { name: 'Northwind Freight', category: 'Logistics', annualSpend: 62_000, ccSplit: [['CC-100', 1]], monthsPaid: 12 },
    dates: { type: 'window', effective: '2025-04-15', initialTermMonths: 24, renewalTermMonths: 12, windowOpenDays: 120, windowCloseDays: 90, noticeUnit: 'calendar' },
    tfcDays: null, priceIncreasePct: 4, liability: 'one hundred thousand dollars ($100,000)', law: 'Ohio', audit: true,
    noticeAddress: 'by certified mail to Northwind Freight, 1800 Harbor Way, Toledo, OH 43604',
    rateCard: [
      { item: 'Chicago–Toledo FTL', unit: 'load', rate: 1150 },
      { item: 'Toledo–Detroit FTL', unit: 'load', rate: 640 },
    ],
    approverAnswers: { stillUsed: 'partly', performance: 'mixed', wouldMiss: 'no', note: 'Most Midwest lanes moved to Atlas Freight in May; only Toledo–Detroit left.' },
    answerKey: { windowOpen: '2026-12-16', noticeDeadline: '2027-01-15', decideBy: '2026-12-31' },
  },
  {
    id: 'meridian',
    supplier: { name: 'Meridian Facility Services', category: 'Facilities', annualSpend: 48_000, ccSplit: [['CC-400', 1]], monthsPaid: 12 },
    dates: { type: 'fixed', effective: '2024-06-01', fixedEnd: '2027-05-31', noticeUnit: 'calendar' },
    tfcDays: 60, priceIncreasePct: 0, liability: 'two million dollars ($2,000,000)', law: 'New York', audit: false,
    noticeAddress: 'by email to contracts@meridianfs.example',
    approverAnswers: { stillUsed: 'yes', performance: 'good', wouldMiss: 'yes' },
    answerKey: { decideBy: '2027-03-02' },
  },
  {
    id: 'paperleaf',
    supplier: { name: 'Paperleaf Office Supply', category: 'Facilities', annualSpend: 8_400, ccSplit: [['CC-400', 0.7], ['CC-500', 0.3]], monthsPaid: 11 },
    dates: { type: 'evergreen', effective: '2023-02-10', noticeDays: 60, noticeUnit: 'calendar' },
    tfcDays: 60, priceIncreasePct: 0, liability: 'the fees paid in the prior six months', law: 'New York', audit: false,
    noticeAddress: 'by email to accounts@paperleaf.example',
    approverAnswers: { stillUsed: 'partly', performance: 'good', wouldMiss: 'no', note: 'We order most supplies through the new marketplace account now.' },
    answerKey: { decideBy: '2027-02-10' },
  },
  {
    id: 'lumen',
    supplier: { name: 'Lumen Cloud', category: 'Software', annualSpend: 36_000, ccSplit: [['CC-200', 0.38], ['CC-300', 0.33], ['CC-700', 0.29]], monthsPaid: 12 },
    dates: { type: 'auto', effective: '2021-03-01', initialTermMonths: 12, renewalTermMonths: 12, noticeDays: 30, noticeUnit: 'calendar' },
    tfcDays: null, priceIncreasePct: 7, liability: 'the fees paid in the prior twelve (12) months', law: 'Delaware', audit: false,
    noticeAddress: 'by email to legal@lumencloud.example',
    rateCard: [{ item: 'Workspace seat', unit: 'seat / month', rate: 30 }],
    approverAnswers: { stillUsed: 'yes', performance: 'good', wouldMiss: 'somewhat', note: '100 seats paid, 64 active in the last 90 days.' },
    answerKey: { noticeDeadline: '2027-01-30', decideBy: '2027-01-15' },
    extraDocs: [
      {
        id: 'lumen-dup', kind: 'duplicate', title: 'Lumen_MSA_signed (1).pdf', source: 'Procurement mailbox',
        signedOn: '2021-03-01', text: 'Duplicate of the signed Master Services Agreement (same hash after OCR normalisation).',
      },
    ],
  },
  {
    id: 'atlas',
    supplier: { name: 'Atlas Freight Lines', category: 'Logistics', annualSpend: 140_000, ccSplit: [['CC-100', 1]], monthsPaid: 12 },
    dates: { type: 'auto', effective: '2024-06-30', initialTermMonths: 36, renewalTermMonths: 12, noticeDays: 60, noticeUnit: 'ambiguous' },
    tfcDays: 90, priceIncreasePct: 5, liability: 'five hundred thousand dollars ($500,000)', law: 'Indiana', audit: true,
    noticeAddress: 'by courier to Atlas Freight Lines, Attn: Contracts, 9 Canal St, Indianapolis, IN 46204',
    approverAnswers: { stillUsed: 'yes', performance: 'good', wouldMiss: 'yes', note: 'Took over most Midwest lanes in May; on-time 97%.' },
    answerKey: { noticeDeadline: '2027-04-05', decideBy: '2027-03-22' },
  },
  {
    id: 'quill',
    supplier: { name: 'Quill Content Studio', category: 'Marketing', annualSpend: 6_000, ccSplit: [['CC-300', 1]], monthsPaid: 6 },
    dates: { type: 'auto', effective: '2025-02-15', initialTermMonths: 12, renewalTermMonths: 12, noticeDays: 30, noticeUnit: 'business' },
    tfcDays: 30, priceIncreasePct: 0, liability: 'the fees paid in the prior twelve (12) months', law: 'California', audit: false,
    noticeAddress: 'by email to hello@quillstudio.example',
    approverAnswers: { stillUsed: 'no', performance: 'good', wouldMiss: 'no', note: "Haven't used them since the spring campaign ended in June." },
    answerKey: { noticeDeadline: '2026-12-31', decideBy: '2026-12-16' },
  },
  {
    id: 'keystone',
    supplier: { name: 'Keystone Advisory', category: 'Consulting', annualSpend: 72_000, ccSplit: [['CC-500', 1]], monthsPaid: 8 },
    dates: { type: 'auto', effective: '2025-09-30', initialTermMonths: 24, renewalTermMonths: 12, noticeDays: 90, noticeUnit: 'calendar' },
    tfcDays: 30, priceIncreasePct: 3, liability: 'the fees paid under the relevant statement of work', law: 'New York', audit: true,
    noticeAddress: 'by email to engagements@keystone.example',
    answerKey: { noticeDeadline: '2027-07-02', decideBy: '2027-06-17' },
  },
  {
    id: 'orbit',
    supplier: { name: 'Orbit Media Buying', category: 'Marketing', annualSpend: 410_000, ccSplit: [['CC-300', 1]], monthsPaid: 12 },
    dates: { type: 'window', effective: '2025-12-31', initialTermMonths: 24, renewalTermMonths: 12, windowOpenDays: 180, windowCloseDays: 120, noticeUnit: 'calendar' },
    tfcDays: null, priceIncreasePct: 3, critical: true, liability: 'one million dollars ($1,000,000)', law: 'New York', audit: true, minCommit: 300_000,
    noticeAddress: 'by courier to Orbit Media Buying, 500 Fifth Ave, New York, NY 10110',
    approverAnswers: { stillUsed: 'yes', performance: 'good', wouldMiss: 'yes' },
    answerKey: { windowOpen: '2027-07-04', noticeDeadline: '2027-09-02', decideBy: '2027-08-19' },
  },
];

// ---------------------------------------------------------------------------
// Generic portfolio (stand-ins for the ~40 CUAD contracts in the plan).
// [name, category, annual, cost centre, type, current term end (days from go-live), notice, tfc, increase %, law]
// ---------------------------------------------------------------------------

type G = [string, Category, number, string, 'auto' | 'window' | 'fixed' | 'evergreen', number, number, number | null, number, string];
const generic: G[] = [
  ['Crestline Staffing', 'Staffing', 94_000, 'CC-100', 'auto', 40, 30, null, 5, 'Texas'],
  ['Summit Temp Partners', 'Staffing', 38_000, 'CC-400', 'auto', 75, 60, 30, 4, 'Illinois'],
  ['Pinnacle Talent', 'Staffing', 128_000, 'CC-200', 'auto', 160, 60, null, 5, 'California'],
  ['Harborline Couriers', 'Logistics', 22_000, 'CC-100', 'auto', 95, 30, 30, 3, 'Ohio'],
  ['Redwood Pallet Co.', 'Logistics', 7_200, 'CC-100', 'evergreen', 0, 30, 30, 0, 'Ohio'],
  ['Bluegate Customs Brokerage', 'Logistics', 54_000, 'CC-100', 'window', 210, 90, null, 4, 'New Jersey'],
  ['Cobalt Analytics', 'Software', 64_000, 'CC-200', 'auto', 55, 60, null, 8, 'Delaware'],
  ['Tidewater HR Cloud', 'Software', 118_000, 'CC-500', 'auto', 240, 90, null, 7, 'Delaware'],
  ['Nimbus Design Suite', 'Software', 9_600, 'CC-300', 'auto', 65, 30, null, 9, 'California'],
  ['Ferro Security Scanner', 'Software', 27_000, 'CC-600', 'auto', 130, 30, null, 6, 'Delaware'],
  ['Kestrel Ticketing', 'Software', 14_500, 'CC-600', 'auto', 300, 45, null, 5, 'Washington'],
  ['Granite Data Warehouse', 'Software', 156_000, 'CC-200', 'auto', 330, 90, null, 6, 'Delaware'],
  ['Brightline Sign', 'Software', 4_800, 'CC-500', 'auto', 18, 30, null, 10, 'California'],
  ['Silverleaf Janitorial', 'Facilities', 52_000, 'CC-400', 'auto', 115, 60, 60, 3, 'New York'],
  ['Evergreen Plant Care', 'Facilities', 3_600, 'CC-400', 'evergreen', 0, 30, 30, 0, 'New York'],
  ['Corelight Electrical', 'Facilities', 31_000, 'CC-400', 'fixed', 150, 0, 30, 0, 'New York'],
  ['Northgate Security Guards', 'Facilities', 112_000, 'CC-400', 'window', 270, 90, null, 4, 'New York'],
  ['Aqua Pure Water', 'Facilities', 2_900, 'CC-400', 'auto', 60, 30, 30, 5, 'New Jersey'],
  ['Halcyon Strategy Partners', 'Consulting', 145_000, 'CC-500', 'fixed', 200, 0, 30, 0, 'New York'],
  ['Ledgerline Tax Advisors', 'Consulting', 46_000, 'CC-500', 'auto', 85, 60, 30, 4, 'New York'],
  ['Brightwater Compliance', 'Consulting', 18_000, 'CC-500', 'evergreen', 0, 60, 60, 0, 'Massachusetts'],
  ['Vector Cloud Advisors', 'Consulting', 88_000, 'CC-200', 'fixed', 100, 0, 30, 0, 'California'],
  ['Mosaic Events', 'Marketing', 42_000, 'CC-300', 'auto', 50, 45, 30, 5, 'California'],
  ['Pulse Social Agency', 'Marketing', 96_000, 'CC-300', 'auto', 180, 60, 60, 6, 'California'],
  ['Prism Print & Promo', 'Marketing', 8_800, 'CC-300', 'auto', 35, 30, 30, 5, 'New York'],
  ['Signal SEO', 'Marketing', 24_000, 'CC-300', 'auto', 140, 30, 30, 5, 'Texas'],
  ['Fieldstone Lead Lists', 'Marketing', 33_000, 'CC-700', 'auto', 70, 30, null, 8, 'Texas'],
  ['Cardinal Payroll Services', 'Software', 67_000, 'CC-500', 'auto', 360, 90, null, 4, 'Delaware'],
  ['Trailhead CRM', 'Software', 210_000, 'CC-700', 'auto', 250, 90, null, 7, 'Delaware'],
  ['Westbrook Translation', 'Consulting', 5_500, 'CC-300', 'evergreen', 0, 30, 30, 0, 'Illinois'],
];

const specFromGeneric = (g: G, i: number): Spec => {
  const [name, category, annual, cc, type, endOffset, notice, tfc, inc, law] = g;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '');
  const termEnd = addDays(GO_LIVE, endOffset);
  let dates: DateTerms;
  if (type === 'auto') {
    const renewals = i % 3; // some have renewed several times
    dates = { type, effective: addMonths(termEnd, -12 * (renewals + 1)), initialTermMonths: 12, renewalTermMonths: 12, noticeDays: notice, noticeUnit: 'calendar' };
  } else if (type === 'window') {
    dates = { type, effective: addMonths(termEnd, -24), initialTermMonths: 24, renewalTermMonths: 12, windowOpenDays: notice + 30, windowCloseDays: notice, noticeUnit: 'calendar' };
  } else if (type === 'fixed') {
    dates = { type, effective: addMonths(termEnd, -24), fixedEnd: termEnd, noticeUnit: 'calendar' };
  } else {
    dates = { type, effective: addMonths(addDays(GO_LIVE, 40 + i * 9), -36), noticeDays: notice, noticeUnit: 'calendar' };
  }
  const shared = category === 'Software' && i % 4 === 0;
  return {
    id,
    supplier: {
      name, category, annualSpend: annual,
      ccSplit: shared ? [[cc, 0.36], ['CC-300', 0.34], ['CC-700', 0.3]] : [[cc, 1]],
      monthsPaid: type === 'evergreen' ? 9 : 12,
    },
    dates,
    tfcDays: tfc,
    priceIncreasePct: inc,
    critical: name === 'Trailhead CRM' || name === 'Cardinal Payroll Services',
    liability: annual > 100_000 ? 'two times (2x) the fees paid in the prior twelve (12) months' : 'the fees paid in the prior twelve (12) months',
    law,
    audit: i % 3 !== 1,
    noticeAddress: `by email to legal@${id.split('-')[0]}.example`,
    paraphrase: name === 'Granite Data Warehouse' ? 'liability' : undefined,
    notFound: name === 'Pulse Social Agency' ? ['law'] : undefined,
    lowConf: name === 'Pinnacle Talent' || name === 'Crestline Staffing' ? ['notice'] : undefined,
    rateCard: category === 'Software' && name !== 'Brightline Sign' ? [{ item: 'Seat', unit: 'seat / month', rate: Math.round(annual / 12 / 80) }] : undefined,
  };
};

const built = [...families, ...generic.map(specFromGeneric)].map(build);

export const CONTRACTS: Contract[] = built.map((b) => b.contract);

const harborDraft: Doc = {
  id: 'harbor-draft', kind: 'draft', title: 'Harbor Print Co. — Services Agreement (DRAFT v3, unsigned)',
  source: 'Drive › Contracts › Marketing › Drafts', text: 'DRAFT — NOT FOR SIGNATURE\n\n1. Term. Twelve (12) months, renewing automatically...',
};

export const SUPPLIERS: Supplier[] = [
  ...built.map((b) => b.supplier),
  { id: 's-harbor', name: 'Harbor Print Co.', category: 'Marketing', annualSpend: 19_000, ccSplit: [['CC-300', 1]], monthsPaid: 10, status: 'draftOnly', draftDoc: harborDraft },
  { id: 's-vantage', name: 'Vantage Analytics', category: 'Software', annualSpend: 26_400, ccSplit: [['CC-200', 1]], monthsPaid: 12, status: 'onlineTerms', onlineTermsUrl: 'https://vantage.example/terms (click-through)' },
  { id: 's-ridge', name: 'Ridgeway Temps', category: 'Staffing', annualSpend: 41_000, ccSplit: [['CC-100', 1]], monthsPaid: 9, status: 'missing' },
  { id: 's-copperline', name: 'Copperline Movers', category: 'Logistics', annualSpend: 12_500, ccSplit: [['CC-400', 1]], monthsPaid: 4, status: 'missing' },
  { id: 's-lattice', name: 'Lattice Learning', category: 'Software', annualSpend: 15_800, ccSplit: [['CC-500', 1]], monthsPaid: 12, status: 'missing' },
  { id: 's-oakmont', name: 'Oakmont Catering', category: 'Facilities', annualSpend: 9_200, ccSplit: [['CC-400', 1]], monthsPaid: 7, status: 'missing' },
  { id: 's-ember', name: 'Ember Video Production', category: 'Marketing', annualSpend: 23_000, ccSplit: [['CC-300', 1]], monthsPaid: 3, status: 'missing' },
  { id: 's-ironclad-keys', name: 'Keyline Locksmiths', category: 'Facilities', annualSpend: 1_200, ccSplit: [['CC-400', 1]], monthsPaid: 1, status: 'oneOff' },
  { id: 's-dash', name: 'Dash Rideshare Credits', category: 'Logistics', annualSpend: 3_100, ccSplit: [['CC-700', 1]], monthsPaid: 2, status: 'oneOff' },
  { id: 's-fern', name: 'Fern & Co. Florists', category: 'Facilities', annualSpend: 640, ccSplit: [['CC-400', 1]], monthsPaid: 2, status: 'oneOff' },
  { id: 's-quickprint', name: 'QuickPrint Express', category: 'Marketing', annualSpend: 2_400, ccSplit: [['CC-300', 1]], monthsPaid: 2, status: 'oneOff' },
  { id: 's-summitav', name: 'Summit AV Rentals', category: 'Marketing', annualSpend: 4_800, ccSplit: [['CC-300', 1]], monthsPaid: 1, status: 'oneOff' },
  { id: 's-glow', name: 'Glow Coffee Service', category: 'Facilities', annualSpend: 5_900, ccSplit: [['CC-400', 1]], monthsPaid: 2, status: 'oneOff' },
];

// ---------------------------------------------------------------------------
// Invoice file: 12 months (Dec 2025 – Nov 2026) generated deterministically.
// ---------------------------------------------------------------------------

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildInvoices(): Invoice[] {
  const out: Invoice[] = [];
  const months = Array.from({ length: 12 }, (_, i) => addMonths('2025-12-05', i));
  SUPPLIERS.forEach((s, si) => {
    const r = rng(si + 11);
    const paidMonths = months.slice(12 - s.monthsPaid);
    paidMonths.forEach((m, mi) => {
      s.ccSplit.forEach(([cc, share], ci) => {
        const centre = COST_CENTRES.find((c) => c.id === cc)!;
        let amount = Math.round((s.annualSpend / s.monthsPaid) * share * (0.9 + r() * 0.2));
        let lines;
        if (s.id === 's-brightstaff' && cc === 'CC-100') {
          // From September 2026 the 6% increase is billed, though it only takes effect on 1 Jan 2027.
          const early = m >= '2026-09-01';
          const up = (x: number) => Math.round(x * 1.06 * 100) / 100;
          lines = [
            { item: 'Warehouse Associate', qty: 300 + Math.round(r() * 40), rate: early ? up(28) : 28 },
            { item: 'Forklift Operator', qty: 110 + Math.round(r() * 20), rate: early ? up(32.5) : 32.5 },
            { item: 'Shift Lead', qty: 64 + Math.round(r() * 10), rate: early ? up(36) : 36 },
          ];
          amount = Math.round(lines.reduce((a, l) => a + l.qty * l.rate, 0));
        }
        out.push({ id: `INV-${si}-${mi}-${ci}`, supplierId: s.id, date: m, amount, costCentre: cc, approverId: centre.approverId, lines });
      });
    });
  });
  return out;
}

export const INVOICES: Invoice[] = buildInvoices();
