import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CONTRACTS, GO_LIVE, PEOPLE } from './data/seed';
import type { Contract } from './data/types';
import { addDays, fmt, type ISODate } from './lib/dates';
import { assignOwner, computeDates, scheduleOf, stageAt, type DateResult, type Decision, type OwnerResult, type Schedule, type Stage } from './lib/logic';

export interface Outcome {
  newAnnual: number;
  termMonths: number;
  /** the baseline the savings are measured against (see priceBaseline) */
  autoRenewPrice: number;
  savings: number;
  /** overcharges and service credits actually recovered */
  recovered?: number;
  note: string;
  recordedOn: ISODate;
}

export interface DecisionRecord {
  decision: Decision;
  recommended: Decision;
  overrideReason?: string;
  decidedOn: ISODate;
  decidedBy: string;
  letter?: {
    status: 'drafted' | 'approved' | 'packed' | 'sent';
    approvedBy?: string;
    approvedOn?: ISODate;
    /** courier / certified mail: when the dispatch pack was generated */
    packedOn?: ISODate;
    /** date sent by email, or date marked dispatched */
    sentOn?: ISODate;
    tracking?: string;
  };
  protective?: boolean;
  outcome?: Outcome;
}

export interface Row {
  c: Contract;
  dr: DateResult;
  sch: Schedule;
  owner: OwnerResult;
  stage: Stage;
  rec?: DecisionRecord;
}

export interface CreditRequest {
  requestedOn: ISODate;
  overcharge: number;
  serviceCredit: number;
}

export interface OwnerOverride {
  personId: string;
  on: ISODate;
}

export type Role = 'procurement' | 'owner' | 'legal';
/** The budget owner the "Budget owner" view acts as. */
export const OWNER_VIEW_ID = 'p-ops';

interface Store {
  role: Role;
  setRole: (r: Role) => void;
  owners: Record<string, OwnerOverride>;
  reassign: (id: string, o: OwnerOverride | undefined) => void;
  credits: Record<string, CreditRequest>;
  requestCredit: (id: string, r: CreditRequest | undefined) => void;
  offset: number;
  setOffset: (n: number) => void;
  now: ISODate;
  records: Record<string, DecisionRecord>;
  setRecord: (id: string, r: DecisionRecord | undefined) => void;
  reset: () => void;
  rows: Row[];
  route: string[];
  go: (path: string) => void;
}

const Ctx = createContext<Store>(null!);
export const STORAGE_PREFIX = 'decideby.';
const KEY = 'decideby.records.v1';
const CREDITS_KEY = 'decideby.credits.v1';
const OWNERS_KEY = 'decideby.owners.v1';

/** Remove every key this app has ever written, whatever its version suffix. */
export function clearPersisted() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* storage unavailable */
  }
}

function loadKey<T>(key: string): Record<string, T> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}');
  } catch {
    return {};
  }
}

function persist(key: string, value: Record<string, unknown>) {
  try {
    if (Object.keys(value).length) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable: state lives for this visit only */
  }
}

const parseHash = () => (location.hash.replace(/^#\/?/, '').split('?')[0] || 'triage').split('/');
/** Query string carried in the hash, e.g. #/repository?q=... */
export const hashQuery = () => new URLSearchParams(location.hash.split('?')[1] ?? '');

// Static per-contract computation (dates are relative to go-live, not the slider).
const BASE = CONTRACTS.map((c) => {
  const dr = computeDates(c, GO_LIVE);
  return { c, dr, sch: scheduleOf(c, dr), owner: assignOwner(c) };
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [records, setRecords] = useState<Record<string, DecisionRecord>>(() => loadKey<DecisionRecord>(KEY));
  const [credits, setCredits] = useState<Record<string, CreditRequest>>(() => loadKey<CreditRequest>(CREDITS_KEY));
  const [owners, setOwners] = useState<Record<string, OwnerOverride>>(() => loadKey<OwnerOverride>(OWNERS_KEY));
  const [route, setRoute] = useState(parseHash);
  // Bumped by Reset so every view remounts and drops its local state too.
  const [epoch, setEpoch] = useState(0);
  const [role, setRole] = useState<Role>('procurement');

  useEffect(() => {
    const f = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  useEffect(() => persist(KEY, records), [records]);
  useEffect(() => persist(CREDITS_KEY, credits), [credits]);
  useEffect(() => persist(OWNERS_KEY, owners), [owners]);

  const now = addDays(GO_LIVE, offset);
  const rows = useMemo<Row[]>(
    () =>
      BASE.map((base) => {
        const ov = owners[base.c.id];
        const p = ov && PEOPLE.find((x) => x.id === ov.personId);
        const b = p
          ? {
              ...base,
              owner: {
                ...base.owner,
                owner: p,
                manager: PEOPLE.find((x) => x.id === p.managerId),
                reason: [...base.owner.reason, `Reassigned to ${p.name} on ${fmt(ov.on)}.`],
                reassigned: true,
              },
            }
          : base;
        const rec = records[b.c.id];
        const decided = !!rec && rec.decidedOn <= now;
        const sent = rec?.letter?.status === 'sent' && rec.letter.sentOn && rec.letter.sentOn <= now ? rec.letter.sentOn : undefined;
        const stage = stageAt(
          b.sch,
          b.dr,
          now,
          decided ? { decision: rec.decision, decidedOn: rec.decidedOn, sentOn: sent, letterStatus: rec.letter?.status } : undefined,
        );
        return { ...b, rec: decided ? rec : undefined, stage };
      }),
    [records, now, owners],
  );

  const value: Store = {
    role,
    setRole,
    owners,
    reassign: (id, o) =>
      setOwners((prev) => {
        const next = { ...prev };
        if (o) next[id] = o;
        else delete next[id];
        return next;
      }),
    credits,
    requestCredit: (id, r) =>
      setCredits((prev) => {
        const next = { ...prev };
        if (r) next[id] = r;
        else delete next[id];
        return next;
      }),
    offset,
    setOffset,
    now,
    records,
    setRecord: (id, r) =>
      setRecords((prev) => {
        const next = { ...prev };
        if (r) next[id] = r;
        else delete next[id];
        return next;
      }),
    reset: () => {
      clearPersisted();
      setRecords({});
      setCredits({});
      setOwners({});
      setOffset(0);
      setRole('procurement');
      setEpoch((e) => e + 1);
      if (location.hash !== '#/triage') location.hash = '#/triage';
    },
    rows,
    route,
    go: (p) => {
      location.hash = '#/' + p;
    },
  };
  return (
    <Ctx.Provider value={value}>
      <Fragment key={epoch}>{children}</Fragment>
    </Ctx.Provider>
  );
}

export const useStore = () => useContext(Ctx);
