// ClaimCheck — offline deterministic claim verifier.
export { analyze } from './analyze.js';
export { diffAnalyses, keyAtoms } from './diff.js';
export {
  atomizeClaim, splitClaims, extractEntities, normalizeEntity, orderBounds,
  findCausalCues, hedgeHits, correlationHits, CAUSAL_CUES, HEDGE_CUES,
  CORRELATION_CUES, ORDER_CUES, ATOM_TYPES
} from './atomize.js';
export { VERDICT, RULES, JUDGES } from './rules.js';
export { SAMPLES, REVISION_CLAIMS, sampleById } from './samples.js';
export {
  splitSentences, extractNumbers, extractDates, sentenceAt, words, contentWords,
  stem, escapeReg, normPhrase
} from './text.js';
