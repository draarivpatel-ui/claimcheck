// samples.js — three synthetic passages. None of these describe real studies,
// dams, or trials. They exist to exercise every rule branch, including the ones
// that produce UNSUPPORTED verdicts.

export const SAMPLES = [
  {
    id: 'dam',
    title: 'Meridian Dam briefing',
    blurb: 'Numbers, years, and one figure that drifted.',
    passage:
      'The Meridian Dam was completed in 1962 after six years of construction. ' +
      'The reservoir covers 47 square miles and supplies drinking water to 1.2 million residents. ' +
      'In 1998 the spillway was widened to 9 gates. ' +
      'A 2001 inspection found the embankment stable, and the 2014 inspection repeated that finding. ' +
      'Cost overruns reached $18 million by 1964.',
    claims: [
      'The Meridian Dam was completed in 1962.',
      'The reservoir supplies water to 1.2 million residents.',
      'The spillway was widened to 12 gates in 1998.',
      'The Meridian Dam was completed after the 1975 flood.'
    ].join('\n')
  },
  {
    id: 'heat',
    title: 'Urban heat draft',
    blurb: 'Correlation dressed up as cause.',
    passage:
      'Neighborhoods with more tree cover tend to be cooler in summer. ' +
      'A citywide analysis found that blocks with above-average canopy were associated with ' +
      'surface temperatures 3.4 degrees lower. ' +
      'The report notes that shade may reduce heat stress, but it stops short of claiming a direct effect. ' +
      'Planting programs also correlate with higher property values. ' +
      'Researchers cautioned that the canopy data covers only 61 percent of blocks.',
    claims: [
      'Tree cover causes lower summer temperatures.',
      'Blocks with more canopy are 3.4 degrees cooler.',
      'Planting programs raise property values.'
    ].join('\n')
  },
  {
    id: 'hollis',
    title: 'Hollis trial notes',
    blurb: 'Hedged findings and a spelled-out number.',
    passage:
      'An early trial of the Hollis protocol reported that the treatment may shorten recovery by two days. ' +
      'The authors describe this as preliminary. ' +
      'A later review found the Hollis Protocol effective in 3 of 5 cohorts, though the sample was small. ' +
      'The trial enrolled 240 patients between 2016 and 2019.',
    claims: [
      'The Hollis protocol shortens recovery by 2 days.',
      'The Hollis Protocol was effective in 3 of 5 cohorts.',
      'The trial enrolled 240 patients between 2016 and 2019.'
    ].join('\n')
  }
];

// A revision used by the second-reader demo and by the diff tests.
export const REVISION_CLAIMS = [
  'The Meridian Dam was completed in 1962.',
  'The reservoir supplies water to 1.4 million residents.',
  'The spillway was widened to 9 gates in 1998.',
  'Cost overruns reached $18 million by 1964.'
].join('\n');

export function sampleById(id) {
  return SAMPLES.find((s) => s.id === id) ?? null;
}
