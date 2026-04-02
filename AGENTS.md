# Agent Context: @pencil/frontend-asset-processor

## Repo Summary

This repository is a browser-side asset-processing library with a local playground for manual verification.

Primary goals:

- validate image and video assets before upload
- normalize images and videos in the browser
- mirror selected backend preprocessing behavior
- reduce avoidable backend work and give earlier feedback to users

This is not a generic uploader and not a backend replacement. It is a media-processing codebase with a dev playground wrapped around it.

## Working Model

Treat the repo as two related surfaces:

- shared library code under `src/`
- manual verification UI under `playground/`

Default rule:

- if a change is product or pipeline logic, it probably belongs in `src/`
- if a change is only for manual exploration or testing UX, it probably belongs in `playground/`

Do not leak playground-only helpers into the shared library unless there is a real reuse case.

## High-Value Files

- `src/index.ts`
  - public API barrel
- `src/types/index.ts`
  - shared types and backend-mirrored constants
- `src/lib/image-validation.ts`
  - hard image dimension validation and original scaling
- `src/lib/segmentation-detection.ts`
  - alpha checks and white-background heuristics
- `src/lib/webp-conversion.ts`
  - image decode, optional scale, WebP encode
- `src/lib/thumbnail-generation.ts`
  - thumbnail generation
- `src/lib/video-metadata.ts`
  - video validation and metadata extraction
- `src/lib/video-preprocessing.ts`
  - trim orchestration and thumbnail extraction
- `src/lib/video-transcoding.ts`
  - MediaBunny conversion pipeline
- `src/lib/audio-extraction.ts`
  - audio track extraction helpers
- `src/lib/asset-pipeline.ts`
  - end-to-end product and video pipeline orchestration
- `playground/src/App.tsx`
  - developer UI for image flow, video flow, and Validation Lab
- `playground/src/test-media.ts`
  - deterministic `test://` validation sources
- `playground/src/styles.css`
  - playground styles only
- `README.md`
  - external project documentation

## Current Playground Behavior

The playground currently exposes three major areas:

- `Image Flow`
- `Video Flow`
- `Validation Lab`

### Validation Lab

Validation Lab is intentionally source-driven, not case-driven.

Current UX expectations:

- image and video use matching source-picker patterns
- each picker lets the user choose upload mode or `test://` preset mode
- upload and test URL selection live in the same component
- each column has one main `Run Validation` button
- the result view shows matched branch and check statuses
- no visible `Branch Test Matrix`

If you change any of that, update `README.md` and this file in the same change.

### Layout Expectation

The image and video validation columns should size independently. The left column must not stretch to match a taller right column.

## Backend Relationship

This repo mirrors frontend-safe parts of the Python backend processing stack.

Still backend-only:

- persistence
- storage writes
- queue publishing and routing
- segmentation dispatch
- embeddings
- speech-to-text submission
- downstream async processing and finalization

When changing constants or validation behavior, assume backend parity matters until proven otherwise.

## Backend Mapping

Use these pairings when checking parity:

| Frontend Function | Backend Function | Backend Area |
| --- | --- | --- |
| `validateImageDimensions()` | `validate_image_dimensions()` | image processor utils |
| `isSegmentedImage()` | `is_segmented_image()` | image processor utils |
| `detectWhiteBackground()` | `get_override_segment()` and `is_product_on_white_background()` | image processor utils |
| `convertToWebP()` | `convert_webp()` and `convert_image_to_webp()` | image processor utils |
| `generateThumbnail()` | `generate_thumbnail()` | image processor utils |
| `preprocessVideo()` | `video_preprocessor()` | video processor |
| `transcodeVideo()` and `trimVideo()` | FFmpeg or MediaConvert path | video processor |
| `extractVideoAttributes()` | metadata extraction stages | video processor |
| `extractAudioTrack()` | audio extraction stage | video processor |
| `processProductAsset()` | product asset processor flow | asset processor |
| `processVideoAsset()` | video preprocessing plus processor flow | video processor |

## Constants That Must Stay In Sync

These values live in `src/types/index.ts` and should track backend intent:

- `VALID_IMAGE_DIMENSION_LIMIT = 25000`
- `ORIGINAL_IMAGE_DIMENSION_LIMIT = 16000`
- `WEBP_MAX_DIMENSION = 16000`
- `SCALED_IMAGE_DIMENSION_LIMIT = 4096`
- `MIN_PRODUCT_EMPTY_AREA_RATIO = 0.15`
- `THUMBNAIL_MAX_WIDTH = 300`
- `THUMBNAIL_MAX_HEIGHT = 300`
- `WEBP_QUALITY = 80`
- `IS_WHITE_BG_THR = 0.05`
- `FLOOD_TOL = 30`
- `CONTRAST_RED = 0.85`

Do not change them casually. If backend parity changes, document why.

## MediaBunny Notes

MediaBunny in this repo uses the explicit pipeline API.

Expected pattern:

```ts
const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
const target = new BufferTarget();
const output = new Output({ format: new Mp4OutputFormat(), target });
const conversion = await Conversion.init({ input, output });
await conversion.execute();
await output.finalize();
```

Remember:

- codec names like `"avc"` are correct
- packet stats use `averagePacketRate`
- do not invent simplified APIs that are not in the installed version

## jSquash Notes

jSquash modules are lazy-imported and operate on `ImageData`.

Typical flow:

- decode to `ImageData`
- optionally resize
- encode through the relevant codec package
- wrap the returned buffer in a `Blob`

## Verification Expectations

### When Changing Library Logic

Run:

```bash
npm test
npm run typecheck:lib
```

### When Changing Playground UI

Run:

```bash
npm run typecheck:playground
npm run build:playground
```

Browser verification is preferred for UI work and any behavior relying on media APIs.

## Commands

```bash
npm run dev
npm run dev:playground
npm run build
npm run build:lib
npm run build:playground
npm run preview:playground
npm run test
npm run test:watch
npm run lint
npm run typecheck
npm run typecheck:lib
npm run typecheck:playground
```

## Editing Guidance

- Keep public API changes reflected in `README.md`.
- Keep validation presets centralized in `playground/src/test-media.ts`.
- Avoid scattering synthetic test logic through `App.tsx` when it can live in preset helpers.
- Keep library behavior deterministic where possible; tests currently mock codec layers.
- Prefer minimal, explicit state in the playground. The Validation Lab should stay understandable at a glance.
- Do not add backend-only concerns to the frontend library.

## Known Constraints

- Chromium-based browsers are the most reliable manual verification environment.
- Safari and Firefox may behave differently for some media paths.
- Large images and videos can be memory-intensive because several flows materialize decoded frames.
- White-background flood-fill heuristics are tuned for photographic product images, not arbitrary synthetic art.
- Test coverage validates orchestration and branching more than real codec correctness.

## Git And Repo State

This workspace is connected directly to `origin/main` for `https://github.com/btg-pencil-ai/browser-asset-processing`.

Repository hygiene expectations:

- keep `node_modules/`, build outputs, proof artifacts, and local handoff notes out of git
- do not commit `HANDOFF.md`
- if you make a user-visible workflow change, document it in both `README.md` and `AGENTS.md`
