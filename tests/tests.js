import { buildDynamicRows } from "../src/comparison.js";
import { decodeBoardState, encodeBoardState, parseBoardStateFromHash } from "../src/share.js";
import { createDefaultBoardState, sanitizeBoardState } from "../src/state.js";

const tests = [];

test("share encoding round-trips board state", async () => {
  const state = createDefaultBoardState();
  state.homes.push({
    id: "home-1",
    location: { label: "A", lat: 52.5, lng: 13.4 },
  });
  state.fixedDestinations.push({
    id: "dest-1",
    label: "Work",
    location: { label: "Work", lat: 52.51, lng: 13.42 },
  });

  const encoded = await encodeBoardState(state);
  const decoded = await decodeBoardState(encoded);

  assert(decoded.homes.length === 1, "Expected one home after decoding.");
  assert(decoded.fixedDestinations.length === 1, "Expected one destination after decoding.");
  assert(decoded.selectedMode === state.selectedMode, "Expected selected mode to survive round-trip.");
});

test("hash parser extracts the board payload", () => {
  const value = parseBoardStateFromHash("#board=abc123");
  assert(value === "abc123", "Expected board payload from hash.");
});

test("sanitizeBoardState restores defaults for invalid input", () => {
  const state = sanitizeBoardState({ selectedMode: "INVALID", presets: [] });
  assert(state.selectedMode === "TRANSIT", "Expected fallback mode.");
  assert(state.presets.length >= 1, "Expected fallback presets.");
});

test("dynamic rows expand into separate ordinal rows", async () => {
  const boardState = {
    ...createDefaultBoardState(),
    homes: [
      { id: "home-1", location: { label: "Home 1", lat: 1, lng: 1 } },
      { id: "home-2", location: { label: "Home 2", lat: 2, lng: 2 } },
    ],
    dynamicGroups: [
      { id: "dynamic-1", label: "Supermarkets", primaryType: "supermarket", count: 3 },
    ],
  };

  const provider = {
    async searchNearby(home) {
      return [1, 2, 3].map((ordinal) => ({
        label: `${home.location.label} Spot ${ordinal}`,
        lat: home.location.lat + ordinal / 100,
        lng: home.location.lng + ordinal / 100,
      }));
    },
    async computeRoutes(origin, destinations) {
      return destinations.map((destination, index) => ({
        durationMillis: (index + 1) * 600000,
        distanceMeters: (index + 1) * 1000,
        condition: "ROUTE_EXISTS",
      }));
    },
  };

  const rows = await buildDynamicRows(boardState, provider, boardState.presets[0]);
  assert(rows.length === 3, "Expected three ordinal rows for count=3.");
  assert(rows[0].rowLabel === "Supermarkets #1", "Expected first ordinal row label.");
  assert(rows[2].cells[1].destinationLabel === "Home 2 Spot 3", "Expected home-specific destinations in each cell.");
});

run();

function test(name, fn) {
  tests.push({ name, fn });
}

async function run() {
  const resultsElement = document.querySelector("#results");
  let passed = 0;

  for (const testCase of tests) {
    const container = document.createElement("section");
    container.className = "test-result";

    try {
      await testCase.fn();
      passed += 1;
      container.classList.add("pass");
      container.innerHTML = `<strong>PASS</strong> ${testCase.name}`;
    } catch (error) {
      container.classList.add("fail");
      container.innerHTML = `<strong>FAIL</strong> ${testCase.name}<div><code>${escapeHtml(error.message)}</code></div>`;
    }

    resultsElement.append(container);
  }

  const summary = document.createElement("p");
  summary.innerHTML = `<strong>${passed}/${tests.length}</strong> tests passed.`;
  resultsElement.prepend(summary);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
