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
- `fluid.js`: adapted EMBER simulator, allocated only on first live use.
- `graphics.js`: common appearance shader, instanced display, shared optional glow, baking helper.
- `flame-atlas.png`, `atlas.json`: baked state sequence and provenance/encoding manifest.

## Provenance

Adapted from EMBER v3 in [JustSomeCodeUser/hello-world at 07331ce](https://github.com/JustSomeCodeUser/hello-world/blob/07331ce87a1296ae92196d1a631c60a60dfa8822/ember-v3.html). The embedded source declares MIT licensing and independent implementation. Expanded upstream source SHA-256: `012500a5e478090d3c6c6403ea5297c896212131aca73e0d81cb515d77ba6923`. Its integrity was verified before extracting the fluid kernels. This page is not the original reference artist's code.

The original pressure/projection/transport/reaction kernels are retained; the simulation dimensions, timestep and iteration budget were set for this paired mobile experiment. The display renderer and benchmark UI are new. Existing v2/v3 pages and the repository default branch are not changed by this test-page branch.

## Scope

This is an isolated visual/performance experiment. It does not modify or integrate into any game. A browser smoke test is bounded implementation evidence; actual low-end phone quality and performance remain for the device trial.
