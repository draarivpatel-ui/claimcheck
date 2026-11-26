// diff.js — second-reader comparison between two analysis reports.
//
// Atoms are paired across revisions by (claim position, atom type, order of
// that type inside the claim). That keeps a reworded bullet aligned with its
// predecessor so verdict changes are visible, instead of every edit looking
// like a delete plus an add. Reordering whole bullets will therefore look like
// changed claims — a stated limit, not a hidden one.

export function keyAtoms(atoms) {
  const seen = new Map();
  const keys = new Map();
  for (const atom of atoms) {
    const bucket = `${atom.claimIndex ?? 0}|${atom.type}`;
    const n = seen.get(bucket) ?? 0;
    seen.set(bucket, n + 1);
    keys.set(atom, `${bucket}|${n}`);
  }
  return keys;
}

export function diffAnalyses(previous, next) {
  const prevAtoms = previous?.atoms ?? [];
  const nextAtoms = next?.atoms ?? [];
  const prevKeys = keyAtoms(prevAtoms);
  const nextKeys = keyAtoms(nextAtoms);
  const prevByKey = new Map([...prevKeys].map(([atom, key]) => [key, atom]));

  const rows = [];
  const used = new Set();
  for (const atom of nextAtoms) {
    const key = nextKeys.get(atom);
    const before = prevByKey.get(key);
    if (before) used.add(key);
    if (!before) {
      rows.push({
        status: 'added', type: atom.type, atomText: atom.text, claimText: atom.claimText,
        from: null, to: atom.verdict, rule: atom.rule
      });
    } else if (before.verdict !== atom.verdict) {
      rows.push({
        status: 'changed', type: atom.type, atomText: atom.text, claimText: atom.claimText,
        from: before.verdict, to: atom.verdict, rule: atom.rule
      });
    } else {
      rows.push({
        status: 'same', type: atom.type, atomText: atom.text, claimText: atom.claimText,
        from: before.verdict, to: atom.verdict, rule: atom.rule
      });
    }
  }

  for (const atom of prevAtoms) {
    const key = prevKeys.get(atom);
    if (used.has(key)) continue;
    used.add(key);
    rows.push({
      status: 'removed', type: atom.type, atomText: atom.text, claimText: atom.claimText,
      from: atom.verdict, to: null, rule: atom.rule
    });
  }

  const summary = { added: 0, removed: 0, changed: 0, same: 0 };
  for (const r of rows) summary[r.status] += 1;

  const order = { changed: 0, removed: 1, added: 2, same: 3 };
  rows.sort((a, b) => order[a.status] - order[b.status]);

  return {
    rows,
    summary,
    scoreBefore: previous?.score ?? null,
    scoreAfter: next?.score ?? null,
    scoreDelta: (next?.score ?? 0) - (previous?.score ?? 0)
  };
}
