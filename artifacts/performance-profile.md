# Pirate Battle performance profile

- Date: 2026-10-02T04:59:50.782Z
- Browser: Chromium 153.0.8010.12
- OS: win32 10.0.19045 on DESKTOP-EOV1TP1
- CPU: Intel(R) Core(TM) i3-3220 CPU @ 3.30GHz (4 logical cores)
- System memory: 16 GiB
- Viewport: 1440x900 @1x
- Configuration: 180-second session, 15-second enemy interval, seed 987654
- WebGL renderer: ANGLE (NVIDIA, NVIDIA Quadro 600 (0x00000DF8) Direct3D11 vs_5_0 ps_5_0, D3D11)
- Match end: VOYAGE COMPLETE (configured timer)
- Match measured: 180.6 seconds (completed)
- Average frame rate: 59.7 FPS
- Average frame interval: 16.74 ms
- p95 frame interval: 16.70 ms
- Maximum observed entities/enemies: 20/1
- JavaScript heap during match: 10â€“21 MiB
- Unhandled page errors: 0

## Five start/play/exit cycles

| Cycle | Heap before GC | Heap after GC | Change |
| ---: | ---: | ---: | ---: |
| 1 | 11.0 MiB | 9.8 MiB | -1.28 MiB |
| 2 | 9.7 MiB | 9.9 MiB | 0.21 MiB |
| 3 | 9.8 MiB | 10.0 MiB | 0.21 MiB |
| 4 | 9.9 MiB | 10.1 MiB | 0.20 MiB |
| 5 | 10.0 MiB | 10.2 MiB | 0.14 MiB |

## Limits

This is a headless Chromium run on the host listed above, not a representative physical mobile device. The FPS numbers include Chromium's headless WebGL/rendering path. Memory uses the non-standard Chromium performance.memory JavaScript heap metric; it does not measure GPU allocations or all browser-process memory. The match was allowed to end by its configured 180-second timer or ship destruction, with a 240-second wall-clock cap. If it did not complete, the remaining simulation time and incomplete status are reported instead of treating it as a full-match result.

