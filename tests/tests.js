import { buildDynamicRows } from "../src/comparison.js";
import { STORAGE_KEYS } from "../src/constants.js";
import { createDefaultBoardState, sanitizeBoardState } from "../src/state.js";
import { loadBoardState, saveBoardState } from "../src/storage.js";

const tests = [];

test("JSON round-trip preserves persisted board fields", () => {
  const state = createDefaultBoardState();
  state.homes = [
    {
      id: "home-1",
      colorIndex: 3,
      location: {
        label: "Custom Home",
        address: "Alexanderplatz 1, Berlin",
        placeId: "place-home-1",
        lat: 52.5219,
        lng: 13.4132,
      },
    },
  ];
  state.fixedDestinations = [
    {
      id: "destination-1",
      label: "Office",
      location: {
        label: "Office",
        address: "Potsdamer Platz 1, Berlin",
        placeId: "place-destination-1",
        lat: 52.5096,
        lng: 13.376,
      },
    },
  ];
  state.dynamicGroups = [
    {
      id: "dynamic-1",
      label: "coffee places",
      primaryType: "italian restaurant",
      count: 3,
    },
  ];
  state.selectedMode = "WALKING";
  state.selectedDirection = "DESTINATIONS_TO_HOME";
  state.highlightedHomeId = "home-1";
  state.view = "GRAPH";
  state.selectedPresetId = state.presets[1].id;

  const decoded = sanitizeBoardState(JSON.parse(JSON.stringify(state)));

  assert(decoded.selectedMode === "WALKING", "Expected selectedMode to survive JSON round-trip.");
  assert(decoded.selectedDirection === "DESTINATIONS_TO_HOME", "Expected selectedDirection to survive JSON round-trip.");
  assert(decoded.selectedPresetId === state.selectedPresetId, "Expected selectedPresetId to survive JSON round-trip.");
  assert(decoded.highlightedHomeId === "home-1", "Expected highlightedHomeId to survive JSON round-trip.");
  assert(decoded.view === "GRAPH", "Expected view to survive JSON round-trip.");
  assert(decoded.homes[0].colorIndex === 3, "Expected home colorIndex to survive JSON round-trip.");
  assert(decoded.homes[0].location.label === "Custom Home", "Expected custom home label to survive JSON round-trip.");
  assert(decoded.fixedDestinations[0].label === "Office", "Expected fixed Point of Interest label to survive JSON round-trip.");
  assert(decoded.dynamicGroups[0].primaryType === "italian restaurant", "Expected free-form dynamic query to survive JSON round-trip.");
  assert(decoded.dynamicGroups[0].count === 3, "Expected dynamic count to survive JSON round-trip.");
});

test("local storage round-trip preserves selected mode and direction", () => {
  const previous = window.localStorage.getItem(STORAGE_KEYS.boardState);

  try {
    const state = createDefaultBoardState();
    state.selectedMode = "DRIVING";
    state.selectedDirection = "DESTINATIONS_TO_HOME";
    state.view = "GRAPH";
    saveBoardState(state);

    const loaded = loadBoardState();
    assert(loaded.selectedMode === "DRIVING", "Expected selectedMode from local storage.");
    assert(loaded.selectedDirection === "DESTINATIONS_TO_HOME", "Expected selectedDirection from local storage.");
    assert(loaded.view === "GRAPH", "Expected view from local storage.");
  } finally {
    if (previous === null) {
      window.localStorage.removeItem(STORAGE_KEYS.boardState);
    } else {
      window.localStorage.setItem(STORAGE_KEYS.boardState, previous);
    }
  }
});

test("sanitizeBoardState restores defaults for invalid input", () => {
  const state = sanitizeBoardState({
    selectedMode: "INVALID",
    selectedDirection: "INVALID",
    presets: [],
  });
  assert(state.selectedMode === "TRANSIT", "Expected fallback mode.");
  assert(state.selectedDirection === "HOME_TO_DESTINATIONS", "Expected fallback direction.");
  assert(state.presets.length >= 1, "Expected fallback presets.");
});

test("sanitizeBoardState assigns missing home color indexes without overwriting existing ones", () => {
  const state = sanitizeBoardState({
    homes: [
      {
        id: "home-1",
        colorIndex: 4,
        location: { label: "Home 1", lat: 1, lng: 1 },
      },
      {
        id: "home-2",
        location: { label: "Home 2", lat: 2, lng: 2 },
      },
    ],
    presets: createDefaultBoardState().presets,
  });

  assert(state.homes[0].colorIndex === 4, "Expected existing colorIndex to be preserved.");
  assert(Number.isInteger(state.homes[1].colorIndex), "Expected missing colorIndex to be assigned.");
  assert(state.homes[1].colorIndex !== 4, "Expected assigned colorIndex to avoid collisions when possible.");
});

test("dynamic rows expand into separate ordinal rows", async () => {
  const boardState = {
    ...createDefaultBoardState(),
    homes: [
      { id: "home-1", location: { label: "Home 1", lat: 1, lng: 1 } },
      { id: "home-2", location: { label: "Home 2", lat: 2, lng: 2 } },
    ],
    dynamicGroups: [
      { id: "dynamic-1", label: "Coffee", primaryType: "coffee", count: 3 },
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
  assert(rows[0].rowLabel === "nearest coffee #1", "Expected first ordinal row label.");
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
