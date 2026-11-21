// The extraction prompt, shown on the Evaluation page. The server function
// (api/extract.ts) keeps its own copy; a test checks the two stay identical.

export const TERM_KEYS = [
  'parties', 'effective', 'end', 'renewal', 'notice', 'tfc', 'priceIncrease',
  'minCommit', 'liability', 'assignment', 'law', 'audit', 'payment', 'noticeAddress',
] as const;

export const TERM_HELP: Record<(typeof TERM_KEYS)[number], string> = {
  parties: 'the contracting parties',
  effective: 'effective date',
  end: 'end date or length of the current term (after amendments)',
  renewal: 'renewal mechanism and renewal term',
  notice: 'notice period or notice window for non-renewal / termination (after amendments)',
  tfc: 'termination for convenience: whether allowed and on how many days notice',
  priceIncrease: 'price increase rules (after amendments)',
  minCommit: 'minimum purchase commitment',
  liability: 'liability cap',
  assignment: 'assignment and change of control',
  law: 'governing law',
  audit: 'audit rights',
  payment: 'payment terms',
  noticeAddress: 'where and by what method notices must be delivered',
};

export const SYSTEM =
  'You extract terms from a supplier contract family (a signed agreement plus any amendments). ' +
  'Later-signed amendments override the original agreement. For every term, copy the supporting sentence ' +
  'exactly as written - character for character, without the clause number - into "quote", and give the id of the document it came from. ' +
  'If a term is not in any document, set quote and docId to "" and confidence low. Never invent text.';

/** The user message: the contract documents, then the list of terms to extract. */
export const termRequest = () =>
  `Extract exactly these ${TERM_KEYS.length} terms, one entry each:\n` + TERM_KEYS.map((k) => `- ${k}: ${TERM_HELP[k]}`).join('\n');
