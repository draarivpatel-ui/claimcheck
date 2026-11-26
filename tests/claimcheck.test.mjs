import test from 'node:test';
import assert from 'node:assert/strict';

import {
  analyze, diffAnalyses, atomizeClaim, splitClaims, splitSentences,
  extractEntities, hedgeHits, findCausalCues, extractNumbers,
  VERDICT, RULES, SAMPLES, REVISION_CLAIMS,
  sentenceAt, keyAtoms
} from '../src/index.js';

const run = (passage, claims) => analyze({ passage, claims });
const find = (report, type, text) => report.atoms.find((a) => a.type === type && a.text === text);
const verdictOf = (report, type, text) => find(report, type, text)?.verdict;

const DAM = SAMPLES.find((s) => s.id === 'dam');
const HEAT = SAMPLES.find((s) => s.id === 'heat');
const HOLLIS = SAMPLES.find((s) => s.id === 'hollis');

// ---------------------------------------------------------------- atomization

test('years become DATE atoms and are not double-counted as NUMBER atoms', () => {
  const atoms = atomizeClaim('Completed in 1962.', 0);
  assert.equal(atoms.filter((a) => a.type === 'DATE').length, 1);
  assert.equal(atoms.find((a) => a.type === 'DATE').value, 1962);
  assert.equal(atoms.filter((a) => a.type === 'NUMBER').length, 0);
});

test('numeric atoms carry value, absolute value, and unit', () => {
  const atoms = atomizeClaim('The plant employs 1.2 million people.', 0);
  const n = atoms.find((a) => a.type === 'NUMBER');
  assert.equal(n.text, '1.2 million');
  assert.equal(n.value, 1.2);
  assert.equal(n.abs, 1.2e6);
  assert.equal(n.unit, 'plain');
});

test('percent is its own unit class', () => {
  const n = atomizeClaim('Output rose 12 percent.', 0).find((a) => a.type === 'NUMBER');
  assert.equal(n.unit, 'pct');
  assert.equal(n.text, '12 percent');
});

test('every atom span slices back to the atom text (samples)', () => {
  for (const sample of SAMPLES) {
    for (const claim of splitClaims(sample.claims)) {
      for (const atom of atomizeClaim(claim, 0)) {
        assert.equal(claim.slice(atom.start, atom.end), atom.text, `${atom.type} span in: ${claim}`);
      }
    }
  }
});

test('multiword entities drop a leading determiner', () => {
  const e = extractEntities('The Meridian Dam was completed.').find((x) => x.text === 'Meridian Dam');
  assert.ok(e);
  assert.equal(e.start, 4);
});

test('a lone sentence-initial capital is not treated as an entity', () => {
  const e = extractEntities('Neighborhoods with more tree cover are cooler.');
  assert.equal(e.length, 0);
});

test('months are not entities', () => {
  const e = extractEntities('The vote happened in May 2019.');
  assert.equal(e.some((x) => x.text === 'May'), false);
});

test('causal cues are found with offsets', () => {
  const cues = findCausalCues('Rates rose because supply fell.');
  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, 'because');
  assert.equal('Rates rose because supply fell.'.slice(cues[0].start, cues[0].end), 'because');
});

test('atom lists are ordered and never overlap', () => {
  const atoms = atomizeClaim('The Meridian Dam added 9 gates in 1998 after a review.', 0);
  for (let i = 1; i < atoms.length; i += 1) {
    assert.ok(atoms[i - 1].end <= atoms[i].start, 'atoms overlap or are out of order');
  }
});

test('claim splitting strips bullets, numbers, and blank lines', () => {
  const claims = splitClaims('- one\n\n2) two\n• three\n');
  assert.deepEqual(claims, ['one', 'two', 'three']);
});

test('sentence splitting keeps offsets and decimal numbers intact', () => {
  const text = 'Temperatures fell 3.4 degrees. Costs rose.';
  const parts = splitSentences(text);
  assert.equal(parts.length, 2);
  assert.equal(text.slice(parts[0].start, parts[0].end), 'Temperatures fell 3.4 degrees.');
});

// ------------------------------------------------------------------- numbers

test('number_match: a figure with the same anchor is SUPPORTED', () => {
  const r = run('The reservoir supplies water to 1.2 million residents.', ['Water reaches 1.2 million residents.']);
  assert.equal(verdictOf(r, 'NUMBER', '1.2 million'), VERDICT.SUPPORTED);
  assert.equal(find(r, 'NUMBER', '1.2 million').rule, 'number_match');
});

test('number_match compares values, not formatting (1.2 million vs 1,200,000)', () => {
  const r = run('The plant employs 1,200,000 people.', ['The plant employs 1.2 million people.']);
  assert.equal(verdictOf(r, 'NUMBER', '1.2 million'), VERDICT.SUPPORTED);
});

test('number_mismatch: same anchor, different figure is UNSUPPORTED with a quote', () => {
  const r = run('In 1998 the spillway was widened to 9 gates.', ['The spillway was widened to 12 gates.']);
  const n = find(r, 'NUMBER', '12');
  assert.equal(n.verdict, VERDICT.UNSUPPORTED);
  assert.equal(n.rule, 'number_mismatch');
  assert.match(n.quote, /9 gates/);
  assert.ok(n.fix.length > 0);
});

test('number_mismatch ignores years when comparing figures', () => {
  const r = run('In 1998 the spillway was widened to 9 gates.', ['The spillway was widened to 12 gates in 1998.']);
  const n = find(r, 'NUMBER', '12');
  assert.equal(n.rule, 'number_mismatch');
  assert.equal(r.passage.slice(n.evidence.start, n.evidence.end), '9');
});

test('number_unit_mismatch: same digits, different unit', () => {
  const r = run('Coverage reached 12 blocks.', ['Coverage reached 12 percent of blocks.']);
  assert.equal(verdictOf(r, 'NUMBER', '12 percent'), VERDICT.UNSUPPORTED);
  assert.equal(find(r, 'NUMBER', '12 percent').rule, 'number_unit_mismatch');
});

test('number_without_figure: anchor present but no figure', () => {
  const r = run('An early trial reported that recovery was faster.', ['The trial reported 2 days of faster recovery.']);
  const n = r.atoms.find((a) => a.type === 'NUMBER');
  assert.equal(n.verdict, VERDICT.UNVERIFIABLE);
  assert.equal(n.rule, 'number_without_figure');
});

test('anchor_absent: nothing in the passage is about the figure', () => {
  const r = run('Throughput rose sharply.', ['Latency fell by 40 percent.']);
  assert.equal(verdictOf(r, 'NUMBER', '40 percent'), VERDICT.UNVERIFIABLE);
  assert.equal(find(r, 'NUMBER', '40 percent').rule, 'anchor_absent');
});

// --------------------------------------------------------------------- dates

test('date_match: a year in the passage is SUPPORTED', () => {
  const r = run(DAM.passage, DAM.claims);
  assert.equal(verdictOf(r, 'DATE', '1962'), VERDICT.SUPPORTED);
  assert.equal(find(r, 'DATE', '1962').rule, 'date_match');
});

test('date_mismatch: the passage dates the same entity differently', () => {
  const r = run(DAM.passage, DAM.claims);
  const d = find(r, 'DATE', '1975');
  assert.equal(d.verdict, VERDICT.UNSUPPORTED);
  assert.equal(d.rule, 'date_mismatch');
  assert.match(d.fix, /1962/);
});

test('date_absent: a year nobody mentioned is UNVERIFIABLE', () => {
  const r = run('The bridge opened to traffic.', ['The bridge opened in 1931.']);
  const d = find(r, 'DATE', '1931');
  assert.equal(d.verdict, VERDICT.UNVERIFIABLE);
  assert.equal(d.rule, 'date_absent');
});

test('date_order_conflict: an impossible window is UNSUPPORTED', () => {
  const r = run('The site operated for decades.', ['The site was active after 2015 and before 2010.']);
  assert.equal(verdictOf(r, 'DATE', '2015'), VERDICT.UNSUPPORTED);
  assert.equal(verdictOf(r, 'DATE', '2010'), VERDICT.UNSUPPORTED);
  assert.equal(find(r, 'DATE', '2015').rule, 'date_order_conflict');
});

test('a coherent window (between 2016 and 2019) raises no conflict', () => {
  const r = run(HOLLIS.passage, HOLLIS.claims);
  assert.equal(verdictOf(r, 'DATE', '2016'), VERDICT.SUPPORTED);
  assert.equal(verdictOf(r, 'DATE', '2019'), VERDICT.SUPPORTED);
});

// ------------------------------------------------------------------ entities

test('entity_mention: SUPPORTED with the exact evidence span', () => {
  const r = run(HOLLIS.passage, HOLLIS.claims);
  const e = find(r, 'ENTITY', 'Hollis Protocol');
  assert.equal(e.verdict, VERDICT.SUPPORTED);
  assert.equal(e.rule, 'entity_mention');
  assert.equal(HOLLIS.passage.slice(e.evidence.start, e.evidence.end).toLowerCase(), 'hollis protocol');
});

test('entity_variant: one token differs, so the claim is UNSUPPORTED', () => {
  const r = run('The Voting Rights Act expanded federal oversight.', ['The Voting Rights Bill expanded oversight.']);
  const e = find(r, 'ENTITY', 'Voting Rights Bill');
  assert.equal(e.verdict, VERDICT.UNSUPPORTED);
  assert.equal(e.rule, 'entity_variant');
  assert.match(e.fix, /Voting Rights Act/);
});

test('entity_absent: silence is UNVERIFIABLE, not a refutation', () => {
  const r = run('The program ran for three years.', ['The Halverson Initiative ran for three years.']);
  const e = find(r, 'ENTITY', 'Halverson Initiative');
  assert.equal(e.verdict, VERDICT.UNVERIFIABLE);
  assert.equal(e.rule, 'entity_absent');
});

// -------------------------------------------------------------------- causal

test('correlation_as_causation: association reported as cause', () => {
  const r = run(HEAT.passage, HEAT.claims);
  const c = find(r, 'CAUSAL', 'causes');
  assert.equal(c.verdict, VERDICT.UNSUPPORTED);
  assert.equal(c.rule, 'correlation_as_causation');
  assert.match(c.fix, /associated with/);
});

test('correlation_as_causation also fires on "correlate"', () => {
  const r = run(HEAT.passage, HEAT.claims);
  assert.equal(find(r, 'CAUSAL', 'raise').rule, 'correlation_as_causation');
});

test('hedge_weakens_causal: "may" in the passage weakens a flat claim', () => {
  const r = run(HOLLIS.passage, HOLLIS.claims);
  const c = find(r, 'CAUSAL', 'shortens');
  assert.equal(c.verdict, VERDICT.UNSUPPORTED);
  assert.equal(c.rule, 'hedge_weakens_causal');
});

test('hedged passage that also carries a causal verb still counts as hedging', () => {
  const r = run('The treatment may shorten recovery in some cases.', ['The treatment shortens recovery.']);
  assert.equal(r.atoms.find((a) => a.type === 'CAUSAL').rule, 'hedge_weakens_causal');
});

test('causal_supported: the passage makes the same causal move', () => {
  const r = run('The tax cut caused the surplus.', ['The tax cut caused the surplus.']);
  const c = r.atoms.find((a) => a.type === 'CAUSAL');
  assert.equal(c.verdict, VERDICT.SUPPORTED);
  assert.equal(c.rule, 'causal_supported');
});

test('causal_unclear: matching sentence with no causal or correlational cue', () => {
  const r = run('Rain fell on Tuesday.', ['Rain caused the flood.']);
  const c = r.atoms.find((a) => a.type === 'CAUSAL');
  assert.equal(c.verdict, VERDICT.UNVERIFIABLE);
  assert.equal(c.rule, 'causal_unclear');
});

test('causal_no_basis: no passage sentence shares the claim wording', () => {
  const r = run('The archive holds 400 maps.', ['Deforestation drives flooding.']);
  const c = r.atoms.find((a) => a.type === 'CAUSAL');
  assert.equal(c.verdict, VERDICT.UNVERIFIABLE);
  assert.equal(c.rule, 'causal_no_basis');
});

test('"May 2019" is a month, not a hedge', () => {
  assert.equal(hedgeHits('The vote happened in May 2019.').length, 0);
  assert.equal(hedgeHits('Costs may rise.').length, 1);
});

// --------------------------------------------------------------------- score

test('score is supported atoms over all atoms, rounded', () => {
  const r = run('The pump moved 5 liters.', ['The pump moved 5 liters.', 'The pump moved 9 liters.']);
  assert.equal(r.totalAtoms, 2);
  assert.equal(r.counts[VERDICT.SUPPORTED], 1);
  assert.equal(r.counts[VERDICT.UNSUPPORTED], 1);
  assert.equal(r.score, 50);
});

test('empty input yields a null score and no atoms', () => {
  const r = run('', []);
  assert.equal(r.totalAtoms, 0);
  assert.equal(r.score, null);
});

test('counts always sum to the atom total', () => {
  for (const sample of SAMPLES) {
    const r = run(sample.passage, sample.claims);
    const sum = Object.values(r.counts).reduce((a, b) => a + b, 0);
    assert.equal(sum, r.totalAtoms);
  }
});

test('the score is labeled as rule coverage, not truth', () => {
  const r = run(DAM.passage, DAM.claims);
  assert.equal(r.scoreLabel, 'rule-coverage score');
  assert.match(r.scoreNote, /rule coverage, not truth/);
});

test('each claim gets a worst-verdict summary', () => {
  const r = run(DAM.passage, DAM.claims);
  assert.equal(r.claimSummaries[2].verdict, VERDICT.UNSUPPORTED);
  assert.equal(r.claimSummaries[0].verdict, VERDICT.SUPPORTED);
});

test('every rule that fired is documented in RULES', () => {
  const ids = new Set(RULES.map((r) => r.id));
  for (const sample of SAMPLES) {
    for (const atom of run(sample.passage, sample.claims).atoms) {
      assert.ok(ids.has(atom.rule), `undocumented rule ${atom.rule}`);
    }
  }
});

test('RULES verdicts use the three public verdict constants', () => {
  const allowed = new Set(Object.values(VERDICT));
  for (const rule of RULES) assert.ok(allowed.has(rule.verdict), rule.id);
});

test('passage marks follow evidence, sorted by position', () => {
  const r = run(DAM.passage, DAM.claims);
  assert.ok(r.passageMarks.length >= 3);
  for (let i = 1; i < r.passageMarks.length; i += 1) {
    assert.ok(r.passageMarks[i - 1].start < r.passageMarks[i].start);
  }
  assert.ok(r.passageMarks.some((m) => m.verdict === VERDICT.UNSUPPORTED));
});

// ---------------------------------------------------------------------- diff

test('second reader reports verdict changes between revisions', () => {
  const before = run(DAM.passage, DAM.claims);
  const after = run(DAM.passage, REVISION_CLAIMS);
  const d = diffAnalyses(before, after);
  const changed = d.rows.filter((r) => r.status === 'changed');
  assert.ok(changed.length >= 2);
  assert.ok(changed.some((r) => r.from === VERDICT.SUPPORTED && r.to === VERDICT.UNSUPPORTED));
  assert.ok(changed.some((r) => r.from === VERDICT.UNSUPPORTED && r.to === VERDICT.SUPPORTED));
});

test('second reader counts unchanged atoms', () => {
  const before = run(DAM.passage, DAM.claims);
  const after = run(DAM.passage, REVISION_CLAIMS);
  const d = diffAnalyses(before, after);
  assert.ok(d.summary.same >= 2);
  assert.equal(d.summary.added + d.summary.removed + d.summary.changed + d.summary.same, d.rows.length);
});

test('second reader reports removed and added atoms', () => {
  const before = run(DAM.passage, DAM.claims);
  const after = run(DAM.passage, REVISION_CLAIMS);
  const d = diffAnalyses(before, after);
  assert.ok(d.summary.removed >= 1);
  assert.ok(d.summary.added >= 1);
});

test('second reader reports a score delta', () => {
  const before = run(DAM.passage, DAM.claims);
  const after = run(DAM.passage, REVISION_CLAIMS);
  const d = diffAnalyses(before, after);
  assert.equal(d.scoreBefore, before.score);
  assert.equal(d.scoreAfter, after.score);
  assert.equal(d.scoreDelta, after.score - before.score);
});

test('diff rows surface changes before unchanged rows', () => {
  const before = run(DAM.passage, DAM.claims);
  const after = run(DAM.passage, REVISION_CLAIMS);
  const rows = diffAnalyses(before, after).rows;
  const firstSame = rows.findIndex((r) => r.status === 'same');
  const lastChange = rows.map((r) => r.status).lastIndexOf('changed');
  assert.ok(lastChange < firstSame);
});

test('atom keys pair by claim position and type order', () => {
  const report = run(DAM.passage, DAM.claims);
  const keys = [...keyAtoms(report.atoms).values()];
  assert.equal(new Set(keys).size, keys.length);
});

// ---------------------------------------------------------------- malformed

test('analyze tolerates missing arguments', () => {
  assert.doesNotThrow(() => analyze());
  assert.doesNotThrow(() => analyze({}));
});

test('analyze coerces a non-string passage', () => {
  const r = analyze({ passage: 42, claims: ['The count was 42.'] });
  assert.equal(r.passage, '42');
  assert.equal(r.totalAtoms, 1);
});

test('empty claim strings are dropped from an array input', () => {
  const r = run('The count was 42.', ['  ', 'The count was 42.']);
  assert.equal(r.claims.length, 1);
});

test('sentenceAt returns the sentence containing an offset', () => {
  const text = 'First sentence here. Second sentence there.';
  const idx = text.indexOf('Second');
  assert.equal(sentenceAt(text, idx), 'Second sentence there.');
});

test('extractNumbers ignores digits glued inside longer words', () => {
  assert.equal(extractNumbers('Model X1 shipped.').length, 0);
  assert.equal(extractNumbers('Model 1 shipped.').length, 1);
});
