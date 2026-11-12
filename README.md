# EMBER mobile comparison

A mobile-first, standalone WebGL2 comparison of a prebaked fire animation and one shared live fluid simulation, with 1–64 flame instances. No framework, external script, analytics, or automatic report upload.

## Run

Serve this folder with any static HTTP server, for example:

```sh
python -m http.server 8080
```

Open the HTTP URL in a WebGL2 browser. HTTPS is preferable on a phone (screen wake lock is optional). `file://` is not supported because the atlas is fetched.

## Comparison contract

- Both modes: same material, 128×256 appearance surface, fixed instance size, same placement, same optional glow, 30 Hz source changes, no temporal interpolation. Changing the count does not shrink each flame. Overlap and render resolution are explicit controls.
- Live: exactly one 64×128 staggered velocity grid, 128×256 RGBA16F state field, limited MacCormack scalar transport, 20 pressure iterations, dt=1/30, seed 21. All instances share it. This is a mobile experiment, not the original v3 reference preset.
- Baked: the same simulator was warmed for 6 simulated seconds, then 120 state frames were captured. Temperature/2, soot, and gas/2 are stored in opaque RGB8; fuel is unnecessary for display. No color-space conversion. The same material turns these into visible fire/smoke on the phone. This is a baked **state animation**, not a fully shaded sprite sheet; material shading is still shared once per display frame in both modes.
- The final 15 frames crossfade to the initial 15; the delivered loop has 105 frames / 3.5 seconds, with a 0.5-second seam blend. Quantization and seam blending are the intentional baked-quality differences. It is not a mathematically periodic fluid solution.
- The atlas is 2048×2048 RGBA8 (~16 MiB GPU storage, no mipmaps), regardless of PNG download size. Memory for browser decoding, framebuffers and the simulator is additional. Once initialized, both mode resources remain resident for instant switching; baked mode executes **zero fluid steps**.
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
- `fluid.js`: adapted EMBER simulator, allocated only on first live use.
- `graphics.js`: common appearance shader, instanced display, shared optional glow, baking helper.
- `flame-atlas.png`, `atlas.json`: baked state sequence and provenance/encoding manifest.

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
