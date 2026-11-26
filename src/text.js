// text.js — shared text primitives for ClaimCheck.
// Everything here is deterministic and dependency-free: no regex state leaks,
// no locale surprises beyond Unicode case folding.

export const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'from', 'by', 'with', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'it', 'its', 'this', 'that', 'these', 'those', 'which', 'who', 'whom', 'whose',
  'than', 'then', 'into', 'over', 'under', 'after', 'before', 'between', 'during',
  'about', 'not', 'no', 'if', 'when', 'while', 'also', 'only', 'more', 'most',
  'less', 'least', 'very', 'can', 'could', 'may', 'might', 'will', 'would',
  'should', 'does', 'do', 'did', 'has', 'have', 'had', 'we', 'they', 'he', 'she',
  'i', 'you', 'our', 'their', 'his', 'her', 'there', 'here', 'same', 'such'
]);

export const MONTHS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec'
]);

// Sentence splitter that keeps offsets. A terminator only ends a sentence when
// whitespace or end-of-text follows, so "3.4" and "1.2 million" stay intact.
export function splitSentences(text) {
  const src = String(text ?? '');
  const out = [];
  const re = /[.!?]+(?=\s|$)/g;
  let start = 0;
  let m;
  while ((m = re.exec(src))) {
    const end = m.index + m[0].length;
    const raw = src.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    if (raw.trim()) out.push({ text: raw.trim(), start: start + lead, end });
    start = end;
  }
  if (start < src.length) {
    const raw = src.slice(start);
    const lead = raw.length - raw.trimStart().length;
    if (raw.trim()) out.push({ text: raw.trim(), start: start + lead, end: src.length });
  }
  return out;
}

export function words(text) {
  return String(text ?? '').toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) ?? [];
}

export function contentWords(text) {
  return words(text).filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

// Rough singular form used for anchor matching ("gates" -> "gate").
export function stem(word) {
  const w = String(word ?? '').toLowerCase();
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('es') && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

// Numeric atom extraction: "1,200,000", "1.2 million", "3.4", "47%", "9".
const NUM_RE = /(?<![\p{L}\p{N}])(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\p{L}\p{N}])/gu;
const UNIT_AFTER_RE = /^\s?(%|percent|percentage points?|million|billion|thousand|x)\b/i;

export function extractNumbers(text) {
  const src = String(text ?? '');
  const out = [];
  NUM_RE.lastIndex = 0;
  let m;
  while ((m = NUM_RE.exec(src))) {
    const raw = m[0];
    const tail = src.slice(m.index + raw.length);
    const um = UNIT_AFTER_RE.exec(tail);
    let unit = 'plain';
    let unitText = '';
    let mult = 1;
    if (um) {
      const u = um[1].toLowerCase();
      unitText = um[1];
      if (u === '%' || u.startsWith('percent')) unit = 'pct';
      else if (u === 'million') { mult = 1e6; unit = 'plain'; }
      else if (u === 'billion') { mult = 1e9; unit = 'plain'; }
      else if (u === 'thousand') { mult = 1e3; unit = 'plain'; }
    }
    const value = Number(raw.replace(/,/g, ''));
    const end = m.index + raw.length + (um ? um[0].length : 0);
    out.push({
      start: m.index,
      end,
      text: src.slice(m.index, end).trim(),
      raw,
      value,
      abs: value * mult,
      unit,
      unitText
    });
  }
  return out;
}

// Years are pulled out separately so "1962" is a date atom, not a number atom.
const YEAR_RE = /\b(1[0-9]{3}|20[0-9]{2})\b/g;

export function extractDates(text) {
  const src = String(text ?? '');
  const out = [];
  YEAR_RE.lastIndex = 0;
  let m;
  while ((m = YEAR_RE.exec(src))) {
    out.push({
      start: m.index,
      end: m.index + m[0].length,
      text: m[0],
      value: Number(m[0]),
      kind: 'year'
    });
  }
  return out;
}

export function extractYearsIn(text) {
  return extractDates(text);
}

// The sentence containing an absolute offset in the passage.
export function sentenceAt(passage, index) {
  const src = String(passage ?? '');
  const list = splitSentences(src);
  const hit = list.find((s) => index >= s.start && index < s.end);
  if (hit) return hit.text;
  if (!list.length) return src.trim().slice(0, 160);
  const nearest = list.reduce((best, s) =>
    Math.abs(s.start - index) < Math.abs(best.start - index) ? s : best, list[0]);
  return nearest.text;
}

// Sentences that mention an anchor root ("gate" also matches "gates").
export function sentencesWithRoot(sentences, root) {
  const r = String(root ?? '').toLowerCase();
  if (!r) return [];
  return sentences.filter((s) => s.text.toLowerCase().includes(r));
}

export function escapeReg(s) {
  return String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normPhrase(s) {
  return String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

export function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

export function includesRange(outer, inner) {
  return inner.start >= outer.start && inner.end <= outer.end;
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
