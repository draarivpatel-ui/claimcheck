// rules.js — the deterministic verdict rules.
//
// Every rule answers one question: can this atom be placed against a span in
// the passage, and does that span agree with the claim? "No span" is
// UNVERIFIABLE-IN-TEXT; "span disagrees" is UNSUPPORTED. Nothing here checks
// the passage against the world.

import {
  contentWords, extractNumbers, extractYearsIn, sentenceAt, sentencesWithRoot,
  escapeReg
} from './text.js';
import { correlationHits, findCausalCues, hedgeHits, orderBounds } from './atomize.js';

export const VERDICT = Object.freeze({
  SUPPORTED: 'SUPPORTED',
  UNSUPPORTED: 'UNSUPPORTED',
  UNVERIFIABLE: 'UNVERIFIABLE-IN-TEXT'
});

export const RULES = [
  { id: 'number_match', family: 'Numeric consistency', verdict: VERDICT.SUPPORTED,
    fires: 'A figure in the claim matches a figure in a passage sentence about the same anchor word.' },
  { id: 'number_mismatch', family: 'Numeric consistency', verdict: VERDICT.UNSUPPORTED,
    fires: 'The passage discusses the same anchor but gives a different figure.' },
  { id: 'number_unit_mismatch', family: 'Numeric consistency', verdict: VERDICT.UNSUPPORTED,
    fires: 'Same digits, different unit (a percentage where the passage says a count).' },
  { id: 'number_without_figure', family: 'Numeric consistency', verdict: VERDICT.UNVERIFIABLE,
    fires: 'The passage discusses the anchor but states no figure at all.' },
  { id: 'anchor_absent', family: 'Numeric consistency', verdict: VERDICT.UNVERIFIABLE,
    fires: 'The anchor word around the figure never appears in the passage.' },
  { id: 'date_match', family: 'Date ordering', verdict: VERDICT.SUPPORTED,
    fires: 'The year in the claim appears in the passage.' },
  { id: 'date_order_conflict', family: 'Date ordering', verdict: VERDICT.UNSUPPORTED,
    fires: 'Temporal cues build an impossible window (after 2015 ... before 2010).' },
  { id: 'date_mismatch', family: 'Date ordering', verdict: VERDICT.UNSUPPORTED,
    fires: 'The passage dates the same entity differently.' },
  { id: 'date_absent', family: 'Date ordering', verdict: VERDICT.UNVERIFIABLE,
    fires: 'The claim year is not in the passage.' },
  { id: 'entity_mention', family: 'Entity mention', verdict: VERDICT.SUPPORTED,
    fires: 'The named entity appears in the passage.' },
  { id: 'entity_variant', family: 'Entity mention', verdict: VERDICT.UNSUPPORTED,
    fires: 'A near-identical name appears but one token differs (Act vs Bill).' },
  { id: 'entity_absent', family: 'Entity mention', verdict: VERDICT.UNVERIFIABLE,
    fires: 'The entity is never mentioned; absence is not disproof.' },
  { id: 'causal_supported', family: 'Causal language', verdict: VERDICT.SUPPORTED,
    fires: 'The passage makes the same causal move the claim makes.' },
  { id: 'correlation_as_causation', family: 'Causal language', verdict: VERDICT.UNSUPPORTED,
    fires: 'The claim asserts cause but the passage only reports association.' },
  { id: 'hedge_weakens_causal', family: 'Causal language', verdict: VERDICT.UNSUPPORTED,
    fires: 'The passage hedges (may, suggests, preliminary) while the claim is flat.' },
  { id: 'causal_unclear', family: 'Causal language', verdict: VERDICT.UNVERIFIABLE,
    fires: 'A matching passage sentence exists but carries no causal or correlational cue.' },
  { id: 'causal_no_basis', family: 'Causal language', verdict: VERDICT.UNVERIFIABLE,
    fires: 'No passage sentence shares enough wording to judge the causal claim.' }
];

function numEqual(a, b) {
  return Math.abs(a - b) < 1e-9;
}

function bestSentenceFor(claimText, sentences) {
  const wanted = contentWords(claimText);
  let best = null;
  for (const s of sentences) {
    const lower = s.text.toLowerCase();
    const hits = wanted.filter((w) => lower.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { sentence: s, hits };
  }
  return best?.sentence ?? null;
}

function entityRanges(passage, entity) {
  const re = new RegExp(`(?<![\\p{L}])${escapeReg(entity).replace(/\s+/g, '\\s+')}(?![\\p{L}])`, 'giu');
  return [...passage.matchAll(re)].map((m) => ({ start: m.index, end: m.index + m[0].length, text: m[0] }));
}

export function judgeNumber(atom, ctx) {
  const { passage, sentences } = ctx;
  const anchor = atom.anchor;
  if (!anchor) {
    const hit = extractNumbers(passage).find((n) => numEqual(n.abs, atom.abs) && n.unit === atom.unit);
    if (hit) {
      return {
        verdict: VERDICT.SUPPORTED, rule: 'number_match',
        quote: sentenceAt(passage, hit.start), evidence: { start: hit.start, end: hit.end },
        fix: 'Figure appears in the passage; confirm the anchor word is the same subject.'
      };
    }
    return {
      verdict: VERDICT.UNVERIFIABLE, rule: 'anchor_absent', quote: atom.claimText,
      evidence: null, fix: 'No anchor word to search for; name what the figure measures.'
    };
  }

  const near = sentencesWithRoot(sentences, anchor.root);
  if (!near.length) {
    const hit = extractNumbers(passage).find((n) => numEqual(n.abs, atom.abs) && n.unit === atom.unit);
    if (hit) {
      return {
        verdict: VERDICT.SUPPORTED, rule: 'number_match',
        quote: sentenceAt(passage, hit.start), evidence: { start: hit.start, end: hit.end },
        fix: `The figure appears, but nothing near it says "${anchor.word}".`
      };
    }
    return {
      verdict: VERDICT.UNVERIFIABLE, rule: 'anchor_absent', quote: atom.claimText,
      evidence: null, fix: `"${anchor.word}" is never mentioned; add the passage line that defines it.`
    };
  }

  const figures = near.flatMap((s) =>
    extractNumbers(s.text)
      // Years belong to the date rules, not to the numeric-consistency rule.
      .filter((n) => !(n.raw.length === 4 && n.value >= 1000 && n.value <= 2099))
      .map((n) => ({ ...n, start: n.start + s.start, end: n.end + s.start, sentence: s }))
  );
  const exact = figures.find((n) => numEqual(n.abs, atom.abs) && n.unit === atom.unit);
  if (exact) {
    return {
      verdict: VERDICT.SUPPORTED, rule: 'number_match',
      quote: exact.sentence.text, evidence: { start: exact.start, end: exact.end },
      fix: 'Figure matches; the anchor word lines up.'
    };
  }
  const sameDigits = figures.find((n) => numEqual(n.abs, atom.abs) && n.unit !== atom.unit);
  if (sameDigits) {
    return {
      verdict: VERDICT.UNSUPPORTED, rule: 'number_unit_mismatch',
      quote: sameDigits.sentence.text, evidence: { start: sameDigits.start, end: sameDigits.end },
      fix: `Unit differs: the passage says "${sameDigits.text}", not "${atom.text}".`
    };
  }
  if (figures.length) {
    const closest = figures[0];
    return {
      verdict: VERDICT.UNSUPPORTED, rule: 'number_mismatch',
      quote: closest.sentence.text, evidence: { start: closest.start, end: closest.end },
      fix: `Passage gives ${figures.map((f) => `"${f.text}"`).join(', ')} for ${anchor.word}; reconcile the figure.`
    };
  }
  return {
    verdict: VERDICT.UNVERIFIABLE, rule: 'number_without_figure',
    quote: near[0].text, evidence: { start: near[0].start, end: near[0].end },
    fix: `Passage mentions ${anchor.word} but gives no figure; quote a source figure or drop the number.`
  };
}

export function judgeDate(atom, ctx) {
  const { passage, sentences, claimAtoms, orderConflicts, claimText } = ctx;
  if (orderConflicts.has(atom.id)) {
    const pair = orderConflicts.get(atom.id);
    return {
      verdict: VERDICT.UNSUPPORTED, rule: 'date_order_conflict', quote: claimText,
      evidence: null,
      fix: `Time window is impossible: "${pair}" puts the later date first.`
    };
  }
  const yearRe = new RegExp(`(?<!\\d)${atom.value}(?!\\d)`, 'g');
  const hits = [...passage.matchAll(yearRe)];
  if (hits.length) {
    return {
      verdict: VERDICT.SUPPORTED, rule: 'date_match',
      quote: sentenceAt(passage, hits[0].index), evidence: { start: hits[0].index, end: hits[0].index + 4 },
      fix: 'Year appears; confirm it refers to the same event.'
    };
  }
  const entityAtom = claimAtoms.find((a) => a.type === 'ENTITY');
  if (entityAtom) {
    const near = sentences.filter((s) =>
      entityRanges(s.text, entityAtom.entity).length > 0
    );
    const years = near.flatMap((s) => extractYearsIn(s.text));
    if (years.length) {
      return {
        verdict: VERDICT.UNSUPPORTED, rule: 'date_mismatch',
        quote: near[0].text,
        evidence: { start: near[0].start, end: near[0].end },
        fix: `Passage dates ${entityAtom.text} to ${[...new Set(years.map((y) => y.text))].join(', ')}; use that year.`
      };
    }
  }
  return {
    verdict: VERDICT.UNVERIFIABLE, rule: 'date_absent', quote: atom.claimText,
    evidence: null, fix: 'Year is not in the passage; cite where it comes from.'
  };
}

export function judgeEntity(atom, ctx) {
  const { passage, passageEntities } = ctx;
  const hits = entityRanges(passage, atom.entity);
  if (hits.length) {
    return {
      verdict: VERDICT.SUPPORTED, rule: 'entity_mention', quote: sentenceAt(passage, hits[0].start),
      evidence: { start: hits[0].start, end: hits[0].end },
      fix: 'Entity appears in the passage.'
    };
  }
  const tokens = atom.entity.split(' ');
  if (tokens.length >= 2) {
    const variant = passageEntities.find((e) => {
      const other = e.norm.split(' ');
      if (other.length !== tokens.length) return false;
      const diffs = other.filter((t, i) => t !== tokens[i]);
      return diffs.length === 1;
    });
    if (variant) {
      const range = entityRanges(passage, variant.norm)[0];
      return {
        verdict: VERDICT.UNSUPPORTED, rule: 'entity_variant',
        quote: sentenceAt(passage, range?.start ?? 0),
        evidence: range ? { start: range.start, end: range.end } : null,
        fix: `Passage names "${variant.text}", not "${atom.text}"; check the name.`
      };
    }
  }
  return {
    verdict: VERDICT.UNVERIFIABLE, rule: 'entity_absent', quote: atom.claimText,
    evidence: null, fix: `"${atom.text}" is not mentioned; absence is not disproof, but cite it.`
  };
}

export function judgeCausal(atom, ctx) {
  const { sentences, claimText } = ctx;
  const sentence = bestSentenceFor(claimText, sentences);
  if (!sentence) {
    return {
      verdict: VERDICT.UNVERIFIABLE, rule: 'causal_no_basis', quote: claimText,
      evidence: null, fix: 'No passage sentence shares this wording; anchor the claim to a quoted line.'
    };
  }
  const evidence = { start: sentence.start, end: sentence.end };
  const corr = correlationHits(sentence.text);
  const hedges = hedgeHits(sentence.text);
  const causal = findCausalCues(sentence.text);
  if (corr.length && !causal.length) {
    return {
      verdict: VERDICT.UNSUPPORTED, rule: 'correlation_as_causation', quote: sentence.text,
      evidence,
      fix: `Passage says "${corr[0].text}" only; replace "${atom.text}" with "is associated with".`
    };
  }
  if (hedges.length) {
    return {
      verdict: VERDICT.UNSUPPORTED, rule: 'hedge_weakens_causal', quote: sentence.text,
      evidence,
      fix: `Passage hedges with "${hedges[0].text}"; soften the claim or find stronger evidence.`
    };
  }
  if (causal.length) {
    return {
      verdict: VERDICT.SUPPORTED, rule: 'causal_supported', quote: sentence.text,
      evidence, fix: 'Passage makes the same causal move; quote it directly.'
    };
  }
  return {
    verdict: VERDICT.UNVERIFIABLE, rule: 'causal_unclear', quote: sentence.text,
    evidence, fix: 'Passage sentence is descriptive only; add the causal source line.'
  };
}

export const JUDGES = {
  NUMBER: judgeNumber,
  DATE: judgeDate,
  ENTITY: judgeEntity,
  CAUSAL: judgeCausal
};

export { orderBounds };
