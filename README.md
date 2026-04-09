# jwd

Static location-comparison app for evaluating candidate home locations against Points of Interest by travel time.

## Runtime

The app itself is still zero-build and can be served as static files.

```bash
python3 -m http.server 8000
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Automated Tests

Automated browser coverage uses Playwright with a deterministic fake provider, so the main UI test suite does not require a real Google Maps API key.

Requirements:

- Node.js 20+ and npm
- Playwright browser binaries

Install:

```bash
npm install
npx playwright install chromium firefox
```

Run:

```bash
npm test
```

Available test layers:

- `tests/tests.js`: browser-native logic tests for state sanitization and JSON/local-storage round-trips
- `tests/e2e/*.spec.js`: Playwright browser tests for the main UI against a fake map/routing provider

The Playwright config starts a local static server automatically with `python3 -m http.server 8000`.
