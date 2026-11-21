// Date-only arithmetic in UTC. Code, not the model, does all date maths.
// Business days are Monday–Friday, excluding the company holidays in data/holidays.ts.

import { COMPANY_HOLIDAYS } from '../data/holidays';

export type ISODate = string; // YYYY-MM-DD

const DAY = 86_400_000;

export function parse(d: ISODate): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function iso(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return iso(new Date(parse(d).getTime() + n * DAY));
}

export function addMonths(d: ISODate, n: number): ISODate {
  const x = parse(d);
  const day = x.getUTCDate();
  const target = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return iso(target);
}

export function isWeekend(d: ISODate): boolean {
  const w = parse(d).getUTCDay();
  return w === 0 || w === 6;
}

export const isHoliday = (d: ISODate): boolean => d in COMPANY_HOLIDAYS;
export const isBusinessDay = (d: ISODate): boolean => !isWeekend(d) && !isHoliday(d);

/** Move back n business days (n > 0), skipping weekends and company holidays. */
export function subBusinessDaysDetail(d: ISODate, n: number): { date: ISODate; skipped: ISODate[] } {
  let cur = d;
  let left = n;
  const skipped: ISODate[] = [];
  while (left > 0) {
    cur = addDays(cur, -1);
    if (isBusinessDay(cur)) left--;
    else if (isHoliday(cur)) skipped.push(cur);
  }
  return { date: cur, skipped };
}

export const subBusinessDays = (d: ISODate, n: number): ISODate => subBusinessDaysDetail(d, n).date;

export function addBusinessDays(d: ISODate, n: number): ISODate {
  let cur = d;
  let left = n;
  while (left > 0) {
    cur = addDays(cur, 1);
    if (isBusinessDay(cur)) left--;
  }
  return cur;
}

/** The same day if it is a business day, otherwise the previous business day. */
export function onOrBeforeBusinessDay(d: ISODate): ISODate {
  let cur = d;
  while (!isBusinessDay(cur)) cur = addDays(cur, -1);
  return cur;
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / DAY);
}

export function minDate(...ds: ISODate[]): ISODate {
  return ds.reduce((m, d) => (d < m ? d : m));
}

export function maxDate(...ds: ISODate[]): ISODate {
  return ds.reduce((m, d) => (d > m ? d : m));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmt(d: ISODate | null | undefined): string {
  if (!d) return '—';
  const x = parse(d);
  return `${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
}

export function fmtWd(d: ISODate): string {
  return `${WD[parse(d).getUTCDay()]} ${fmt(d)}`;
}
