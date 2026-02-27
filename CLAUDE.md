# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm start` - Run the app in development (launches Electron)
- `npm run build:win` - Build Windows installer (NSIS)
- `npm run build:mac` - Build macOS DMG

No test framework is configured.

## Architecture

Electron app that records system audio and saves it as MP3. Four source files, no frameworks.

**Process model (Electron context isolation):**

- **main.js** (main process): Window creation, IPC handlers, ffmpeg conversion, file save dialog. Sets up `setDisplayMediaRequestHandler` with `audio: 'loopback'` to capture system audio without user prompt.
- **preload.js**: Exposes two IPC channels to renderer via `contextBridge` as `window.audioRecorder`: `convertToMp3(arrayBuffer)` and `saveFile(arrayBuffer)`.
- **renderer.js**: All UI logic. Uses `getDisplayMedia` to get audio stream, records with MediaRecorder (WebM/Opus), sends raw buffer to main process for conversion.
- **index.html / styles.css**: Single-page UI with record/stop buttons, timer, and status text.

**Recording flow:**
1. Renderer calls `getDisplayMedia({ audio: true, video: minimal })` - main process handler auto-selects loopback audio from first screen source
2. Video tracks are discarded, audio-only stream feeds `MediaRecorder` (1s chunks)
3. On stop, WebM blob is sent to main process via `convert-to-mp3` IPC
4. Main process writes temp WebM file, spawns ffmpeg-static to convert to MP3 (192kbps, 44.1kHz stereo), returns MP3 buffer
5. Renderer sends MP3 buffer to `save-file` IPC, which opens native save dialog (default: Music folder)

**ffmpeg-static handling:** In packaged builds, `getFfmpegPath()` resolves the binary from `app.asar.unpacked` or `process.resourcesPath`. The `asarUnpack` config in package.json ensures the binary is extracted.

**Build config:** electron-builder targets are in package.json under `"build"`. Mac builds require `build/entitlements.mac.plist` for audio input permission.
