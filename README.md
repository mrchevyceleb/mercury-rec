# Mercury Rec

A liquid-metal-themed system audio recorder built with Electron. Captures system audio via loopback, microphone input, or both simultaneously, and saves recordings as MP3.

![Mercury Rec](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue) ![License](https://img.shields.io/badge/license-MIT-green) ![Electron](https://img.shields.io/badge/electron-35-purple)

## Features

- **System audio capture** via display media loopback (no browser picker prompt)
- **Microphone recording** with device selection and real-time level meter
- **Mixed recording** of system audio + microphone simultaneously
- **MP3 output** via ffmpeg (192kbps, 44.1kHz stereo)
- **Frameless glassmorphic UI** with liquid metal aesthetics, animated mesh background, and chrome text effects
- **Native save dialog** defaulting to the Music folder
- Cross-platform: Windows (NSIS), macOS (DMG), Linux (AppImage)

## Screenshot

The app runs as a borderless rounded-corner window with no title bar. Drag anywhere to move, use the traffic-light buttons to minimize/close.

## Quick Start

```bash
git clone https://github.com/mrchevyceleb/mercury-rec.git
cd mercury-rec
npm install
npm start
```

## Build Installers

```bash
# Windows
npm run build:win

# macOS
npm run build:mac
```

macOS builds require `build/entitlements.mac.plist` for audio input permission.

## How It Works

1. `getDisplayMedia` with `audio: 'loopback'` captures system audio without a user prompt
2. Optional microphone input is mixed via Web Audio API `AudioContext`
3. `MediaRecorder` captures WebM/Opus chunks
4. On stop, the WebM blob is sent to the main process via IPC
5. Main process writes a temp file and spawns `ffmpeg-static` to convert to MP3
6. Native save dialog lets you pick the destination

## Architecture

| File | Role |
|------|------|
| `main.js` | Electron main process: window, IPC, ffmpeg conversion, file save |
| `preload.js` | Context bridge exposing `convertToMp3`, `saveFile`, `minimize`, `close` |
| `renderer.js` | UI logic: stream capture, MediaRecorder, timer, toggle handling |
| `index.html` | Single-page frameless UI |
| `styles.css` | Liquid metal / glassmorphic theme |

## License

[MIT](LICENSE)
