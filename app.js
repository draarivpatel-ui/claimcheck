// app.js — ClaimCheck UI. Reads the same src/ modules the tests exercise.

import { analyze } from './src/index.js';
import { diffAnalyses } from './src/diff.js';
import { SAMPLES, REVISION_CLAIMS, sampleById } from './src/samples.js';
import { RULES, VERDICT } from './src/rules.js';
import { escapeHtml } from './src/text.js';

const $ = (sel, root = document) => root.querySelector(sel);
const els = {
  samples: $('#samples'),
  passage: $('#passage'),
  claims: $('#claims'),
  analyze: $('#analyze'),
  clear: $('#clear'),
  scoreValue: $('#score-value'),
  scorePct: $('#score-pct'),
  scoreFrac: $('#score-frac'),
  scoreBar: $('#score-bar'),
  scoreNote: $('#score-note'),
  counts: $('#counts'),
  passageView: $('#passage-view'),
  atomBody: $('#atom-body'),
  atomCount: $('#atom-count'),
  revision: $('#revision'),
  compare: $('#compare'),
  restore: $('#restore-revision'),
  diffSummary: $('#diff-summary'),
  diffRows: $('#diff-rows'),
  diffCount: $('#diff-count'),
  ruleBody: $('#rule-body')
};

const state = { base: null, revision: null, sample: null, tab: 'verify' };

const SHORT = {
  [VERDICT.SUPPORTED]: 'SUPPORTED',
  [VERDICT.UNSUPPORTED]: 'UNSUPPORTED',
  [VERDICT.UNVERIFIABLE]: 'UNVERIFIABLE'
};
const CLASS = {
  [VERDICT.SUPPORTED]: 'sup',
  [VERDICT.UNSUPPORTED]: 'uns',
  [VERDICT.UNVERIFIABLE]: 'unv'
};
const verdictBadge = (v) =>
  `<span class="verdict ${CLASS[v]}" title="${escapeHtml(v)}">${SHORT[v] ?? escapeHtml(v)}</span>`;

/* --------------------------------------------------------------- analysis */

function runAnalysis({ quiet = false } = {}) {
  const report = analyze({ passage: els.passage.value, claims: els.claims.value });
  const previousClaims = state.base?.claims ?? [];
  state.base = report;
  state.revision = null;
  renderReport(report);
  if (!els.revision.value.trim() || els.revision.value.trim() === previousClaims.join('\n')) {
    els.revision.value = report.claims.join('\n');
  }
  if (!quiet) resetDiff();
  return report;
}

function renderReport(report) {
  const { score, counts, totalAtoms } = report;
  els.scoreValue.textContent = score === null ? '–' : String(score);
  els.scorePct.style.visibility = score === null ? 'hidden' : 'visible';
  els.scoreFrac.textContent = totalAtoms
    ? `${counts[VERDICT.SUPPORTED]} of ${totalAtoms} atoms matched a passage span`
    : 'No atoms found — add a number, date, name or causal verb';
  els.scoreBar.style.width = `${score ?? 0}%`;
  els.scoreNote.textContent = report.scoreNote;

  els.counts.innerHTML = [
    `<span class="count">${totalAtoms} atoms</span>`,
    `<span class="count sup"><b>${counts[VERDICT.SUPPORTED]}</b> supported</span>`,
    `<span class="count uns"><b>${counts[VERDICT.UNSUPPORTED]}</b> unsupported</span>`,
    `<span class="count unv"><b>${counts[VERDICT.UNVERIFIABLE]}</b> unverifiable</span>`
  ].join('');

  els.atomCount.textContent = `${totalAtoms} atom${totalAtoms === 1 ? '' : 's'}`;
  renderAtoms(report);
  renderPassage(report);
}

function renderAtoms(report) {
  if (!report.atoms.length) {
    els.atomBody.innerHTML = `<tr><td colspan="6"><div class="empty">No atoms yet. Paste a passage and one claim per line, then press Check claims.</div></td></tr>`;
    return;
  }
  els.atomBody.innerHTML = report.atoms.map((atom) => {
    const span = atom.evidence
      ? `passage ${atom.evidence.start}–${atom.evidence.end} · claim ${atom.start}–${atom.end}`
      : `no passage span · claim ${atom.start}–${atom.end}`;
    return `<tr>
      <td><span class="atom-text">${escapeHtml(atom.text)}</span>
          <span class="atom-claim">claim ${atom.claimIndex + 1}</span></td>
      <td><span class="type-chip">${atom.type}</span></td>
      <td>${verdictBadge(atom.verdict)}</td>
      <td><span class="rule-id">${escapeHtml(atom.rule)}</span></td>
      <td><span class="quote">${atom.quote ? `“${escapeHtml(atom.quote)}”` : '—'}</span>
          <span class="span">${span}</span></td>
      <td><span class="fix">${escapeHtml(atom.fix)}</span></td>
    </tr>`;
  }).join('');
}

function renderPassage(report) {
  const text = report.passage;
  if (!text.trim()) {
    els.passageView.innerHTML = '<span class="micro">No passage yet.</span>';
    return;
  }
  const marks = report.passageMarks ?? [];
  let html = '';
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    html += escapeHtml(text.slice(cursor, mark.start));
    html += `<mark class="${CLASS[mark.verdict]}">${escapeHtml(text.slice(mark.start, mark.end))}</mark>`;
    cursor = mark.end;
  }
  html += escapeHtml(text.slice(cursor));
  els.passageView.innerHTML = html;
}

/* ------------------------------------------------------------------ diff */

function resetDiff() {
  state.revision = null;
  els.diffSummary.innerHTML =
    '<p class="micro">Run a comparison to see verdict changes against the analysis in the Verify tab.</p>';
  els.diffRows.innerHTML = '';
  els.diffCount.textContent = '';
}

function compareRevisions() {
  if (!state.base) runAnalysis({ quiet: true });
  if (!els.revision.value.trim()) {
    els.diffSummary.innerHTML = '<p class="micro">Paste a revised claim list first.</p>';
    return;
  }
  const next = analyze({ passage: els.passage.value, claims: els.revision.value });
  const diff = diffAnalyses(state.base, next);
  state.revision = next;
  renderDiff(diff);
}

function renderDiff(diff) {
  const { summary } = diff;
  const delta = diff.scoreDelta;
  const deltaClass = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';
  const deltaText = delta === 0 ? '±0' : delta > 0 ? `+${delta}` : `${delta}`;
  const before = diff.scoreBefore === null ? '–' : `${diff.scoreBefore}%`;
  const after = diff.scoreAfter === null ? '–' : `${diff.scoreAfter}%`;

  els.diffSummary.innerHTML = `
    <div class="diff-headline">
      <div class="diff-score">
        <span class="from">${before}</span>
        <span class="arrow">→</span>
        <span class="to">${after}</span>
        <span class="delta ${deltaClass}">${deltaText} pts</span>
      </div>
      <div class="counts">
        <span class="count unv"><b>${summary.changed}</b> changed</span>
        <span class="count sup"><b>${summary.added}</b> added</span>
        <span class="count uns"><b>${summary.removed}</b> removed</span>
        <span class="count"><b>${summary.same}</b> unchanged</span>
      </div>
    </div>
    <p class="micro">Atoms pair by bullet position, type, and order inside the bullet. The score moves with rule coverage only, never with truth.</p>`;

  els.diffCount.textContent = `${diff.rows.length} rows`;

  if (!diff.rows.length) {
    els.diffRows.innerHTML = '<div class="empty">Both revisions are empty.</div>';
    return;
  }

  els.diffRows.innerHTML = diff.rows.map((row) => {
    const pair = row.status === 'removed'
      ? `${verdictBadge(row.from)}<span class="sep">→</span><span class="micro">gone</span>`
      : row.status === 'added'
        ? `<span class="micro">new</span><span class="sep">→</span>${verdictBadge(row.to)}`
        : `${verdictBadge(row.from)}<span class="sep">→</span>${verdictBadge(row.to)}`;
    return `<div class="diff-row ${row.status}">
      <span class="status">${row.status}</span>
      <span class="type-chip">${row.type}</span>
      <span class="atom-text">${escapeHtml(row.atomText)}</span>
      <span class="verdict-pair">${pair}</span>
      <span class="claim">${escapeHtml(row.claimText)}</span>
    </div>`;
  }).join('');
}

/* ------------------------------------------------------------------ views */

function switchTab(name) {
  state.tab = name;
  for (const tab of document.querySelectorAll('.tab')) {
    const on = tab.dataset.tab === name;
    tab.classList.toggle('is-active', on);
    tab.setAttribute('aria-selected', String(on));
  }
  for (const view of document.querySelectorAll('.view')) {
    view.hidden = view.id !== `view-${name}`;
  }
}

function renderSamples() {
  els.samples.innerHTML = SAMPLES.map((s) =>
    `<button class="sample" data-sample="${s.id}" title="${escapeHtml(s.blurb)}">${escapeHtml(s.title)}</button>`
  ).join('');
  els.samples.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sample]');
    if (!btn) return;
    loadSample(sampleById(btn.dataset.sample));
  });
}

function loadSample(sample) {
  if (!sample) return;
  state.sample = sample.id;
  els.passage.value = sample.passage;
  els.claims.value = sample.claims;
  els.revision.value = '';
  for (const btn of els.samples.querySelectorAll('[data-sample]')) {
    btn.classList.toggle('is-active', btn.dataset.sample === sample.id);
  }
  runAnalysis();
  resetDiff();
}

function renderRulebook() {
  const verdictCell = (v) => verdictBadge(v);
  els.ruleBody.innerHTML = RULES.map((r) =>
    `<tr>
      <td>${escapeHtml(r.id)}</td>
      <td>${escapeHtml(r.family)}</td>
      <td>${verdictCell(r.verdict)}</td>
      <td>${escapeHtml(r.fires)}</td>
    </tr>`
  ).join('');
}

/* ------------------------------------------------------------------- init */

function init() {
  renderSamples();
  renderRulebook();

  els.analyze.addEventListener('click', () => runAnalysis());
  els.clear.addEventListener('click', () => {
    els.passage.value = '';
    els.claims.value = '';
    els.revision.value = '';
    state.base = null;
    state.sample = null;
    for (const btn of els.samples.querySelectorAll('[data-sample]')) btn.classList.remove('is-active');
    renderReport(analyze({ passage: '', claims: [] }));
    resetDiff();
  });
  els.compare.addEventListener('click', compareRevisions);
  els.restore.addEventListener('click', () => {
    els.revision.value = state.base ? state.base.claims.join('\n') : '';
    resetDiff();
  });

  for (const btn of document.querySelectorAll('.tab')) {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  }

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (state.tab === 'reader') compareRevisions();
      else runAnalysis();
    }
  });

  const scene = new URLSearchParams(location.search).get('scene');
  if (scene === 'diff') {
    loadSample(sampleById('dam'));
    switchTab('reader');
    els.revision.value = REVISION_CLAIMS;
    compareRevisions();
    return;
  }
  const sample = sampleById(scene) ?? SAMPLES[0];
  loadSample(sample);
}

init();
