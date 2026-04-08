# Journey Worth Doing

Static location-comparison web app for evaluating candidate places against fixed and dynamic destinations by travel time.

## What is implemented

- Candidate places by address search or explicit map selection
- Fixed destinations by address search or explicit map selection
- Dynamic nearby groups such as `supermarket` or `restaurant`
- Travel-time comparison for `DRIVING`, `TRANSIT`, `BICYCLING`, and `WALKING`
- Reusable time presets
- Split map and comparison layout
- Explicit share links with compressed `location.hash`
- Local draft persistence in `localStorage`
- Browser-native tests in [`tests/index.html`](./tests/index.html)

## How to run

This project has no build step and no Node.js dependency.

1. Edit [`config.js`](./config.js) and set `googleMapsApiKey`.
2. Restrict that key to your GitHub Pages origin and the APIs you enable.
3. Serve the folder with any static file server.

Example:

```bash
cd /Users/c/Dropbox/projects/jwd
python3 -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000).

## Google Cloud setup

Enable the APIs used by the app:

- Maps JavaScript API
- Places API (New)
- Routes API
- Geocoding API

Recommended restrictions:

- Application restriction: `Websites`
- Allowed referrers: your GitHub Pages origin and local dev origin
- API restrictions: only the APIs listed above

## Tests

Serve the project folder, then open [`/tests/index.html`](http://localhost:8000/tests/index.html) in a browser. The tests cover:

- state serialization and deserialization
- share-hash parsing
- fallback state sanitization
- dynamic-row expansion logic

The live travel-time and Places queries are not mocked end-to-end here because the app is intentionally build-free and dependency-light.
