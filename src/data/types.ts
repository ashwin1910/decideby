import type { ISODate } from '../lib/dates';

export type Category = 'Staffing' | 'Logistics' | 'Software' | 'Facilities' | 'Consulting' | 'Marketing';
export type ContractType = 'auto' | 'window' | 'fixed' | 'evergreen';
export type Tier = 'small' | 'mid' | 'large';
export type DocKind = 'signed' | 'draft' | 'amendment' | 'duplicate';

export interface Person {
  id: string;
  name: string;
  title: string;
  managerId?: string;
}

export interface CostCentre {
  id: string;
  name: string;
  ownerId?: string; // missing owner exercises the fallback chain
  approverId: string;
}

export interface Doc {
  id: string;
  kind: DocKind;
  title: string;
  source: string;
  signedOn?: ISODate;
  text: string;
}

export type TermKey =
  | 'parties'
  | 'effective'
  | 'end'
  | 'renewal'
  | 'notice'
  | 'tfc'
  | 'priceIncrease'
  | 'minCommit'
  | 'liability'
  | 'assignment'
  | 'law'
  | 'audit'
  | 'payment'
  | 'noticeAddress';

export interface Term {
  key: TermKey;
  value: string;
  quote: string | null; // null = "not found"
  docId: string;
  confidence: number; // 0..1
}

export interface DateTerms {
  type: ContractType;
  effective: ISODate;
  initialTermMonths?: number;
  renewalTermMonths?: number;
  fixedEnd?: ISODate;
  /** auto: days before term end; evergreen: notice period that sets the end date */
  noticeDays?: number;
  noticeUnit: 'calendar' | 'business' | 'ambiguous';
  windowOpenDays?: number; // "no earlier than"
  windowCloseDays?: number; // "no later than"
  amendment?: { docId: string; signedOn: ISODate; termEnd?: ISODate; noticeDays?: number };
}

export interface RateLine {
  item: string;
  unit: string;
  rate: number;
  increasePct?: number;
  increaseEffective?: ISODate;
}

export interface ApproverAnswers {
  stillUsed: 'yes' | 'partly' | 'no';
  performance: 'good' | 'mixed' | 'poor';
  wouldMiss: 'yes' | 'somewhat' | 'no';
  note?: string;
}

export interface Contract {
  id: string;
  supplierId: string;
  title: string;
  dates: DateTerms;
  docs: Doc[];
  terms: Term[];
  priceIncreasePct: number;
  tfcDays: number | null;
  critical: boolean;
  renewOnNewTermsAfterNotice: boolean;
  rateCard?: RateLine[];
  serviceCredit?: { clause: string; docId: string; claimable?: string; amount?: number };
  approverAnswers?: ApproverAnswers;
  family?: boolean;
  answerKey?: { noticeDeadline?: ISODate; windowOpen?: ISODate; decideBy: ISODate };
}

export interface Supplier {
  id: string;
  name: string;
  category: Category;
  annualSpend: number;
  ccSplit: [string, number][]; // cost centre, share of spend
  monthsPaid: number;
  status: 'contract' | 'missing' | 'draftOnly' | 'onlineTerms' | 'oneOff';
  onlineTermsUrl?: string;
  draftDoc?: Doc;
}

export interface InvoiceLine {
  item: string;
  qty: number;
  rate: number;
}

export interface Invoice {
  id: string;
  supplierId: string;
  date: ISODate;
  amount: number;
  costCentre: string;
  approverId: string;
  lines?: InvoiceLine[];
}
