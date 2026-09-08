# ce-plan — "Every render ships a receipt" (PR walkthrough)

Feature under demo: **render provenance sidecar** — after every successful
`hyperframes render`, the producer writes `<output>.hf-render.json` next to the
artifact: versions, input hashes, variables hash, fonts, encoder, output
sha256, stage timings, warning codes.

- Canvas: 1920x1080 @ 30fps · duration 26s · no narration (silent PR walkthrough)
- Look: dark terminal/UI (#0B0E14 canvas), Inter for display, JetBrains Mono for
  code, receipt-green accent (#34D399) for provenance facts, sky (#7DD3FC) for
  commands.
- Film current: **LEFT**. Transition vocabulary (2): cut-the-curve LEFT
  (default boundary ×2) + ONE inverse zoom-through spent on the arrival of the
  final receipt card (the payoff).
- All JSON values shown are REAL values from an actual sidecar rendered with
  the modified CLI on this branch (out.mp4.hf-render.json).

## Beat sheet / script

| Scene | Time | On screen | Sustained-motion route |
| --- | --- | --- | --- |
| S1 "The claim" | 0.0–6.2 | Waterfall entry (§6, Y-from-below): "Every render / ships a receipt." Then staged reveal: prompt line `$ npx hyperframes render --output out.mp4` slides in; a render progress bar fills (sequenced UI life); "Render complete · 4.0s video" status lands. | Staged reveals + sequenced UI life |
| S2 "Two artifacts" | 6.2–12.4 | Two file cards waterfall-arrive: `out.mp4` (film strip glyph) and `out.mp4.hf-render.json` (receipt glyph, green edge). Label staged-reveals: "One render. Two artifacts." A highlight ring lands on the sidecar card; the caption "written only after the artifact commits" ticks in. Group nudge-slides LEFT (§7) as the sidecar card grows prominence. | Staged reveals + nudge curve |
| S3 "Inside the receipt" | 12.4–20.2 | Real sidecar JSON on a code panel, revealed in 3 staged groups on beats: versions (producer/node/ffmpeg) → input (entrySha256, compositionHash, fonts, variables hash) → output (sha256, sizeBytes, encoder h264). A green scanline highlight steps down the groups (sequenced UI life). | Staged reveals + sequenced UI life |
| S4 "Control + close" | 20.2–26.0 | ARRIVAL (inverse zoom-through): end card retracts from oversized into focus — "This video has a receipt too." with `walkthrough.mp4.hf-render.json` + flag chips `--no-provenance` / `--provenance <path>` + schema URL. Stillness before the final hold (0.5s), then the sha256 check mark ticks. | Staged reveals, then stillness-before-climax |

## Vector ledger (ledger.json mirrors this)

| # | Cut t | Exit (scene, vector) | Entry (scene, vector) | Technique |
| --- | --- | --- | --- | --- |
| 1 | 6.2s | S1 exits x: 0→−230, power4.in, fade ends at cut | S2 enters x: +230→0, power4.out, ignites at 0.35 opacity | cut-the-curve LEFT |
| 2 | 12.4s | S2 exits x: 0→−230, power4.in | S3 enters x: +230→0, power4.out | cut-the-curve LEFT |
| 3 | 20.2s | S3 exits scale 1→0.8 (pull, shrinking), blur→10px, fade to 0.15 | S4 enters scale 1.25→1 (still shrinking — sign match), blur 10→0 | inverse zoom-through (arrival) |

Seam law compliance: one current (LEFT), no opposing consecutive seams, the
single reserved Z-pull spent on the payoff arrival; every cut lands mid-motion
on both sides (exit power4.in still moving at cut; entries ignite ≥50% through
the notional path at 0.35 opacity — S4 arrives composed inside the retracting
wrapper, no grow-from-small intro during the seam window). No idle wobble
anywhere: every phase is owned by a named route above. #root painted opaque
(#0B0E14) — white-flash guard.

## Render plan (the actual walkthrough evidence)

```bash
node /workspace/packages/cli/bin/hyperframes.mjs render /tmp/provenance-walkthrough \
  --output walkthrough.mp4 --fps 30
```

The render itself exercises the feature: the output pair
`walkthrough.mp4` + `walkthrough.mp4.hf-render.json` is embedded in the PR.
