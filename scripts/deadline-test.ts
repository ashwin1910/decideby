// Runs the family-deadline test from the command line: engine output vs. the hand-computed answer key.
import { CONTRACTS } from '../src/data/seed';
import { computeDates } from '../src/lib/logic';

let tooLate = 0, tooEarly = 0, exact = 0;
for (const c of CONTRACTS.filter((x) => x.answerKey)) {
  const r = computeDates(c);
  const k = c.answerKey!;
  const checks: [string, string | null | undefined, string | undefined][] = [
    ['decideBy', r.decideBy, k.decideBy],
    ['noticeDeadline', r.noticeDeadline, k.noticeDeadline],
    ['windowOpen', r.windowOpen, k.windowOpen],
  ];
  for (const [name, got, want] of checks) {
    if (!want) continue;
    // windowOpen: too-late is the safe direction (later open); for deadlines, too-late is dangerous.
    const late = name === 'windowOpen' ? got! < want : got! > want;
    const ok = got === want;
    if (ok) exact++; else if (late) tooLate++; else tooEarly++;
    console.log(`${ok ? 'OK ' : late ? 'LATE' : 'EARLY'}  ${c.id.padEnd(12)} ${name.padEnd(15)} got ${got}  want ${want}`);
  }
}
console.log({ exact, tooLate, tooEarly });
if (tooLate) throw new Error(`${tooLate} too-late deadline(s)`);
