# DecideBy

DecideBy is a prototype of an intelligent contract repository for a growing company with no contract team. Its goal is that the right person decides each supplier renewal before the last safe day.

It runs on one seeded company, Halden Group, and a reviewer can follow it end to end in about 3 minutes.

## What's in it

| Tab | What it shows |
| --- | --- |
| **Triage** | First-week triage: every contract ranked by days left and value, the north-star metric, coverage, and a pipeline of where each renewal stands on the simulated date. |
| **Contract record** | 14 terms, each with a verbatim quote and a quote check. The decide-by date and send window are shown separately, with the step-by-step date calculation, the contract family, owner assignment and the escalation schedule. A "Replay extraction (simulated)" button replays the pre-computed AI extraction and re-runs the real quote check and date maths. |
| **Owner brief** | Terms in force after amendments, the price if it renews, a rate check against invoices, the approver's three answers and service credits, and a default recommendation. Overriding the recommendation needs a reason. The approved letter is held until the notice window opens, then the outcome and savings are recorded. |
| **Repository** | Simulated sources (drive, mailbox, ERP), document sorting, coverage of in-scope suppliers with their gaps, plain-language search with cited answers, and the Legal review queue. |
| **Evaluation** | The family-deadline test runs live in the browser against a hand-computed answer key, with the too-late count shown first. It also shows the quote-check statistics. The CUAD extraction test is marked as planned, not run in this prototype. |
| **Case** | Why this stage, the stakeholder map, the problem and its evidence, metrics, assumptions, scope, comparable products, and how this fits Sirion. |

The **time slider** in the "Demo only" bar at the bottom moves the simulated date forward from go-live (Mon 23 Nov 2026). Moving it lets you see undecided contracts escalate, and see a held letter released once its window opens.

## 3-minute demo script

1. **Triage**: "Week 1: N contracts worth $X must be decided within 45 days."
2. Open **BrightStaff Solutions**. An amendment moved the deadline, and the rate check shows a 6% increase billed before its effective date.
3. Open **Northwind Freight**, which has a notice window. Choose *Exit* and approve the letter. The letter is held until 16 Dec 2026.
4. In **Repository**, ask: "which suppliers can we exit for convenience on 30 days' notice?"
5. Move the slider. Undecided contracts escalate on the triage schedule, and the Northwind letter can now be sent.
6. Record BrightStaff's outcome, then finish on **Evaluation**.

## What is real and what is simulated

- **Real, running in code:** the date engine (renewal roll-forward, amendments, notice windows, business-day and ambiguous notice periods, the 10-business-day buffer), the quote check, owner assignment from invoice cost centres, tiers and escalation schedules, the rate check, recommendations, search and the deadline evaluation.
- **Simulated:** connections to Google Drive, the mailbox and the ERP use seeded data. AI extraction results are pre-computed; no model or server is called, and the app needs no API key. In production the extraction step would run an LLM (e.g. Claude) on each document. All companies, people and contracts are synthetic.
- **Planned, not run:** the CUAD extraction-accuracy test.

Decisions are stored in the browser's `localStorage`. Use **Reset demo** to clear them.

## Run locally

```bash
npm install
npm run dev
```

To run the test suite (including the date engine against the answer key):

```bash
npm test
```

## Deploy on Vercel

Import the repository in Vercel. It detects Vite automatically, so the build command is `npm run build` and the output directory is `dist`. `vercel.json` is included. No environment variables are needed.
