// Company holiday calendar: days that are not business days.
// US federal holidays 2026–2027 (observed dates). Edit this list to change
// the company calendar; every business-day count in DecideBy skips these days.
export const COMPANY_HOLIDAYS: Record<string, string> = {
  '2026-01-01': "New Year's Day",
  '2026-01-19': 'Martin Luther King Jr. Day',
  '2026-02-16': "Presidents' Day",
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence Day (observed)',
  '2026-09-07': 'Labor Day',
  '2026-10-12': 'Columbus Day',
  '2026-11-11': 'Veterans Day',
  '2026-11-26': 'Thanksgiving',
  '2026-12-25': 'Christmas Day',
  '2027-01-01': "New Year's Day",
  '2027-01-18': 'Martin Luther King Jr. Day',
  '2027-02-15': "Presidents' Day",
  '2027-05-31': 'Memorial Day',
  '2027-06-18': 'Juneteenth (observed)',
  '2027-07-05': 'Independence Day (observed)',
  '2027-09-06': 'Labor Day',
  '2027-10-11': 'Columbus Day',
  '2027-11-11': 'Veterans Day',
  '2027-11-25': 'Thanksgiving',
  '2027-12-24': 'Christmas Day (observed)',
  '2027-12-31': "New Year's Day 2028 (observed)",
};
