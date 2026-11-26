// analyze.js — orchestrate atomization and rules into one report.

import { atomizeClaim, extractEntities, orderBounds, splitClaims } from './atomize.js';
import { JUDGES, RULES, VERDICT } from './rules.js';
import { splitSentences } from './text.js';

const PRIORITY = {
  [VERDICT.UNSUPPORTED]: 3,
  [VERDICT.SUPPORTED]: 2,
  [VERDICT.UNVERIFIABLE]: 1
};

function orderConflictMap(claimAtoms) {
  const dates = claimAtoms.filter((a) => a.type === 'DATE');
  const bounds = orderBounds(claimAtoms[0]?.claimText ?? '', dates);
  const lower = bounds.filter((b) => b.bound === 'lower');
  const upper = bounds.filter((b) => b.bound === 'upper');
  const conflicts = new Map();
  for (const lo of lower) {
    for (const up of upper) {
      if (lo.date.value >= up.date.value) {
        const note = `${lo.cue} ${lo.date.value} ... ${up.cue} ${up.date.value}`;
        conflicts.set(lo.date.id, note);
        conflicts.set(up.date.id, note);
      }
    }
  }
  return conflicts;
}

function passageMarks(atoms, passage) {
  const sentences = splitSentences(passage);
  const marks = new Map();
  for (const atom of atoms) {
    if (!atom.evidence) continue;
    const sentence = sentences.find((s) =>
      atom.evidence.start >= s.start && atom.evidence.start < s.end);
    if (!sentence) continue;
    const key = sentence.start;
    const prev = marks.get(key);
    if (!prev || PRIORITY[atom.verdict] > PRIORITY[prev.verdict]) {
      marks.set(key, { start: sentence.start, end: sentence.end, verdict: atom.verdict });
    }
  }
  return [...marks.values()].sort((a, b) => a.start - b.start);
}

function verdictOfClaim(atoms) {
  if (!atoms.length) return VERDICT.UNVERIFIABLE;
  if (atoms.some((a) => a.verdict === VERDICT.UNSUPPORTED)) return VERDICT.UNSUPPORTED;
  if (atoms.some((a) => a.verdict === VERDICT.UNVERIFIABLE)) return VERDICT.UNVERIFIABLE;
  return VERDICT.SUPPORTED;
}

export function analyze({ passage = '', claims = [] } = {}) {
  const passageText = typeof passage === 'string' ? passage : String(passage ?? '');
  const claimList = Array.isArray(claims)
    ? claims.map((c) => String(c ?? '')).filter((c) => c.trim())
    : splitClaims(claims);

  const sentences = splitSentences(passageText);
  const passageEntities = extractEntities(passageText);

  const atoms = [];
  const claimSummaries = [];

  claimList.forEach((claim, index) => {
    const claimAtoms = atomizeClaim(claim, index);
    const orderConflicts = orderConflictMap(claimAtoms);
    const ctx = {
      passage: passageText,
      sentences,
      passageEntities,
      claimText: claim,
      claimAtoms,
      orderConflicts
    };
    const judged = claimAtoms.map((atom) => {
      const judge = JUDGES[atom.type];
      const result = judge
        ? judge(atom, ctx)
        : {
            verdict: VERDICT.UNVERIFIABLE,
            rule: 'unsupported_atom',
            quote: claim,
            evidence: null,
            fix: 'This atom type has no rule.'
          };
      return { ...atom, ...result };
    });
    atoms.push(...judged);
    claimSummaries.push({
      index,
      text: claim,
      verdict: verdictOfClaim(judged),
      atomCount: judged.length
    });
  });

  const counts = {
    [VERDICT.SUPPORTED]: 0,
    [VERDICT.UNSUPPORTED]: 0,
    [VERDICT.UNVERIFIABLE]: 0
  };
  for (const a of atoms) counts[a.verdict] += 1;

  const total = atoms.length;
  const score = total === 0 ? null : Math.round((counts[VERDICT.SUPPORTED] / total) * 100);

  const rulesSeen = [...new Set(atoms.map((a) => a.rule))]
    .map((id) => RULES.find((r) => r.id === id) ?? { id, family: 'Other', fires: '' });

  return {
    passage: passageText,
    claims: claimList,
    atoms,
    claimSummaries,
    counts,
    totalAtoms: total,
    score,
    scoreLabel: 'rule-coverage score',
    scoreNote:
      'Percent of atoms that matched a passage span. This is rule coverage, not truth: ' +
      'ClaimCheck never checks the passage against the world.',
    rulesSeen,
    passageMarks: passageMarks(atoms, passageText)
  };
}

export function normalizeVerdictOption(verdict) {
  return verdict === VERDICT.UNVERIFIABLE ? 'UNVERIFIABLE' : verdict;
}
