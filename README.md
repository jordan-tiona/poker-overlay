# poker-overlay

A transparent GTO advisor overlay for **Ignition Poker** on Windows.

Sits on top of your Ignition window, reads the table via OCR, looks up GTO preflop strategy, and streams plain-English explanations using a local [Ollama](https://ollama.com) model — no cloud, no subscriptions.

![overlay screenshot placeholder]

---

## Features

- **Auto-detect** hole cards, board, pot, and stacks from the Ignition window
- **GTO preflop charts** for all positions (RFI + vs 3-bet)
- **Plain-English explanations** streamed live from a local LLM (Ollama)
- **Click-through overlay** — never blocks your clicks; toggle with `Ctrl+Shift+P`
- **Manual override** — correct OCR errors without stopping the game

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Node.js](https://nodejs.org) | ≥ 24 | Use the LTS installer |
| [npm](https://npmjs.com) | ≥ 10 | Comes with Node |
| [Ollama](https://ollama.com) | latest | Run locally on Windows |
| Ignition Poker client | any | Must be running at 1920×1080 |

### Install Ollama and pull a model

```powershell
# After installing Ollama from https://ollama.com/download
ollama pull llama3.1
```

Any model works — `llama3.1` is the default. You can change it inside the app.

---

## Quick start (development)

```powershell
# Clone
git clone https://github.com/YOUR_USERNAME/poker-overlay.git
cd poker-overlay

# Install dependencies
npm install

# Start in dev mode (opens the overlay + DevTools)
npm run dev
```

The overlay appears immediately. Open Ignition and it will start reading the table automatically.

**Hotkeys:**

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+P` | Toggle click-through / interactive mode |
| `Ctrl+Shift+Q` | Quit the overlay |

---

## Building a distributable (Windows `.exe`)

```powershell
npm run build
npm run dist
```

Output is in `release/`. The installer is a standard Windows NSIS `.exe` — run it once, then launch **Poker Overlay** from the Start menu.

> **Note:** Windows may show a SmartScreen warning on first run because the app is unsigned. Click "More info → Run anyway" to proceed.

---

## Configuration

- **Ollama model** — change via the settings gear (or set `ollama_model` in `localStorage` via DevTools)
- **OCR regions** — calibrated for Ignition at **1920×1080**. If your resolution differs, the regions in `src/renderer/src/lib/ocr.ts` will need tuning.

---

## Project structure

```
src/
  main/         Electron main process (window, IPC, screen capture)
  preload/      Context bridge (exposes electronAPI to renderer)
  renderer/
    src/
      lib/
        ocr.ts          Tesseract.js OCR pipeline
        ollama.ts       Ollama streaming client
        gto/
          lookup.ts     GTO chart dispatch + Ollama prompt builder
          charts/
            preflop.ts  RFI + vs-3bet hand charts
      hooks/
        useCapture.ts   Polling capture + OCR loop
        useGTO.ts       GTO lookup + Ollama explanation
      components/
        SuggestionPanel.tsx  Main overlay panel
        StatusBar.tsx        Ignition / Ollama / OCR status indicators
      types/
        poker.ts        All shared types (GameState, GTOSuggestion, etc.)
```

---

## Roadmap

- [ ] Postflop GTO lookup (GTO Wizard API integration)
- [ ] OCR-based position detection
- [ ] Improved suit detection (hearts vs diamonds)
- [ ] Facing-bet OCR detection
- [ ] Full RFI charts (all positions)
- [ ] VS 3-bet charts for all positions
- [ ] Calibration mode for non-1080p setups

---

## License

MIT
