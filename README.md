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

This runs the full Playwright suite, including both:

- the main app interaction tests
- the browser-native logic round-trip tests

Useful individual scripts:

- `npm run test:all`: full suite
- `npm run test:app`: only the main UI flows
- `npm run test:app:headed`: same app flows in a visible Chromium browser, sequentially and slowed down for inspection
- `npm run test:logic`: only the browser-native logic tests

Rough browser execution coverage:

```bash
npm run test:coverage
```

This writes rough JS/CSS execution summaries to:

- `test-results/coverage/coverage-summary.json`
- `test-results/coverage/coverage-summary.md`

Notes:

- coverage currently runs in Chromium only
- this is browser-executed byte coverage, not instrumented line/branch coverage
- it is best used as a directional indicator for which modules and styles are still lightly exercised

Available test layers:

- `tests/tests.js`: browser-native logic tests for state sanitization and JSON/local-storage round-trips
- `tests/e2e/*.spec.js`: Playwright browser tests for the main UI against a fake map/routing provider

The Playwright config starts a local static server automatically with `python3 -m http.server 8000`.
