# Browser Asset Processing

Browser-side media preprocessing for images and videos.

This repository moves selected asset-processing steps out of the Python backend and into the browser so invalid or oversized files can be rejected earlier, image and video outputs can be normalized before upload, and the backend only receives artifacts that are already shaped for downstream workflows.

The codebase is split into:

- a TypeScript library under `src/`
- a React + TypeScript playground under `playground/` for manual verification

The package is currently private and library-first. The playground exists to exercise the library and inspect outputs; it is not intended as a production app.

## Why This Exists

The backend service currently handles several expensive preprocessing tasks after upload. Those steps increase latency, waste backend CPU on avoidable failures, and make it harder to give immediate feedback to users.

This repo moves browser-safe work earlier in the pipeline:

- image dimension validation and scaling
- segmentation-related heuristics
- WebP conversion
- thumbnail generation
- video validation
- metadata extraction
- trimming and transcoding
- audio extraction

## Scope

### In Scope

- browser-side image validation and scaling
- alpha-channel segmentation checks
- white-background heuristics for product imagery
- WebP conversion
- thumbnail generation
- video file validation and metadata extraction
- optional video trim and transcode steps
- optional audio extraction
- developer playground for manual testing

### Out Of Scope

These responsibilities still belong to the backend:

- database writes
- storage writes
- AMQP or queue publishing
- segmentation job dispatch
- prediction events
- embedding generation
- speech-to-text submission
- downstream video-processing finalization

## Tech Stack

- TypeScript with strict mode
- Vite for library and playground builds
- React 19 for the playground UI
- Vitest + jsdom for tests
- `@jsquash/*` for image decode, resize, and WebP encode
- `mediabunny` for video metadata, trim, transcode, and audio work

## Repository Layout

```text
.
├── playground/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── styles.css
│   │   └── test-media.ts
│   ├── index.html
│   ├── tsconfig.json
│   └── vite.config.ts
├── src/
│   ├── __tests__/
│   ├── lib/
│   ├── types/
│   └── index.ts
├── AGENTS.md
├── README.md
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Installation

```bash
npm install
```

## Development Commands

```bash
npm run dev                  # start playground
npm run dev:playground       # same as dev
npm run build                # build library
npm run build:lib            # build library explicitly
npm run build:playground     # build playground
npm run preview:playground   # preview built playground
npm run test                 # run Vitest suite once
npm run test:watch           # watch mode
npm run lint                 # eslint on src/
npm run typecheck           # typecheck library
npm run typecheck:lib       # typecheck library explicitly
npm run typecheck:playground # typecheck playground
```

## Public API

The public entrypoint is `src/index.ts`.

### Types

- `ValidationResult`
- `ScalingInfo`
- `SegmentationResult`
- `WhiteBackgroundResult`
- `WebPConversionResult`
- `ThumbnailResult`
- `VideoPreprocessResult`
- `TranscodeOptions`
- `VideoAttributes`
- `ProductAssetResult`
- `VideoAssetResult`
- `ProgressCallback`

### Constants And Enums

- `CONFIG`
- `IsProductType`

### Image Functions

- `validateImageDimensions(file)`
- `isSegmentedImage(imageData)`
- `detectWhiteBackground(imageData)`
- `convertToWebP(file, imageData?, options?)`
- `generateThumbnail(imageData, options?)`

### Video Functions

- `validateVideoFile(file, maxSizeMB?)`
- `extractVideoAttributes(file)`
- `preprocessVideo(file, options?)`
- `extractVideoThumbnail(source, duration, seekTimeMs?)`
- `transcodeVideo(file, options)`
- `trimVideo(file, startMs, endMs)`
- `extractAudioTrack(file, format?)`
- `hasAudioTrack(file)`

### Orchestrators

- `processProductAsset(file, onProgress?)`
- `processVideoAsset(file, options?, onProgress?)`

## Usage Examples

### Image Pipeline

```ts
import { processProductAsset } from "@pencil/frontend-asset-processor";

const result = await processProductAsset(file, (progress, step) => {
  console.log(progress, step);
});

console.log(result.webpBlob);
console.log(result.thumbnailBlob);
console.log(result.segmentation);
console.log(result.scalingInfo);
```

### Video Pipeline

```ts
import { processVideoAsset } from "@pencil/frontend-asset-processor";

const result = await processVideoAsset(
  file,
  {
    trimStartMs: 0,
    trimEndMs: 10_000,
    transcode: {
      outputFormat: "mp4",
      videoBitrate: 2_500,
      audioBitrate: 128,
      maxWidth: 1280,
      maxHeight: 720,
    },
    extractAudio: true,
  },
  (progress, step) => {
    console.log(progress, step);
  },
);

console.log(result.attributes);
console.log(result.thumbnailBlob);
console.log(result.audioBlob);
```

### Validate Before Upload

```ts
import {
  validateImageDimensions,
  validateVideoFile,
} from "@pencil/frontend-asset-processor";

const imageValidation = await validateImageDimensions(imageFile);
if (!imageValidation.valid) {
  throw new Error(imageValidation.error);
}

const videoValidation = await validateVideoFile(videoFile);
if (!videoValidation.valid) {
  throw new Error(videoValidation.error);
}
```

## Processing Model

### Image Flow

1. Decode the source file.
2. Validate dimensions against backend-compatible limits.
3. Scale oversized originals when they exceed the original-image limit but remain under the hard reject limit.
4. Run segmentation checks.
5. Convert to WebP.
6. Generate a thumbnail.

### Video Flow

1. Validate type and size.
2. Extract video metadata.
3. Optionally trim the file.
4. Optionally transcode the output.
5. Generate a thumbnail.
6. Optionally extract audio.

## Configuration Constants

Shared constants live in `src/types/index.ts` and are intended to match backend configuration values.

Important values:

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

If the backend changes these values, update the frontend constants deliberately rather than drifting.

## Playground

The playground is the fastest way to verify library behavior in a real browser.

Run it with:

```bash
npm run dev
```

### Sections

- `Image Flow`
  - runs the end-to-end product asset pipeline
  - shows progress, output blobs, and derived metadata
- `Video Flow`
  - runs validation, preprocessing, transcoding, and optional audio extraction
- `Validation Lab`
  - focused validation surface for image and video
  - each side uses a single source picker
  - user chooses either upload or `test://` preset mode
  - user clicks one `Run Validation` button to inspect the matched branch and check results

### Validation Presets

`playground/src/test-media.ts` defines deterministic `test://` presets for validation work.

Examples:

- `test://image/within-limit`
- `test://image/exceeds-original-limit`
- `test://image/exceeds-valid-limit`
- `test://video/valid-mp4`
- `test://video/oversize`

These presets are playground-only tooling. They are not part of the library API.

## Testing

Current automated coverage lives under `src/__tests__/`.

The suite exercises:

- image validation
- segmentation detection
- WebP conversion
- thumbnail generation
- video metadata handling

Tests rely on jsdom and mocked codec behavior. They are useful for branch and orchestration confidence, but they do not replace real browser validation for media APIs.

## Browser Requirements

The library depends on browser APIs such as:

- `createImageBitmap`
- `OffscreenCanvas`
- HTML5 `<video>`
- WebCodecs-backed paths used by MediaBunny

Practical guidance:

- Chromium-based browsers provide the most reliable manual verification environment.
- Safari and Firefox support may lag for some media features.
- Large media operations are memory-sensitive because some flows materialize decoded frames or `ImageData`.

## Backend Parity Mapping

This project mirrors selected backend logic from `frk-asset-processor`.

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

## Design Constraints

- Keep library code in `src/` decoupled from playground-only concerns.
- Keep deterministic validation presets in `playground/src/test-media.ts`.
- Preserve backend-compatibility limits and behaviors unless there is a deliberate parity decision.
- Prefer browser verification after changing UI or media behavior.

## Current Validation Lab UX

The visible validation UI is intentionally simple:

- one image validator column
- one video validator column
- one source picker per column
- upload mode and test-URL mode in the same component
- one `Run Validation` action per column
- no visible branch-by-branch matrix

That structure is deliberate. If a future change reintroduces matrix-style controls, document the reason clearly.
