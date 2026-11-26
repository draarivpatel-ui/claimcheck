# ClaimCheck

### An offline, deterministic claim verifier for study notes and article drafts

---

## Inspiration

I write study notes by copying sentences out of readings and compressing them into
bullets. The compression is where errors enter: a year moves by one digit, "9 gates"
becomes "12 gates", "associated with" becomes "causes", and "may shorten" becomes
"shortens". Spell-check catches none of it, and an AI chat can check a claim but
cannot tell me *which character span* it relied on, changes its answer between runs,
and needs a network call I may not have in a lecture hall.

ClaimCheck is the tool I wanted: paste the passage and the bullets, get a table that
says, for every atom, whether the passage supports it, contradicts it, or never
mentions it — with the exact span and the rule that fired.

## What it does

1. **Atomizes every claim** into checkable pieces: numbers, dates, named entities,
   and causal assertions. A bullet with no atoms is reported as unchecked rather than
   silently passed.
2. **Walks the passage** for each atom and returns one of three verdicts:
   - `SUPPORTED` — a passage span agrees
   - `UNSUPPORTED` — a passage span disagrees
   - `UNVERIFIABLE-IN-TEXT` — no span can be found (silence is not disproof)
3. **Shows the evidence**: the passage quote, the character span in both the claim and
   the passage, the rule id, and a one-line fix.
4. **Scores the draft** with an explicitly labeled **rule-coverage score** — the share
   of atoms that matched a span. The UI states, next to the number, that this is not a
   truth score.
5. **Second reader mode**: paste a revision, and it re-runs the pass and diffs the
   verdicts (`SUPPORTED → UNSUPPORTED`, score delta, added/removed atoms).

Seventeen rules across four families:

| Family | Rules |
|---|---|
| Numeric consistency | `number_match`, `number_mismatch`, `number_unit_mismatch`, `number_without_figure`, `anchor_absent` |
| Date ordering | `date_match`, `date_order_conflict`, `date_mismatch`, `date_absent` |
| Entity mention | `entity_mention`, `entity_variant`, `entity_absent` |
| Causal language | `causal_supported`, `correlation_as_causation`, `hedge_weakens_causal`, `causal_unclear`, `causal_no_basis` |

The two rules I am proudest of are `correlation_as_causation` (the claim says "causes"
but the passage only says "associated with" or "tends to") and `hedge_weakens_causal`
(the passage says "may shorten", the note says "shortens").

## How I built it

- **Zero dependencies.** Plain ES modules, no bundler, no framework, no fonts, no
  analytics. The same `src/` modules run in the browser and under `node --test`.
- **Deterministic by construction.** No random, no clock, no network. The same input
  always produces the same table — which is what makes the test suite meaningful.
- **Offsets everywhere.** Atomization returns `{start, end}` into the original claim
  and the rules return evidence spans into the passage, so the UI can highlight the
  exact text and the tests can assert `claim.slice(span) === atom.text`.
- **Score honesty.** The headline number is defined as
  `round(100 × SUPPORTED / total atoms)` and labeled "rule-coverage score" in the UI,
  the README, and the Devpost copy.

## Challenges

- **Atomization without a parser.** Numbers, dates, entities and causal cues compete
  for the same characters. The fix was a strict precedence — dates before numbers,
  entities before causal cues, no overlapping atoms — plus tests that slice every span
  back out of the source string.
- **Making "silence" honest.** Early versions marked a missing entity as unsupported.
  That is wrong: absence of a name is not evidence against the claim. Splitting
  `UNSUPPORTED` from `UNVERIFIABLE-IN-TEXT` changed the score's meaning and made the
  UI's disclaimer necessary.
- **Diffing revisions.** Matching atoms by text makes any edit look like a delete plus
  an add. Pairing by (bullet position, type, order) keeps a reworded bullet aligned
  with its predecessor, at the cost of misreading reordered bullets — a limit written
  into the README.
- **Hedges fight causal verbs.** "The treatment may shorten recovery" contains both a
  hedge and a causal verb. The source is weaker than the claim, so hedge detection runs
  before causal support.

## Accomplishments

- 53 deterministic tests covering every rule's positive, negative and border cases,
  span offsets, hedge and causation detection, revision diffs, score math, and
  malformed input.
- A three-sample demo where every verdict is auditable by hand.
- A score that resists being read as truthiness: it is labeled as coverage, defined
  precisely, and paired with the honest limits in the Rulebook tab.
- No runtime network requests at all — verified in the browser devtools during the
  demo recording.

## What I learned

- Deterministic tools earn trust differently from models: not by being right more
  often, but by being *inspectable*. Printing the span and the rule id mattered more
  than adding another rule.
- Most note-taking errors are mechanical (a digit, a year, a verb), which is exactly
  the band where cheap rules beat an expensive model.
- A metric you cannot explain is worse than no metric. The label "rule-coverage score,
  not truth" is the most important string in the app.

## What's next

- Unit-aware conversion (`1.2 million` vs `1,200,000` already matches; acres/hectares
  do not).
- Sentence-level hedge locality instead of whole-sentence hedging.
- A CLI (`claimcheck passage.md notes.md`) so the same rules can run in a pre-commit
  hook for writing repos.
- An exportable Markdown report for a second reader.

## Built with

`JavaScript` · `ES modules` · `Node.js 22+` · `node:test` · `HTML` · `CSS` ·
headless Chrome (screenshots and demo capture) · no dependencies, no network, no model

## Try it

- Live: <https://aariv.me/claimcheck/>
- Code: <https://github.com/draarivpatel-ui/claimcheck>
- Demo video: `video/demo.mp4` in the repository (no external upload)

## AI disclosure

The code, tests, sample passages, README, Devpost copy, and demo narration were
produced with AI assistance (Claude Code) and reviewed by the entrant. **The
application itself uses no AI model at runtime**: every verdict is produced by the
deterministic functions in `src/rules.js`. All three sample passages are synthetic.
