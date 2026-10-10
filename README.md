# Knightlab

**An offline chess studio for playing, reviewing, and learning.**

Knightlab is a browser based chess app that runs on the device. Play against a local Stockfish engine or across the board with another person, review move ideas, and save or export a game. The app has no account, server, or network opponent.

> **Project stage:** Initial prototype. The core play and offline experience is implemented; broader browser testing and release packaging are still needed before a production launch.

## What it can do

- Play chess against Stockfish or in local two player mode.
- Choose an engine strength, from Gentle to Full strength.
- Personalize the board with five square palettes, four piece color styles, and three piece icon sets.
- Move by dragging a piece or selecting its source and destination squares.
- See legal move targets, check status, move history, opening matches, and engine based move grades.
- Ask for a move idea, destination hint, or best move arrow.
- Review earlier positions, undo moves, flip the board, and promote pawns.
- Save the current game in this browser or export it as a PGN file.
- Install the app as a PWA and continue offline after its files have been cached.

## Run locally

Serve the project directory over localhost. A local web server is required for JavaScript modules, WebAssembly, and the service worker; opening `index.html` directly as a file will not provide the full app experience.

In PowerShell:

```powershell
Set-Location 'C:\Users\Devakesh\Documents\my-projects\knightlab'
python -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080). Keep the server running while using the app. If Python is unavailable, use another static server, for example:

```powershell
npx serve . -p 8080
```

Run that command **from the Knightlab folder**. The server serves its current directory, so launching it from `C:\Windows\System32` will not serve this project.

No build step or package installation is required for normal use. The browser loads the already vendored libraries in `vendor/`.

## Offline and installable use

Open the app once while online at localhost or at an HTTPS-hosted address. The service worker caches the app shell, chess rules library, and Stockfish files. The status in the page reports when the offline cache is ready. Use the browser’s Install app action to add it to the desktop or home screen.

When updating a local copy, reload the page after the server starts. If an older installed copy remains cached, close and reopen it or clear the site’s stored data from browser settings.

## Privacy and saved games

Moves, analysis, settings, and the current saved game stay in browser storage on this device. The app has no backend and does not send game data to a service. Clearing browser storage removes the saved game. Export PGN to keep a portable copy.

## Project layout

| File | Purpose |
| --- | --- |
| `index.html` | App interface and styling |
| `app.js` | Board interaction, game state, coaching, persistence, and PGN export |
| `engine.js` | Stockfish Web Worker protocol and analysis requests |
| `sw.js` | Offline asset cache and service worker lifecycle |
| `manifest.webmanifest` | Installable app metadata and icon declarations |
| `setup.py` | Rebuilds the vendored libraries and generated PWA assets |
| `vendor/chess.js` | Vendored chess rules and PGN library |
| `vendor/stockfish-19-lite-single.js` and `.wasm` | Vendored single threaded Stockfish engine |

## Rebuild vendored assets

The checked in `vendor/` directory is sufficient to run the app. To download and rebuild the third party files and regenerate the PWA icons and manifest, run:

```powershell
python setup.py
```

This setup step needs internet access. It downloads chess.js 1.4.0 and Stockfish.js 19.0.1; the chess.js archive is checked against the integrity value published by npm. The Stockfish release files are downloaded from GitHub. Review dependency updates and their licenses before distributing a new build.

## Technical notes and current scope

- The browser needs JavaScript modules, Web Workers, WebAssembly, local storage, and service worker support. Service workers require localhost or HTTPS.
- Stockfish runs locally as a single threaded WebAssembly engine. Analysis depth is intentionally limited to keep the app responsive; move grades and sacrifice labels are estimates, not authoritative coaching.
- The opening book is a small introductory repertoire.
- The app currently supports one saved game per browser profile. It has no clock, online play, accounts, cloud sync, or automated test suite.
- The app source does not currently include a top level project license. Third party notices and license texts are in `vendor/`; confirm the applicable terms before redistributing the project.

## Suggested next steps

1. Exercise the app on current desktop and mobile browsers, including offline launch and PWA installation.
2. Add a small automated regression suite for legal moves, save/restore, and engine failure handling.
3. Decide on the project’s distribution license and document a release process.
4. Consider clocks, multiple saved games, and an accessible move input mode based on user feedback.
