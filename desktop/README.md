# Flow State Desktop

Electron wrapper for the Flow State web app.

## Setup

```bash
cd desktop
npm install
```

## Run in dev mode (points to localhost:3000)
```bash
npm run dev
```

## Run pointing to live app
```bash
npm start
```

## Build installers

```bash
npm run build:win    # Windows .exe
npm run build:mac    # Mac .dmg
npm run build:linux  # Linux .AppImage
```

## Assets needed
Place these in `desktop/assets/`:
- `icon.png` — 512x512 PNG (your brain logo)
- `icon.ico` — Windows icon
- `icon.icns` — Mac icon
- `tray-icon.png` — 16x16 or 32x32 PNG for system tray

You can convert your `logo-icon.png` using https://cloudconvert.com
