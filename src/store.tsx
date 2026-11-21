import { createContext, Fragment, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CONTRACTS, GO_LIVE } from './data/seed';
import type { Contract } from './data/types';
import { addDays, type ISODate } from './lib/dates';
import { assignOwner, computeDates, scheduleOf, stageAt, type DateResult, type Decision, type OwnerResult, type Schedule, type Stage } from './lib/logic';

export interface Outcome {
  newAnnual: number;
  termMonths: number;
  autoRenewPrice: number;
  savings: number;
  note: string;
  recordedOn: ISODate;
}

export interface DecisionRecord {
  decision: Decision;
  recommended: Decision;
  overrideReason?: string;
  decidedOn: ISODate;
  decidedBy: string;
  letter?: { status: 'drafted' | 'approved' | 'sent'; approvedBy?: string; approvedOn?: ISODate; sentOn?: ISODate };
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

interface Store {
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

function load(): Record<string, DecisionRecord> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

const parseHash = () => (location.hash.replace(/^#\/?/, '') || 'triage').split('/');

// Static per-contract computation (dates are relative to go-live, not the slider).
const BASE = CONTRACTS.map((c) => {
  const dr = computeDates(c, GO_LIVE);
  return { c, dr, sch: scheduleOf(c, dr), owner: assignOwner(c) };
});

export function StoreProvider({ children }: { children: ReactNode }) {
  const [offset, setOffset] = useState(0);
  const [records, setRecords] = useState<Record<string, DecisionRecord>>(load);
  const [route, setRoute] = useState(parseHash);
  // Bumped by Reset so every view remounts and drops its local state too.
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    const f = () => {
      setRoute(parseHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  useEffect(() => {
    try {
      if (Object.keys(records).length) localStorage.setItem(KEY, JSON.stringify(records));
      else localStorage.removeItem(KEY);
    } catch {
      /* storage unavailable: state lives for this visit only */
    }
  }, [records]);

  const now = addDays(GO_LIVE, offset);
  const rows = useMemo<Row[]>(
    () =>
      BASE.map((b) => {
        const rec = records[b.c.id];
        const decided = !!rec && rec.decidedOn <= now;
        return { ...b, rec: decided ? rec : undefined, stage: stageAt(b.sch, now, decided) };
      }),
    [records, now],
  );

  const value: Store = {
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
      setOffset(0);
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
