// atomize.js — split a claim into checkable atoms.
//
// An atom is the smallest piece of a claim a deterministic rule can judge:
// a number, a date, a named entity, or a causal assertion. Atomization is
// deliberately shallow (regex + word lists). It will miss paraphrases; the
// README says so, and the app labels its score "rule coverage", not truth.

import {
  MONTHS, STOPWORDS, extractDates, extractNumbers, stem
} from './text.js';

export const ATOM_TYPES = ['NUMBER', 'DATE', 'ENTITY', 'CAUSAL'];

// Phrases that assert one thing made another happen.
export const CAUSAL_CUES = [
  'leads to', 'led to', 'lead to', 'leading to',
  'results in', 'resulted in', 'result in',
  'as a result', 'due to', 'because of', 'because',
  'therefore', 'thus', 'hence', 'consequently',
  'causes', 'caused', 'cause', 'drives', 'drove', 'driven by',
  'fuels', 'fueled', 'fuelled', 'produces', 'produced',
  'triggers', 'triggered', 'shortens', 'shortened', 'lowers', 'lowered',
  'raises', 'raised', 'raise', 'reduces', 'reduced', 'improves', 'improved',
  'boosts', 'boosted', 'increases', 'increased', 'decreases', 'decreased',
  'promotes', 'promoted', 'prevents', 'prevented', 'enables', 'enabled'
];

// Words that add a temporal boundary around a date atom.
export const ORDER_CUES = [
  { cue: 'prior to', bound: 'upper' },
  { cue: 'before', bound: 'upper' },
  { cue: 'until', bound: 'upper' },
  { cue: 'by', bound: 'upper' },
  { cue: 'after', bound: 'lower' },
  { cue: 'since', bound: 'lower' },
  { cue: 'following', bound: 'lower' },
  { cue: 'from', bound: 'lower' }
];

// Hedges: the source is weaker than a flat assertion.
export const HEDGE_CUES = [
  'may', 'might', 'could', 'possibly', 'likely', 'probably', 'arguably',
  'appears to', 'appear to', 'seems to', 'seem to', 'suggests', 'suggest',
  'suggested', 'indicates', 'indicate', 'is consistent with', 'are consistent with',
  'preliminary', 'early trial', 'small sample', 'cautioned', 'cautions',
  'in some cases', 'not yet established', 'unclear'
];

// Correlation-only language: the source shows co-movement, not cause.
export const CORRELATION_CUES = [
  'associated with', 'association between', 'correlate', 'correlates', 'correlated',
  'correlation', 'linked to', 'related to', 'relationship between',
  'coincided', 'coincides', 'alongside', 'tends to', 'tend to',
  'goes with', 'go together', 'higher among', 'more likely among'
];

const LEAD_DETERMINERS = new Set([
  'the', 'a', 'an', 'this', 'that', 'these', 'those', 'its', 'their', 'our', 'his', 'her'
]);

const ENTITY_RE = /[\p{Lu}][\p{L}\p{N}'’\-]*(?:\s+[\p{Lu}][\p{L}\p{N}'’\-]*)*/gu;

function phraseRegex(phrases) {
  const escaped = [...phrases]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return new RegExp(`(?<![\\p{L}])(${escaped})(?![\\p{L}])`, 'giu');
}

const CAUSAL_RE = phraseRegex(CAUSAL_CUES);
const HEDGE_RE = phraseRegex(HEDGE_CUES);
const CORRELATION_RE = phraseRegex(CORRELATION_CUES);

export function findCausalCues(text) {
  const src = String(text ?? '');
  const out = [];
  CAUSAL_RE.lastIndex = 0;
  let m;
  while ((m = CAUSAL_RE.exec(src))) {
    out.push({ text: m[1], start: m.index, end: m.index + m[1].length });
  }
  return out;
}

export function hedgeHits(text) {
  const src = String(text ?? '');
  return [...src.matchAll(HEDGE_RE)]
    .filter((m) => {
      // "May 2019" is a month, not a hedge.
      if (m[1].toLowerCase() !== 'may') return true;
      return !/^\s+(1[0-9]{3}|20[0-9]{2})\b/.test(src.slice(m.index + m[1].length));
    })
    .map((m) => ({ text: m[1], start: m.index, end: m.index + m[1].length }));
}

export function correlationHits(text) {
  return [...String(text ?? '').matchAll(CORRELATION_RE)].map((m) => ({
    text: m[1], start: m.index, end: m.index + m[1].length
  }));
}

// Named entities: runs of capitalized words, with determiners and months
// stripped. A lone capitalized word at the start of a claim is treated as
// ordinary sentence casing, not an entity.
export function extractEntities(text) {
  const src = String(text ?? '');
  const out = [];
  ENTITY_RE.lastIndex = 0;
  let m;
  while ((m = ENTITY_RE.exec(src))) {
    let tokens = m[0].split(/\s+/).filter(Boolean);
    let cursor = m.index;
    while (tokens.length && LEAD_DETERMINERS.has(tokens[0].toLowerCase())) {
      cursor += tokens[0].length + 1;
      tokens = tokens.slice(1);
    }
    while (tokens.length && MONTHS.has(tokens[0].toLowerCase())) {
      cursor += tokens[0].length + 1;
      tokens = tokens.slice(1);
    }
    if (!tokens.length) continue;
    const value = tokens.join(' ');
    if (/^\d+$/.test(value.replace(/\s+/g, ''))) continue;
    const atStart = src.slice(0, m.index).trim().length === 0;
    if (tokens.length === 1 && atStart) continue;
    if (tokens.length === 1 && STOPWORDS.has(value.toLowerCase())) continue;
    out.push({
      text: value,
      start: cursor,
      end: cursor + value.length,
      norm: normalizeEntity(value),
      tokens: value.split(/\s+/)
    });
  }
  return out;
}

export function normalizeEntity(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’']s\b/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function anchorFor(claim, atom) {
  const before = claim.slice(0, atom.start);
  const tokens = [...before.matchAll(/[\p{L}][\p{L}'’\-]*/gu)].map((t) => t[0]);
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const t = tokens[i];
    const low = t.toLowerCase();
    if (!STOPWORDS.has(low) && !MONTHS.has(low)) return { word: t, root: stem(t) };
  }
  const after = claim.slice(atom.end).match(/[\p{L}][\p{L}'’\-]*/u);
  if (after) return { word: after[0], root: stem(after[0]) };
  return null;
}

// Atomize one claim. Atoms never overlap and come back in reading order.
export function atomizeClaim(claim, claimIndex = 0) {
  const src = String(claim ?? '');
  const atoms = [];
  const dates = extractDates(src);
  const dateSpans = dates.map((d) => ({ start: d.start, end: d.end }));

  for (const d of dates) {
    atoms.push({
      type: 'DATE',
      text: d.text,
      start: d.start,
      end: d.end,
      value: d.value,
      norm: `date:${d.value}`
    });
  }

  for (const n of extractNumbers(src)) {
    const insideDate = dateSpans.some((s) => n.start < s.end && s.start < n.end);
    if (insideDate) continue;
    const anchor = anchorFor(src, n);
    atoms.push({
      type: 'NUMBER',
      text: n.text,
      start: n.start,
      end: n.end,
      value: n.value,
      abs: n.abs,
      unit: n.unit,
      anchor,
      norm: `number:${n.abs}:${n.unit}`
    });
  }

  for (const e of extractEntities(src)) {
    atoms.push({
      type: 'ENTITY',
      text: e.text,
      start: e.start,
      end: e.end,
      norm: `entity:${e.norm}`,
      entity: e.norm,
      tokens: e.tokens
    });
  }

  for (const c of findCausalCues(src)) {
    atoms.push({
      type: 'CAUSAL',
      text: c.text,
      start: c.start,
      end: c.end,
      cue: c.text.toLowerCase(),
      norm: `causal:${c.text.toLowerCase()}`
    });
  }

  // Causal cues inside an entity run (rare) lose to the entity.
  const filtered = atoms.filter((a) => {
    if (a.type !== 'CAUSAL') return true;
    return !atoms.some((b) => b.type === 'ENTITY' && a.start >= b.start && a.end <= b.end);
  });

  filtered.sort((a, b) => a.start - b.start || b.end - a.end || a.type.localeCompare(b.type));
  const deduped = [];
  for (const a of filtered) {
    const clash = deduped.some((b) => a.start < b.end && b.start < a.end);
    if (!clash) deduped.push(a);
  }

  return deduped.map((a, i) => ({
    ...a,
    id: `c${claimIndex}a${i}`,
    claimIndex,
    claimText: src
  }));
}

// Ordering bounds: "after 2015", "before 2010", "between 2001 and 1998".
export function orderBounds(claim, dateAtoms) {
  const src = String(claim ?? '');
  const bounds = [];
  for (const d of dateAtoms) {
    const lead = src.slice(Math.max(0, d.start - 16), d.start).toLowerCase();
    let best = null;
    for (const { cue, bound } of ORDER_CUES) {
      const re = new RegExp(`(^|[^\\p{L}])${cue.replace(/ /g, '\\s+')}\\s*$`, 'u');
      if (re.test(lead) && (!best || cue.length > best.cue.length)) best = { cue, bound };
    }
    if (best) bounds.push({ date: d, ...best });
  }
  // "between A and B": A is the lower bound, B the upper.
  const between = /between\s+(?:\w+\s+){0,3}?(\d{4})\s+and\s+(?:\w+\s+){0,3}?(\d{4})/i.exec(src);
  if (between) {
    const first = dateAtoms.find((d) => d.start >= between.index && String(d.value) === between[1]);
    const second = dateAtoms.find((d) => d.start > (first?.start ?? -1) && String(d.value) === between[2]);
    if (first) bounds.push({ date: first, cue: 'between', bound: 'lower' });
    if (second) bounds.push({ date: second, cue: 'between ... and', bound: 'upper' });
  }
  return bounds;
}

// Split a claim list. Accepts newline bullets, numbered lists, or semicolons.
export function splitClaims(input) {
  const src = String(input ?? '');
  return src
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length > 0);
}
