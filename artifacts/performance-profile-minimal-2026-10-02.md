# Pirate Battle performance profile (minimal diagnostic)

- Date: 2026-10-02T04:00:33.142Z
- Browser: Chromium 153.0.8010.12
- OS: win32 10.0.19045 on DESKTOP-EOV1TP1
- CPU: Intel(R) Core(TM) i3-3220 CPU @ 3.30GHz (4 logical cores)
- System memory: 16 GiB
- Viewport: 1440x900 @1x
- Configuration: 60-second session, 15-second enemy interval, seed 987654
- WebGL renderer: ANGLE (NVIDIA, NVIDIA Quadro 600 (0x00000DF8) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Match end: Incomplete: 25-second wall-time limit reached
- Match measured: 25.4 seconds (incomplete; capped at 25 wall-clock seconds)
- Average frame rate: 59.9 FPS
- Average frame interval: 16.69 ms
- p95 frame interval: 16.70 ms
- Maximum observed entities/enemies: 17/1
- JavaScript heap during match: 10–14 MiB
- Unhandled page errors: 0

## Five start/play/exit cycles

| Cycle | Heap before GC | Heap after GC | Change |
| ---: | ---: | ---: | ---: |
| 1 | 9.3 MiB | 9.3 MiB | 0.03 MiB |
| 2 | 9.2 MiB | 9.4 MiB | 0.26 MiB |
| 3 | 9.3 MiB | 9.5 MiB | 0.18 MiB |
| 4 | 9.4 MiB | 9.7 MiB | 0.27 MiB |
| 5 | 9.6 MiB | 9.7 MiB | 0.13 MiB |

## Limits

This is a headless Chromium run on the host listed above, not a representative physical mobile device. The FPS numbers include Chromium's headless WebGL/rendering path. Memory uses the non-standard Chromium performance.memory JavaScript heap metric; it does not measure GPU allocations or all browser-process memory. This is a minimal 25-second diagnostic sample, not the required full three-minute performance profile.
