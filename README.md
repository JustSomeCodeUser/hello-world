# EMBER mobile comparison

A mobile-first, standalone WebGL2 comparison of a prebaked fire animation and one shared live fluid simulation, with 1–64 flame instances. No framework, external script, analytics, or automatic report upload.

## Run

Serve this folder with any static HTTP server, for example:

```sh
python -m http.server 8080
```

Open the HTTP URL in a WebGL2 browser. HTTPS is preferable on a phone (screen wake lock is optional). `file://` is not supported because the atlas is fetched.

## Comparison contract

- Both modes: same source material baked offline or evaluated live, 128×256 appearance surface, fixed instance size, same placement, same optional glow, 30 Hz source changes, no temporal interpolation. Changing the count does not shrink each flame. Overlap and render resolution are explicit controls.
- Live: exactly one 64×128 staggered velocity grid, 128×256 RGBA16F state field, limited MacCormack scalar transport, 20 pressure iterations, dt=1/30, seed 21. All instances share it. This is a mobile experiment, not the original v3 reference preset.
- Baked: the same simulator was warmed for 6 simulated seconds, then 120 state frames were captured. The original RGB8 state sequence was rendered through the unchanged material into final RGBA8 appearance frames. RGB values are rounded to steps of 6/255 and alpha to steps of 16/255, clamped to 0..255, without dithering. These quantized pixels are packed into opaque color/opacity planes and stored losslessly in WebP. This is now a fully shaded sprite sheet: baked playback samples one frame, while live still computes its material. Composition and glow remain shared. The overall conversion is lossy; WebP lossless does not undo the preceding quantization.
- The final 15 frames crossfade to the initial 15; the delivered loop has 105 frames / 3.5 seconds, with a 0.5-second seam blend. Quantization and seam blending are the intentional baked-quality differences. It is not a mathematically periodic fluid solution.
- The atlas is 2048×1792 RGBA8 (14 MiB GPU storage, no mipmaps), regardless of WebP download size. Only the empty bottom atlas row was removed; each animation frame remains 128×256. Memory for browser decoding, framebuffers and the simulator is additional. Once initialized, both mode resources remain resident for instant switching; baked mode executes **zero fluid steps**.
- All instances intentionally move in sync, in both modes. This comparison does not hide repetition with phase offsets.
- No 3D combustion, ray marching, independent flame interaction, or integrated game workload is represented.

## Measurement

The quick comparison uses A/B/B/A, starting with the selected mode. Each segment has 5 seconds warmup and 20, 60 or 180 seconds of foreground measurement. Settings are locked during recording. Hiding the page, resizing, pausing, context loss, or stopping marks any partial measurement aborted. Completed segments remain exportable.

Reports contain raw requestAnimationFrame intervals, FPS, P50/P95/P99 frame intervals, fraction exceeding 33.33 ms, GPU mean time per sampled display frame, optional disjoint-safe WebGL GPU queries, GPU timings separated by whether the frame ran simulation, exact settings, viewport, browser/GPU metadata, and simulation/wall-time ratio. GPU measurements are unavailable on browsers without the timer extension; CPU timing is not substituted.

Catch-up is limited to two fluid steps per display frame. A high displayed FPS is not sufficient: check simulation/wall-time ratio for live-mode slow motion. Raw frame intervals are never clamped in reports. Simulation update deltas are bounded to protect responsiveness.

Order balancing does not eliminate thermal throttling. Compare like-for-like settings on the actual phone. Desktop results and mobile viewport emulation do not establish phone performance, battery behavior, or game acceptance.

## Files

- `index.html`, `style.css`: Chinese touch-friendly controls and results.
- `app.js`: lifecycle, mode selection, benchmarks, JSON export.
- `assessment.js`: pure screening and recommendation logic; `assessment-ui.js`: accessible result cards.
- `assessment.test.mjs`: boundary, incomplete-data, slowdown, visual-veto and recommendation tests (`node --test assessment.test.mjs`). Synthetic fixtures are for logic verification, not phone performance claims.
- `sweep.js`, `sweep.test.mjs`: automatic count plans, capacity selection, consistency checks and tests (`node --test assessment.test.mjs sweep.test.mjs`).
- `fluid.js`: adapted EMBER simulator, allocated only on first live use.
- `graphics.js`: baked appearance sampling/live material, instanced display, shared optional glow, baking helpers.
- `flame-atlas.webp`, `atlas.json`: final appearance sequence and provenance/encoding manifest.
- `asset.js`, `asset.test.mjs`: explicit format, dimension and decimal 500 KB download checks; tests also verify the shipped asset SHA-256.

## Provenance

Adapted from EMBER v3 in [JustSomeCodeUser/hello-world at 07331ce](https://github.com/JustSomeCodeUser/hello-world/blob/07331ce87a1296ae92196d1a631c60a60dfa8822/ember-v3.html). The embedded source declares MIT licensing and independent implementation. Expanded upstream source SHA-256: `012500a5e478090d3c6c6403ea5297c896212131aca73e0d81cb515d77ba6923`. Its integrity was verified before extracting the fluid kernels. This page is not the original reference artist's code.

The original pressure/projection/transport/reaction kernels are retained; the simulation dimensions, timestep and iteration budget were set for this paired mobile experiment. The display renderer and benchmark UI are new. Existing v2/v3 pages and the repository default branch are not changed by this test-page branch.

## Scope

This is an isolated visual/performance experiment. It does not modify or integrate into any game. A browser smoke test is bounded implementation evidence; actual low-end phone quality and performance remain for the device trial.

## Automatic screening (report schema v2)

These are task-specific screening thresholds, not certification. The 60 FPS tier requires average FPS >=58, P95 <=20ms and fewer than 1% of frames >33.333ms. The 30 FPS candidate tier requires average FPS >=29 and P95 <=40ms; slow-frame percentage is not a criterion at that boundary. Live mode additionally requires simulation/wall time >=95%. Missing/invalid timing or interrupted/too-short recordings cannot pass.

20/60-second recordings give preliminary results. 180-second recordings also check the first and last third by elapsed frame time, including per-frame simulation step counts. Both windows must meet their tier. More than 10% FPS decline within a long segment, or between repeated same-mode segments, triggers a stability warning and prevents recommendation of that mode. This is a heuristic change warning, not a measured device temperature diagnosis.

Each comparison is an explicit batch. All four planned segments must finish, with two segments per mode and identical count, size, layout, render scale, glow, canvas dimensions and segment duration. Recommendation uses the worse result per mode, never mixes batches, and displays its exact tested scope. A single-mode recording gets a grade but no comparative recommendation, except when live rendering is unsupported and a valid baked test passes.

Eligible higher tiers take priority. At equal tiers, decorative flames default to baked to avoid live solving; that is a usage recommendation, not measured battery savings. A measured GPU advantage can select either mode with reliable GPU timing (>=80% coverage, no disjoint flag), comparable display cadence (all segment FPS within 5%), and both preferred-mode GPU means at least 20% below both other-mode means, with a mean difference >=0.2ms. Without reliable GPU timing, the frame-time criteria still work.

Visual quality is not machine-graded. An optional visual choice can veto a recommendation. Pending quality is marked explicitly. Both rejected, both failing, unstable, mismatched or incomplete cases never produce a false all-clear. Reports export the rule version, per-segment grades, per-batch recommendation, reasons, scope and visual choice.

## One-click count sweep (report schema v3)

The count sweep preserves the selected flame size, layout, render scale, glow and canvas dimensions, and automatically tests 4, 16, 32 and 64 flames in that order. Each count runs a complete A/B/B/A sequence starting with the selected mode. Each segment uses 5 seconds warmup and a fixed 20-second measurement, independently of the single-count duration selector. Sixteen segments take about 6 minutes 40 seconds. If float rendering is unavailable, each count instead runs two baked-only segments (about 3 minutes 20 seconds); live capacity is explicitly unsupported.

Controls remain locked throughout the whole sweep. Stop, pause, backgrounding, resize or a runtime error interrupts the batch. Existing completed samples remain exportable, but an incomplete sweep never claims a capacity or overall recommendation. All planned segments must finish with the exact expected counts/modes/order, duration, canvas and common quality settings.

Each count is graded by the existing batch rules. The summary lists per-mode highest tested counts for the 60 FPS and >=30 FPS tiers separately. Overall selection prioritizes the 60 FPS tier, then capacity in that tier, then the existing same-count GPU/usage tie-breaker. Only if there is no acceptable 60 FPS capacity does it select the 30 FPS tier. Visual-quality choices remain a veto. Lack of GPU timing does not prevent frame-time based grading.

A lower count failing and a higher count passing at the same tier is a non-monotonic result. That mode/tier's trusted capacity is withheld as inconsistent; observed individual passes remain visible. No interpolation is made between the tested counts. 64 passing means 64 is the highest tested passing count, not that the device's physical limit is 64. If all four fail, fewer than 4 remain untested.

All sweep recommendations are preliminary. Six-plus minutes across different loads is not 180 seconds of sustained validation at the chosen configuration. Use the recommended count and mode in a separate 180-second-per-segment test before game integration. Reports include the exact plan, four per-count assessments, both modes' tier capacities and the recommended mode/count/tier.

## Compact baked asset (build 2026-11-13.4)

The delivered atlas is **497,502 bytes (497.502 KB)**, down **81.25%** from the previous 2,653,137-byte PNG. The compact manifest is 767 bytes (LF); atlas plus manifest total **498,269 bytes**, below a strict 500,000-byte budget. Application code and HTML/CSS are additional. One shared atlas serves all 1–64 instances; its download does not multiply with flame count. A smaller download does not imply a proportional GPU-memory reduction.

All 105 frames, 30 FPS, 3.5-second loop and 128×256 frame resolution are retained. Only color/alpha precision changes: RGB maximum rounding error is 3/255 per channel, alpha 8/255. Smoke gradients and thin tongues should be checked on the phone, especially with glow disabled. The original 0.5-second state seam blend remains. A live flame is continuously evolving and does not show an identical frame at the same wall time.

Reproduction: shade the original state atlas (SHA-256 in `atlas.json`) at `(i + 0.01) / 30` seconds, read the 128×256 appearance framebuffer as RGBA8 for i=0..104, and pack bottom-up tile rows in 16 columns by 7 rows without image flipping. Round each RGB channel to the nearest multiple of 6, alpha to the nearest multiple of 16 and clamp to 0..255. Pack the color RGB plane above the alpha-as-gray RGB plane into a fully opaque 2048×3584 image. Encode with Pillow 10.2 WebP `lossless=True, quality=100, method=6, exact=True`. There is no dithering or frame removal. The former atlas remains in commit cb23b3eeb3737a2c092ba8a6253caec8d8f92f57; it is not bundled or fetched by the current page.

Pixels are artistic emission plus absorption: RGB may exceed alpha. A direct transparent WebP changed low-alpha RGB values in desktop WebKit even with `premultiplyAlpha: 'none'`. To avoid that rounding, the delivered image is fully opaque: top 2048×1792 stores RGB; bottom stores alpha replicated as gray RGB. `decodeAtlas` reads both opaque planes through a temporary 2D canvas and reconstructs one RGBA byte array once before upload. No canvas operations occur during animation. The bitmap/canvas are released afterward; decoding has additional temporary memory/CPU costs outside the benchmark. Do not premultiply the reconstructed bytes or apply standard straight-alpha compositing. The renderer retains ONE / ONE_MINUS_SRC_ALPHA blending. Within each tile, half-texel clamping prevents neighboring-frame bleed.

Offline comparison across all 105 frames against the pre-compression appearance, after compositing active fire/smoke pixels (reference max RGB >10), measured mean absolute 8-bit channel error 1.46 on dark [7,9,8] and 1.76 on gray [110,110,110]. These are image-difference measurements, not visual acceptance or phone performance. Dark-background P95 channel error was 3.11/255; gray was 5.02/255.

Run all checks with `node --test assessment.test.mjs sweep.test.mjs asset.test.mjs`. The page checks actual fetched image bytes and decoded dimensions before enabling playback, shows the measured budget status, and includes asset bytes/GPU allocation separately in exported reports. All existing single-count and 4/16/32/64 sweep rules remain unchanged.
