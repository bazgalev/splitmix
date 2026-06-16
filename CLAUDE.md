# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (localhost:5173/splitmix/)
npm run build     # production build → dist/
npm run preview   # preview production build locally
```

No linting config and no test suite — there are no lint or test commands.

## Architecture

Single-page React 18 + Vite 6 app for splitting audio files into tracks in the browser. All processing is client-side; no backend.

**Data flow:**
1. User drops a file → `UploadZone` → `App` stores it in IndexedDB (`splitmix_v1` store via `src/utils/db.js`) and React state
2. `WaveformEditor` renders wavesurfer.js with `RegionsPlugin` — each marker is a zero-width region styled as a line. Markers are stored in `sessionStorage` (key `sm_markers`) so they survive a page refresh
3. On "Split", `App.handleSplit` decodes the file via `AudioContext`, slices segments, optionally resamples via `OfflineAudioContext` to 44.1 kHz, then encodes to WAV 16-bit, WAV 24-bit, or MP3 320 using `src/utils/audioUtils.js`
4. `TrackList` renders `blob:` URLs; names are editable inline and used for download filenames

**Key state in `App.jsx`:**
- `file` — raw `File` object, mirrored to IDB
- `markerTimes` — sorted array of seconds, driven by `WaveformEditor`
- `splitTracks` — `{ start, end, duration, url, ext }[]`; blob URLs are cleaned up via `URL.revokeObjectURL` on each new split/file

**`WaveformEditor` interaction model:**
- Toggle "Add Markers" mode → clicks on waveform place a marker at that time
- `M` key adds marker at playhead; `Space` plays/pauses
- Right-click on a marker region removes it
- Zoom slider is exponential (`MIN_Z=0.3` to `MAX_Z=400` px/s); "Fit" resets zoom to fit the full track

**Audio encoding (`src/utils/audioUtils.js`):**
- `sliceToWAV16` / `sliceToWAV24` — synchronous, write raw PCM + 44-byte RIFF header
- `sliceToMP3` — synchronous, uses `@breezystack/lamejs` Mp3Encoder in 1152-sample blocks
- `resampleSegment` — async, uses `OfflineAudioContext`; only called when source sample rate ≠ 44100 and output format is WAV

**Deployment:** GitHub Pages via `.github/workflows/deploy.yml`. Vite base is `/splitmix/`, so all asset paths are relative to that.
