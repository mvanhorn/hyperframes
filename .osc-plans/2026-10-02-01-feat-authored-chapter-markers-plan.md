---
generated_by: osc-newfeature
type: feat
bulk_run: true
repo: heygen-com/hyperframes
feature_complexity: M
Files:
  - packages/parsers/src/compositionContract.ts
  - packages/parsers/src/compositionContract.test.ts
  - packages/parsers/src/chapters.ts
  - packages/parsers/src/chapters.test.ts
  - packages/core/src/compositionContract.ts
  - packages/core/src/index.ts
  - packages/core/src/runtime/timeline.ts
  - packages/core/src/runtime/timeline.test.ts
  - packages/lint/src/rules/composition.ts
  - packages/lint/src/rules/composition.test.ts
  - packages/lint/src/hyperframeLinter.ts
  - packages/engine/src/utils/ffmetadataChapters.ts
  - packages/engine/src/utils/ffmetadataChapters.test.ts
  - packages/engine/src/services/chunkEncoder.ts
  - packages/engine/src/services/chunkEncoder.test.ts
  - packages/engine/src/index.ts
  - packages/producer/src/services/render/stages/assembleStage.ts
  - packages/producer/src/services/render/stages/assembleStage.test.ts
  - packages/producer/src/services/distributed/assemble.ts
  - packages/producer/src/services/renderOrchestrator.ts
  - packages/cli/src/commands/chapters.ts
  - packages/cli/src/commands/chapters.test.ts
  - packages/cli/src/cli.ts
  - packages/cli/src/help.ts
  - packages/cli/src/cli.commands.test.ts
  - packages/cli/src/commands/compositions.ts
  - packages/cli/src/commands/compositions.test.ts
  - packages/cli/src/commands/render.ts
  - packages/cli/src/commands/render/plan.ts
  - packages/cli/src/commands/render/execute.ts
  - packages/cli/src/commands/render.test.ts
  - packages/cli/src/docs/rendering.md
  - packages/player/src/chapters.ts
  - packages/player/src/chapters.test.ts
  - packages/player/src/composition-probe.ts
  - packages/player/src/composition-probe.test.ts
  - packages/player/src/controls.ts
  - packages/player/src/controls-setup.ts
  - packages/player/src/controls.test.ts
  - packages/player/src/styles.ts
  - packages/player/src/hyperframes-player.ts
  - packages/player/src/hyperframes-player.test.ts
  - packages/studio/src/player/lib/playbackTypes.ts
  - packages/studio/src/player/store/timelineElement.ts
  - packages/studio/src/player/lib/timelineElementHelpers.ts
  - packages/studio/src/player/components/TimelineRuler.tsx
  - packages/studio/src/player/components/timelineRulerGeometry.ts
  - packages/studio/src/player/components/TimelineRuler.chapters.test.tsx
  - docs/concepts/data-attributes.mdx
  - docs/reference/html-schema.mdx
  - docs/guides/rendering.mdx
  - skills/hyperframes-core/SKILL.md
  - skills/hyperframes-core/references/tracks-and-clips.md
---

# Authored chapter markers

Add a first-class `data-chapter` attribute on timed clips so a composition can declare named section starts. Those markers become a player chapter rail, Studio ruler ticks, a `hyperframes chapters` listing, and MP4/MOV chapter metadata on render. This is a new authoring contract, not a change to existing timing, tracks, or in/out work-area points.

## User-visible behavior

### Authoring

On any timed clip (an element with `data-start`, including a nested composition host), authors may set:

```html
<section
  id="hook"
  class="clip"
  data-start="0"
  data-duration="4"
  data-track-index="1"
  data-chapter="Hook"
></section>
<section
  id="demo"
  class="clip"
  data-start="hook"
  data-duration="12"
  data-track-index="1"
  data-chapter="Product walkthrough"
></section>
```

Rules:

- The chapter **start time** is the clip's resolved `data-start` (absolute or relative). The chapter runs until the next chapter or the composition end. Clip `data-duration` does not close the chapter.
- `data-chapter` is a non-empty title string after trim. Titles may repeat; start times may not.
- A composition may have zero chapters. Nothing about player, Studio, lint, or render changes in that case.
- `data-chapter` is not `data-label`. Labels stay inspector names. Chapters are navigational section titles.
- Sub-composition hosts may carry a chapter. Descendants inside an inlined sub-composition do not contribute chapters to the host listing unless they sit in the host document itself.

### CLI

`hyperframes chapters [dir] [--json]` lists chapters for the project entry composition, using the same project resolution as `hyperframes compositions`.

Human output is a table: index, start (seconds, 3 decimal places), title, source element `id`.

`--json` emits the existing `withMeta` envelope plus:

```json
{
  "chapters": [
    { "index": 1, "start": 0, "title": "Hook", "elementId": "hook" },
    { "index": 2, "start": 4, "title": "Product walkthrough", "elementId": "demo" }
  ]
}
```

`hyperframes compositions --json` adds an optional `chapters` array per composition (same objects, empty array when none).

`hyperframes render` writes chapters into MP4 and MOV containers by default when any exist. `--no-chapters` skips the metadata write. GIF, WebM, and png-sequence ignore chapters (those containers have no chapter track here). Render still succeeds if chapter mux fails; it prints one warning and leaves the video otherwise valid.

`hyperframes inspect --json` includes the same `chapters` array so an agent can correlate layout samples with section starts.

Root help (`packages/cli/src/help.ts`) lists `chapters` under Project, next to `compositions` and `inspect`.

### Player

`<hyperframes-player>` reads chapters from the probed composition document.

When one or more chapters exist and `controls` is on:

- The scrubber shows tick marks at each chapter start.
- Hovering a tick (or the current chapter title chip) shows the title.
- A chapter title chip sits left of the time readout and updates as currentTime crosses chapter starts.
- `[` / `]` seek to the previous / next chapter start. Keys are ignored when focus is in a text field, matching slideshow keyboard guards.

A `chapters` attribute on the element may be `off` to hide the rail and disable the keys while still exposing `player.chapters` on the JS API.

New API on the player:

- `get chapters(): ReadonlyArray<{ start: number; title: string; elementId: string }>`
- `seekToChapter(index: number): void` — 1-based, no-op and no throw if out of range

### Studio

`TimelineRuler` draws chapter ticks above the existing time ticks, using the same `pps` / `contentOrigin` math as beat lines. Each tick is labeled with the chapter title when the title fits; otherwise it shows a marker and a tooltip.

Chapters are read-only chrome from `data-chapter`. This change does not add a chapter editor, and it does not reuse in/out work-area points.

### Lint

New composition-group findings (error unless noted):

| code                      | when                                                           |
| ------------------------- | -------------------------------------------------------------- |
| `chapter_empty`           | `data-chapter` present but empty or whitespace                 |
| `chapter_missing_timing`  | `data-chapter` on an element with no resolvable `data-start`   |
| `chapter_duplicate_start` | two chapters resolve to the same start within 1 ms             |
| `chapter_out_of_range`    | resolved start is negative or past the root duration (warning) |

`LINT_RULE_COUNT` / `LINT_RULE_GROUP_COUNTS.composition` increase by these four rules. `shouldBlockRender` treats the three errors as blocking, same as other composition errors.

## Implementation

1. **Contract** — Add `chapter: "data-chapter"` to `COMPOSITION_ATTRIBUTES` in `packages/parsers/src/compositionContract.ts`. New `packages/parsers/src/chapters.ts` exports `parseChapters(root, options)` that walks timed elements, resolves starts through the existing `readClipTiming` / start-expression helpers, sorts by start, and returns `{ start, title, elementId, diagnostics }`. Re-export from `@hyperframes/core` via `packages/core/src/index.ts`.

2. **Runtime manifest** — In `packages/core/src/runtime/timeline.ts`, copy `data-chapter` onto each clip record (next to the existing `data-label` read). Studio's `ClipManifestClip` / `TimelineElement` gain an optional `chapter?: string` so the ruler does not re-parse HTML.

3. **Lint** — Append the four rules to `compositionRules` in `packages/lint/src/rules/composition.ts`. Reuse `readClipTiming` already imported there. Do not put chapter validation in media or captions groups.

4. **Engine mux** — New `packages/engine/src/utils/ffmetadataChapters.ts` writes an ffmetadata file (`;FFMETADATA1` + `[CHAPTER]` blocks with `TIMEBASE=1/1000`, `START`, `END`, `title`). Extend `muxVideoWithAudio` and `applyFaststart` option bags with `chaptersFfmetadataPath?: string`. When set, add `-i <ffmetadata> -map_metadata 1` (or the next free metadata input index after provenance) without changing video/audio codec-copy behavior, AAC priming, or `appendRenderProvenanceArgs`. Skip the extra input for `.webm`.

5. **Producer** — `runAssembleStage` accepts optional `chapters`. Before mux/faststart it writes a temp ffmetadata file next to `videoOnlyPath` and deletes it after assemble. `renderOrchestrator.ts` parses chapters from the compiled entry HTML once (same parse as CLI) and passes them through. Distributed `packages/producer/src/services/distributed/assemble.ts` gets the same optional path so a chunked MP4 still receives chapters on the final remux.

6. **CLI** — New command module registered in `commandLoaders` and `help.ts`. Render flag `--no-chapters` lives on `createRenderPlan` and is forwarded on the job config. Default is write-when-present.

7. **Player** — `packages/player/src/chapters.ts` extracts chapters from the iframe document using the same attribute contract (DOM, not the Node parser). `CompositionProbe` / `ProbeResult` include `chapters`. `createControls` gains optional `chapters` + `onChapterSeek`. Styles add `.hfp-chapter-tick` and `.hfp-chapter-title`. `hyperframes-player` observes `chapters` (`on` default, `off` hides UI).

8. **Studio** — `TimelineRuler` consumes `chapter` from timeline elements (or a derived unique-by-start list). Keep the file under the 600-line Studio ceiling; if the component would grow past it, extract `TimelineChapterTicks` beside `timelineRulerGeometry.ts`.

9. **Docs / skill** — Document `data-chapter` in the timed-clip tables and one render note. Skill text in `tracks-and-clips.md` tells agents to mark section starts when a video has distinct parts.

## Tests

- Parser: empty, whitespace, relative `data-start`, duplicate starts, out-of-range, nested host vs descendant, stable sort.
- Lint: one fixture per code; a valid two-chapter file is silent.
- Engine: ffmetadata text shape; mux argv includes the metadata input only when the path is set; WebM argv does not; provenance flags still present.
- Producer assemble: temp file created and removed; `--no-chapters` / empty list skips the input.
- CLI: `chapters --json` envelope; help registration; compositions JSON includes `chapters`.
- Player: ticks render; `[` / `]` seek; `chapters="off"` hides UI but `player.chapters` stays populated; form-control keys ignored.
- Studio: ruler shows one tick per unique start; unlabeled when title overflows.

## Risks

- Extra ffmpeg metadata input can collide with `appendRenderProvenanceArgs` map indices. Centralize input numbering in one helper and cover it with the existing provenance mux tests plus a chapters case.
- Chapter mux must not re-encode video/audio or drop AAC priming (see `#3487` comments in `chunkEncoder.ts`). Copy codecs only.
- Relative `data-start` resolution must share the compositions/inspect walk, or CLI and render will disagree.
- Player chapter times are host-timeline seconds. Do not shift by `data-media-start`.
- Studio file-size gate: extract rather than grow `TimelineRuler.tsx` or `timelineElement.ts` past 600 lines.
- GIF / WebM / png-sequence authors may expect chapters; document the container limit instead of failing the render.
