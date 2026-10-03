---
generated_by: osc-newfeature
type: feat
bulk_run: true
repo: heygen-com/hyperframes
feature_complexity: M
Files:
  - packages/parsers/src/safeFrames.ts
  - packages/parsers/src/safeFrames.test.ts
  - packages/parsers/src/compositionContract.ts
  - packages/parsers/src/compositionContract.test.ts
  - packages/core/src/compositionContract.ts
  - packages/core/src/index.ts
  - packages/lint/src/rules/composition.ts
  - packages/lint/src/rules/composition.test.ts
  - packages/lint/src/hyperframeLinter.ts
  - packages/engine/src/utils/cropPack.ts
  - packages/engine/src/utils/cropPack.test.ts
  - packages/engine/src/index.ts
  - packages/producer/src/services/render/stages/cropPackStage.ts
  - packages/producer/src/services/render/stages/cropPackStage.test.ts
  - packages/producer/src/services/renderOrchestrator.ts
  - packages/producer/src/services/renderOrchestrator.test.ts
  - packages/cli/src/commands/render.ts
  - packages/cli/src/commands/render/plan.ts
  - packages/cli/src/commands/render/plan.test.ts
  - packages/cli/src/commands/render/execute.ts
  - packages/cli/src/commands/render.test.ts
  - packages/cli/src/utils/projectConfig.ts
  - packages/cli/src/utils/projectConfig.test.ts
  - packages/cli/src/utils/checkPipeline.ts
  - packages/cli/src/utils/checkPipeline.safeFrames.test.ts
  - packages/cli/src/commands/layout.ts
  - packages/cli/src/docs/rendering.md
  - packages/cli/src/help.ts
  - docs/schema/hyperframes.json
  - packages/studio/src/components/nle/PreviewOverlays.tsx
  - packages/studio/src/components/nle/SafeFrameOverlay.tsx
  - packages/studio/src/components/nle/SafeFrameOverlay.test.tsx
  - packages/studio/src/components/nle/PreviewOverlays.topologyLens.test.tsx
  - packages/studio/src/utils/studioUiPreferences.ts
  - packages/player/src/safe-frame.ts
  - packages/player/src/safe-frame.test.ts
  - packages/player/src/hyperframes-player.ts
  - packages/player/src/hyperframes-player.test.ts
  - packages/player/src/styles.ts
  - docs/concepts/data-attributes.mdx
  - docs/reference/html-schema.mdx
  - docs/guides/rendering.mdx
  - docs/guides/4k-rendering.mdx
  - skills/hyperframes-core/SKILL.md
  - skills/hyperframes-core/references/determinism-rules.md
---

# Safe-frame crop packs

Let a landscape (or any) master composition declare named crop windows. `hyperframes render --crop-pack` then writes extra deliverables by cropping the already-encoded master — one capture, several output files. Studio and the player can show those windows as overlays. Elements marked `data-safe-critical` must stay inside every requested window, enforced by lint (static) and `hyperframes check` (sampled boxes).

Cloud render still cannot reshape a composition. This feature is a local post-encode crop of an authored master, not a second capture and not an aspect-ratio override on the capture viewport.

## User-visible behavior

### Authoring

On the composition root (`[data-composition-id]` that owns `data-width` / `data-height`), authors set `data-safe-frames` to a JSON array:

```html
<div
  id="root"
  data-composition-id="launch"
  data-start="0"
  data-duration="30"
  data-width="1920"
  data-height="1080"
  data-safe-frames='[
    {"id":"vertical","ratio":"9:16","x":0.28,"y":0,"width":0.44,"height":1},
    {"id":"square","ratio":"1:1","x":0.22,"y":0,"width":0.56,"height":1}
  ]'
>
  <h1 id="headline" class="clip" data-start="0" data-duration="4" data-safe-critical>Launch day</h1>
</div>
```

Field contract:

| field                       | meaning                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `id`                        | Output suffix and Studio label. `[a-z][a-z0-9-]{0,31}`. Unique in the array.                                |
| `ratio`                     | `16:9`, `9:16`, or `1:1` in this cut. Used to validate the rect, not to invent a rect.                      |
| `x`, `y`, `width`, `height` | Fractions of the authored frame, origin top-left. Each in `[0, 1]`. `x + width <= 1` and `y + height <= 1`. |

The rect's pixel size (`round(width * data-width)` by `round(height * data-height)`) must match the named ratio within one pixel on each side. The implementation snaps the last pixel rather than failing a 1920×1080 9:16 window that is 478. something wide — document the snap in the parser.

`data-safe-critical` is a boolean attribute on any visual element. It means "this element's border box must stay inside every named safe frame for the whole time the element is visible." Optional `data-safe-critical="vertical"` (comma-separated ids) limits the requirement to named frames.

A composition with no `data-safe-frames` is unchanged. `--crop-pack` without authored frames is an error.

### Render

```bash
npx hyperframes render --output renders/launch.mp4 --crop-pack all
npx hyperframes render --output renders/launch.mp4 --crop-pack vertical,square
```

Behavior:

1. Capture and encode the master exactly as today (same width, height, fps, audio).
2. After assemble succeeds, for each requested id, ffmpeg **crop + scale** the master video (and copy audio) into a sibling file:
   - `renders/launch.mp4` (master, unchanged)
   - `renders/launch.vertical.mp4`
   - `renders/launch.square.mp4`
3. Default output size per pack member is the largest integer size that fits the named ratio and does not upscale either dimension past the cropped source. Example: a 844×1080 crop from 1920×1080 9:16 stays 844×1080.
4. `--crop-pack` is ignored for gif and png-sequence (print a warning, exit 0 for the master). MP4, MOV, and WebM are supported. HDR masters keep the same encode family on the crop remux; if crop+scale would break HDR, skip that member with a hard error naming the id rather than silently writing SDR.
5. `--crop-pack` with an unknown id exits non-zero before capture.
6. Project config may set a default:

```json
{
  "render": {
    "cropPack": ["vertical", "square"]
  }
}
```

CLI flags win over `hyperframes.json`. `all` means every authored id, in array order.

Human render summary lists each written path and pixel size. `--json` / existing render telemetry gain a `cropPack` array of `{ id, outputPath, width, height }`.

### Check / inspect

`hyperframes check` samples `data-safe-critical` boxes at the same timestamps inspect already uses (`--at` / default hero frames). A box that leaves its required frame is a blocking finding:

- code: `safe_critical_overflow`
- message names the element id, the frame id, the timestamp, and the overflowing edge

`hyperframes inspect --json` adds `safeFrames` (the authored rects in pixels) and per-sample `criticalOverflows`.

### Studio

A toggle in preview chrome (persisted in `studioUiPreferences`, default off) draws each safe frame as a labeled rectangle over the composition iframe. Rects are Studio overlays — they must not live inside the composition document (renders would capture them).

### Player

Optional attribute `safe-frame="<id>"` on `<hyperframes-player>` crops the iframe view to that authored window (CSS clip / transform on the iframe wrapper, not a rewrite of composition HTML). Invalid id is a no-op and a console warning. This is a preview aid, not a second composition.

### Lint (static)

| code                           | severity | when                                                            |
| ------------------------------ | -------- | --------------------------------------------------------------- |
| `safe_frames_invalid_json`     | error    | attribute present but not a JSON array of objects               |
| `safe_frame_bad_id`            | error    | missing/duplicate/illegal id                                    |
| `safe_frame_bad_rect`          | error    | fractions outside range or ratio mismatch after snap            |
| `safe_critical_unknown_frame`  | error    | `data-safe-critical="…"` names an id that does not exist        |
| `safe_critical_without_frames` | warning  | `data-safe-critical` present and root has no `data-safe-frames` |

Static lint cannot know painted overflow; that stays on `check`.

## Implementation

1. **Parser** — New `packages/parsers/src/safeFrames.ts`: `parseSafeFrames(root)`, `pixelRect(frame, width, height)`, `elementRequiresFrame(el, frameId)`. Add `safeFrames: "data-safe-frames"` and `safeCritical: "data-safe-critical"` to `COMPOSITION_ATTRIBUTES`. Re-export from `@hyperframes/core`.

2. **Lint** — Four errors + one warning in `compositionRules`. Do not fetch or run a browser here.

3. **Engine crop** — `packages/engine/src/utils/cropPack.ts` builds ffmpeg args: `-i master -filter:v crop=w:h:x:y,scale=outW:outH` plus audio copy (`-c:a copy` on mp4/mov when the sidecar is already AAC; follow `shouldCopyAacSidecar`). Keep `appendRenderProvenanceArgs`. Do not pass `-avoid_negative_ts make_zero`.

4. **Producer stage** — New `cropPackStage.ts` after `assembleStage` in `executeRenderJob`. Skip when the pack list is empty. Fail the job if any requested member fails. Master `outputPath` stays the assemble result.

5. **CLI plan** — Parse `--crop-pack` in `createRenderPlan`. Resolve `all` against the entry HTML before launch. Merge `hyperframes.json` `render.cropPack` only when the flag is absent. Schema in `docs/schema/hyperframes.json` adds an optional `render` object (`additionalProperties: false`) so existing configs stay valid.

6. **Check** — In `runCheckPipeline` / inspect sampling, after each layout snapshot, compare `getBoundingClientRect` of `[data-safe-critical]` elements (visible ones only) against each required pixel rect. Reuse the inspect page; do not open a second browser.

7. **Studio overlay** — New `SafeFrameOverlay.tsx` mounted from `PreviewOverlays.tsx`. Measure the iframe the same way `DomEditOverlay` does. 600-line ceiling: keep the overlay in its own file.

8. **Player** — `packages/player/src/safe-frame.ts` reads `data-safe-frames` from the probed document and applies a clip rect on the iframe wrapper. Observe `safe-frame`.

9. **Docs / skill** — Document the attribute, the flag, the sibling filename rule, and that this is a crop of the master — type that sits outside a window is cut off, not reflowed.

## Tests

- Parser: valid pair, snap-to-ratio, out-of-bounds, duplicate ids, critical targeting one id.
- Lint: one fixture per code.
- Engine: argv crop/scale numbers; audio copy preserved; missing master file fails.
- Producer: master path unchanged; sibling names; unknown id rejected before capture (CLI plan test).
- Check: overflow at a sampled time fails; an element fully inside passes; hidden (`display:none` / off-clip) elements are skipped.
- Studio: overlay rectangles match pixel rects; toggle off removes them from the Studio document (query the overlay, not the iframe).
- Player: `safe-frame="vertical"` clips; unknown id leaves the full frame.

## Risks

- Cropping is not reflow. Titles authored near the left/right edge will be lost on a center 9:16 window. `data-safe-critical` + check is the guard; do not auto-reposition text.
- Integer rounding can drift a ratio by a pixel. Snap in one function and use that function in lint, render, Studio, and player.
- A second ffmpeg pass can drop metadata (chapters, provenance, HDR). Re-apply provenance on every pack member; if chapter metadata is present on the master, copy it (`-map_metadata 0`) onto each member.
- Distributed / Lambda / cloud paths must ignore `--crop-pack` with an explicit error until a follow-up. Do not silently upload only the master while claiming a pack.
- Overlay chrome must stay in the Studio document. Drawing frames inside the iframe would burn into snapshots and renders.
- `additionalProperties: false` on `hyperframes.json` means the new `render` key is a schema + `ProjectConfig` change together, or existing validators will reject the file.
