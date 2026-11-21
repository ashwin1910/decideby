import { GO_LIVE } from './data/seed';
import { addBusinessDays, diffDays, fmtWd } from './lib/dates';
import { useStore } from './store';
import Brief from './views/Brief';
import Case from './views/Case';
import ContractRecord from './views/ContractRecord';
import Evaluation from './views/Evaluation';
import Repository from './views/Repository';
import Triage from './views/Triage';

const NAV = [
  ['triage', 'Triage'],
  ['repository', 'Repository'],
  ['evaluation', 'Evaluation'],
  ['case', 'Case'],
] as const;

function Slider() {
  const { offset, setOffset, now, reset } = useStore();
  const marks = [
    { d: diffDays(addBusinessDays(GO_LIVE, 3), GO_LIVE), l: 'Triage: manager' },
    { d: diffDays(addBusinessDays(GO_LIVE, 5), GO_LIVE), l: 'Triage: procurement' },
  ];
  return (
    <div className="slider">
      <div className="slider-top">
        <span className="slider-label">
          Simulated date <b>{fmtWd(now)}</b> · day {offset} of the pilot
        </span>
        <span className="slider-btns">
          <button className="ghost sm" onClick={() => setOffset(Math.max(0, offset - 1))}>−1d</button>
          <button className="ghost sm" onClick={() => setOffset(offset + 1)}>+1d</button>
          <button className="ghost sm" onClick={() => setOffset(Math.min(270, offset + 7))}>+1w</button>
          <button className="ghost sm" onClick={() => { if (confirm('Clear all recorded decisions and return to go-live?')) reset(); }}>Reset demo</button>
        </span>
      </div>
      <div className="slider-track">
        <input type="range" min={0} max={270} value={offset} onChange={(e) => setOffset(Number(e.target.value))} aria-label="Simulated days since go-live" />
        {marks.map((m) => (
          <span key={m.l} className="slider-mark" style={{ left: `calc(${(m.d / 270) * 100}% )` }} title={m.l} />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  const { route, go } = useStore();
  const [page, id] = route;
  let view;
  if (page === 'contract' && id) view = <ContractRecord id={id} />;
  else if (page === 'brief' && id) view = <Brief id={id} />;
  else if (page === 'repository') view = <Repository />;
  else if (page === 'evaluation') view = <Evaluation />;
  else if (page === 'case') view = <Case />;
  else view = <Triage />;
  const active = page === 'contract' || page === 'brief' ? 'triage' : page;

  return (
    <div className="app">
      <header className="top">
        <div className="top-row">
          <button className="brand" onClick={() => go('triage')}>
            <span className="logo">✓</span>
            DecideBy
            <span className="brand-sub">Halden Group · intelligent repository</span>
          </button>
          <nav>
            {NAV.map(([k, l]) => (
              <button key={k} className={active === k ? 'on' : ''} onClick={() => go(k)}>
                {l}
              </button>
            ))}
          </nav>
        </div>
        <Slider />
      </header>
      <main>{view}</main>
      <footer className="foot">
        Prototype with seeded, synthetic data. Connections to Drive, the mailbox and the ERP are simulated; AI extraction results are pre-computed; “Re-run live” asks the model again. Dates
        are calculated in code.
      </footer>
    </div>
  );
}
