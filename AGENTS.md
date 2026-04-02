# Agent Context: @pencil/frontend-asset-processor

## What This Repo Is

A frontend (browser-based) asset processing library that replaces selected backend Python processing from the `frk-asset-processor` service. It handles compute-heavy media operations (image validation, format conversion, video trimming, transcoding, metadata extraction) directly in the browser before uploading processed results to the backend API.

This repo is **library-first** and also includes a **local React + TypeScript playground app** under `playground/` for manual testing. The playground is a developer tool, not a published runtime artifact.

## Origin & Relationship to Backend

This project mirrors specific functions from the Python backend at `frk-asset-processor/src/asset_processor/processors.py` and related modules. The backend processes assets via an AMQP queue (`spanner_create_asset_processor_v2_queue`) with a Job Type Router that dispatches to REGULAR (product/image), MEDIACONVERT, or VIDEO PROCESSOR flows.

This frontend library covers:

- **REGULAR → Product Asset Flow**: image validation, segmentation detection, WebP conversion, thumbnail generation
- **VIDEO PROCESSOR → Video Asset Flow**: video preprocessing (trim/thumbnail), transcoding, metadata extraction, audio extraction

What **stays on the backend** (not in this repo):

- Embedding generation (Vertex AI)
- Speech-to-text submission
- Database writes (`save_*_to_db` functions)
- AMQP event publishing
- Segmentation queue dispatch
- Prediction events
- Video Processing Pipeline steps 4–7 (speech processing, child asset creation, finalization)

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022 target)
- **Build**: Vite (library mode for `src/` + dedicated Vite config for `playground/`)
- **Tests**: Vitest + jsdom environment
- **Image Processing**: jSquash (`@jsquash/webp`, `@jsquash/png`, `@jsquash/jpeg`, `@jsquash/resize`) — Google's Squoosh codecs compiled to WebAssembly
- **Video Processing**: MediaBunny (`mediabunny`) — pure TypeScript media toolkit using WebCodecs API

## Project Structure

```
playground/
├── index.html                          # Playground app HTML entry
├── vite.config.ts                      # Playground Vite config
├── tsconfig.json                       # Playground typecheck config
└── src/
    ├── main.tsx                        # React mount entry
    ├── App.tsx                         # Image/video flow UI + Validation Lab (real + synthetic/simulated cases)
    └── styles.css                      # Playground styles

src/
├── index.ts                              # Public API barrel export
├── types/
│   └── index.ts                          # All shared types, enums, and CONFIG constants
├── lib/
│   ├── image-validation.ts               # validateImageDimensions()
│   ├── segmentation-detection.ts         # isSegmentedImage(), detectWhiteBackground()
│   ├── webp-conversion.ts                # convertToWebP()
│   ├── thumbnail-generation.ts           # generateThumbnail()
│   ├── video-preprocessing.ts            # preprocessVideo(), extractVideoThumbnail()
│   ├── video-transcoding.ts              # transcodeVideo(), trimVideo()
│   ├── video-metadata.ts                 # extractVideoAttributes(), validateVideoFile()
│   ├── audio-extraction.ts              # extractAudioTrack(), hasAudioTrack()
│   └── asset-pipeline.ts                # processProductAsset(), processVideoAsset()
└── __tests__/
    ├── setup.ts                          # Browser API polyfills (OffscreenCanvas, ImageData, createImageBitmap)
    ├── image-validation.test.ts          # 6 tests
    ├── segmentation-detection.test.ts    # 7 tests
    ├── webp-conversion.test.ts           # 4 tests
    ├── thumbnail-generation.test.ts      # 5 tests
    └── video-metadata.test.ts            # 3 tests
```

## Module Responsibilities

### Image Processing Modules

**`image-validation.ts`** — Mirrors backend `validate_image_dimensions()`, `check_image_dimensions_valid()`, `check_and_scale_original()`, `scale_image()`.

- Rejects images with any dimension > 25,000px
- Scales down to 16,000px if in the 16k–25k range
- Returns `ImageData` for downstream use
- Uses `createImageBitmap()` + `OffscreenCanvas` for decoding and scaling

**`segmentation-detection.ts`** — Mirrors backend `is_segmented_image()`, `get_override_segment()`, `is_product_on_white_background()`, `is_product_on_white_background_helper()`.

- Alpha-channel check: fast path for already-segmented images
- Flood-fill white-background detection: converts to grayscale → adds border → rescales intensity → flood fills from (0,0) → classifies as SEGMENTABLE_PRODUCT, UNSEGMENTABLE_PRODUCT, or NOT_PRODUCT
- The flood-fill algorithm is tuned for real photographic images (not synthetic test data)

**`webp-conversion.ts`** — Mirrors backend `convert_webp()`, `convert_image_to_webp()`.

- Decodes input via jSquash PNG/JPEG decoders or browser `createImageBitmap()`
- Optional scaling if exceeding `SCALED_IMAGE_DIMENSION_LIMIT`
- Encodes to WebP via `@jsquash/webp` WASM encoder
- Returns `Blob` ready for upload

**`thumbnail-generation.ts`** — Mirrors backend `generate_thumbnail()`.

- Preserves aspect ratio (like PIL's `Image.thumbnail()`)
- Never upscales
- Fits within configurable max dimensions (default 300x300)
- Outputs WebP via jSquash

### Video Processing Modules

**`video-preprocessing.ts`** — Mirrors backend `video_preprocessor()` from `video_processor/processors.py`.

- Optional video trimming (delegates to `video-transcoding.ts`)
- Thumbnail extraction from video frame via HTML5 `<video>` element + `OffscreenCanvas`
- Returns duration, optional trimmed blob, optional thumbnail blob

**`video-transcoding.ts`** — Mirrors backend FFmpeg/MediaConvert transcoding.

- Uses MediaBunny's `Input` → `Conversion` → `Output` pipeline
- `transcodeVideo()`: full format transcoding (MP4/H.264/AAC or WebM/VP9/Opus)
- `trimVideo()`: time-range extraction with `Conversion.init({ trim: { start, end } })`
- All outputs to `BufferTarget` → `Blob`

**`video-metadata.ts`** — Mirrors backend Video Processing Pipeline steps 1–2.

- Combines MediaBunny metadata (codec, bitrate, frame rate via `PacketStats`) with HTML5 Video metadata (duration, dimensions)
- `validateVideoFile()`: checks size limit, MIME type, and extractable metadata

**`audio-extraction.ts`** — Mirrors backend Video Processing Pipeline step 3 (audio processing).

- Strips video track, re-encodes audio to WAV/MP3/OGG
- `hasAudioTrack()`: quick check via MediaBunny `getPrimaryAudioTrack()`
- Speech-to-text submission remains a backend API call

### Orchestrator

**`asset-pipeline.ts`** — High-level entry points that chain all modules.

- `processProductAsset(file, onProgress?)`: validate → detect segmentation → convert WebP → generate thumbnail
- `processVideoAsset(file, options?, onProgress?)`: validate → preprocess (trim/thumbnail) → transcode → extract audio
- Both accept a `ProgressCallback` for UI progress updates

## Key Types (in `types/index.ts`)

| Type                    | Purpose                                                                     |
| ----------------------- | --------------------------------------------------------------------------- |
| `ValidationResult`      | Image dimension validation outcome                                          |
| `ScalingInfo`           | Metadata about applied scaling (factor, original/scaled dimensions)         |
| `SegmentationResult`    | Alpha-channel segmentation check result                                     |
| `WhiteBackgroundResult` | Flood-fill white-bg classification + `IsProductType` enum                   |
| `WebPConversionResult`  | WebP blob + optional scaling info                                           |
| `ThumbnailResult`       | Thumbnail blob + dimensions                                                 |
| `VideoPreprocessResult` | Trimmed blob + thumbnail blob + duration                                    |
| `TranscodeOptions`      | Format, bitrate, resolution for transcoding                                 |
| `VideoAttributes`       | Full video metadata (duration, dimensions, codecs, bitrate, file size)      |
| `ProductAssetResult`    | Complete product pipeline output (WebP + thumbnail + segmentation)          |
| `VideoAssetResult`      | Complete video pipeline output (processed + transcoded + thumbnail + audio) |
| `CONFIG`                | All algorithm constants mirrored from backend Python config                 |

## CONFIG Constants

These mirror the backend Python configuration. If the backend values change, update `types/index.ts`:

| Constant                         | Value  | Backend Source                          |
| -------------------------------- | ------ | --------------------------------------- |
| `VALID_IMAGE_DIMENSION_LIMIT`    | 25,000 | `config.VALID_IMAGE_DIMENSION_LIMIT`    |
| `ORIGINAL_IMAGE_DIMENSION_LIMIT` | 16,000 | `config.ORIGINAL_IMAGE_DIMENSION_LIMIT` |
| `WEBP_MAX_DIMENSION`             | 16,000 | `config.WEBP_MAX_DIMENSION`             |
| `SCALED_IMAGE_DIMENSION_LIMIT`   | 4,096  | `config.SCALED_IMAGE_DIMENSION_LIMIT`   |
| `MIN_PRODUCT_EMPTY_AREA_RATIO`   | 0.15   | `config.MIN_PRODUCT_EMPTY_AREA_RATIO`   |
| `THUMBNAIL_MAX_WIDTH/HEIGHT`     | 300    | `config.IMAGE_THUMBNAIL_DIMENSIONS`     |
| `WEBP_QUALITY`                   | 80     | Backend PIL save quality                |
| `IS_WHITE_BG_THR`                | 0.05   | Flood-fill diff fraction threshold      |
| `FLOOD_TOL`                      | 30     | Flood-fill pixel tolerance              |
| `CONTRAST_RED`                   | 0.85   | Intensity rescale factor                |

## MediaBunny API Patterns

MediaBunny uses an explicit pipeline pattern (NOT the simplified `new Input(file)` style):

```typescript
import {
  Input,
  BlobSource,
  Output,
  BufferTarget,
  Conversion,
  Mp4OutputFormat,
  ALL_FORMATS,
} from 'mediabunny';

// Create input from File/Blob
const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

// Create output with format + target
const target = new BufferTarget();
const output = new Output({ format: new Mp4OutputFormat(), target });

// Initialize and run conversion
const conversion = await Conversion.init({ input, output /* options */ });
await conversion.execute();
await output.finalize();

// Get result as Blob
const blob = new Blob([target.buffer!], { type: 'video/mp4' });
```

Key codec names: `"avc"` (not h264), `"pcm-s16"` (not pcm_s16le), `averagePacketRate` (not averageFrameRate).

## jSquash API Patterns

jSquash modules are lazy-imported (tree-shakeable WASM):

```typescript
const { encode: encodeWebP } = await import('@jsquash/webp');
const { default: resize } = await import('@jsquash/resize');

// All jSquash functions work with ImageData objects
const resizedData = await resize(imageData, { width: 300, height: 300 });
const webpBuffer = await encodeWebP(resizedData, { quality: 80 });
const blob = new Blob([webpBuffer], { type: 'image/webp' });
```

## Testing

- **Framework**: Vitest with jsdom environment
- **Setup**: `src/__tests__/setup.ts` polyfills `OffscreenCanvas`, `ImageData`, `createImageBitmap`, `URL.createObjectURL`
- **Mocking**: jSquash and MediaBunny modules are mocked in test files via `vi.mock()`
- **Run**: `npm test` (or `npx vitest run`)
- **Current**: 25 tests passing across 5 test suites

## Browser Requirements

- Chrome 94+ / Edge 94+ (full WebCodecs + OffscreenCanvas)
- Firefox 105+ (WebCodecs support)
- Safari 16.4+ (WebCodecs partial support)

Both jSquash (WASM) and MediaBunny (WebCodecs) work best in Chromium-based browsers.

## Commands

```bash
npm run dev                  # Start React playground app
npm run dev:playground       # Start playground app explicitly
npm run build                # Build library (alias for build:lib)
npm run build:lib            # Build library → dist/
npm run build:playground     # Build playground app → dist-playground/
npm run preview:playground   # Preview playground build
npm run typecheck            # Typecheck library (alias for typecheck:lib)
npm run typecheck:lib        # TypeScript strict check for library
npm run typecheck:playground # TypeScript strict check for playground
npm test                     # Run all tests
```

## Playground Validation Lab

- Validation Lab is a developer-facing test harness in the playground app.
- Default Validation Lab flow is source-driven: pick one upload or `test://` URL, run validation once, and inspect the matched branch plus per-check pass/fail summary.
- It includes branch-level image/video validation cases using:
  - real uploads
  - dropdown-driven `test://` preset URLs resolved locally in the playground
  - synthetic generated inputs (for dimension/format/size branches)
  - simulated cases where real-world triggering is expensive or unreliable (duration-zero case)
- Use `npm run dev` and open the playground UI to select a source and run validation.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────┐
│                    FRONTEND (this repo)              │
│                                                      │
│  ┌──────────────┐   ┌──────────────┐                │
│  │   jSquash     │   │  MediaBunny  │                │
│  │  (WASM)       │   │  (WebCodecs) │                │
│  ├──────────────┤   ├──────────────┤                │
│  │ validate dims │   │ trim video   │                │
│  │ detect segment│   │ transcode    │                │
│  │ convert webp  │   │ extract meta │                │
│  │ gen thumbnail │   │ extract audio│                │
│  └──────┬───────┘   └──────┬───────┘                │
│         │                   │                        │
│         └───────┬───────────┘                        │
│                 │                                     │
│          Upload processed blobs via API              │
│                 │                                     │
└─────────────────┼───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│             BACKEND (frk-asset-processor)            │
│                                                      │
│  • Save file info to DB (Spanner)                    │
│  • Embeddings (Vertex AI)                            │
│  • Speech-to-text                                    │
│  • Asset event publishing (AMQP)                     │
│  • Segmentation queue dispatch                       │
│  • Prediction events                                 │
│  • Storage (R2/S3)                                   │
└─────────────────────────────────────────────────────┘
```

## Backend Function Mapping

| Frontend Function                  | Backend Function                                              | Backend File                          |
| ---------------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `validateImageDimensions()`        | `validate_image_dimensions()`                                 | `image_processor/utils.py:322`        |
| `isSegmentedImage()`               | `is_segmented_image()`                                        | `image_processor/utils.py:602`        |
| `detectWhiteBackground()`          | `get_override_segment()` → `is_product_on_white_background()` | `image_processor/utils.py:470,522`    |
| `convertToWebP()`                  | `convert_webp()` + `convert_image_to_webp()`                  | `image_processor/utils.py:365,412`    |
| `generateThumbnail()`              | `generate_thumbnail()`                                        | `image_processor/utils.py:662`        |
| `preprocessVideo()`                | `video_preprocessor()`                                        | `video_processor/processors.py:26`    |
| `transcodeVideo()` / `trimVideo()` | `video_transcoder_publish()` + FFmpeg                         | `video_processor/processors.py:180`   |
| `extractVideoAttributes()`         | `__process_video()` steps 1–2                                 | `video_processor/processors.py:115`   |
| `extractAudioTrack()`              | `__process_video()` step 3                                    | `video_processor/processors.py:115`   |
| `processProductAsset()`            | `asset_processor()` → `AssetCreator.process_product_asset()`  | `asset_processor/processors.py:74`    |
| `processVideoAsset()`              | `video_preprocessor()` + `video_processor()`                  | `video_processor/processors.py:26,86` |
