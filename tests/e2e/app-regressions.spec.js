const { test, expect } = require("@playwright/test");
const { addDynamicPoi, addFixedPoi, addLocation, bootFakeApp, importBoardJson } = require("./helpers");
const { installHeadedSceneBreaks } = require("./headed-scene-break");

installHeadedSceneBreaks(test);

test("reload restores the persisted local board state and active selections", async ({ page }) => {
  await bootFakeApp(page, { preserveLocalStorage: true });

  await addLocation(page, "Karl-Liebknecht-Str. 1", "Home Base");
  await addFixedPoi(page, "Berlin Hauptbahnhof", "Office");
  await addDynamicPoi(page, "coffee", 2);
  await page.locator("#mode-select").selectOption("DRIVING");
  await page.locator("#preset-select").selectOption({ label: "Sunday 11:00" });
  await page.locator("#direction-toggle").click();

  await expect(page.locator("#comparison-table-container")).toContainText("Home Base");
  await expect(page.locator("#comparison-table-container")).toContainText("Office");
  await expect(page.locator("#comparison-table-container")).toContainText("nearest coffee #2");
  await expect(page.locator("#comparison-graph-container .graph-bar")).toHaveCount(3);

  await page.reload();

  await expect(page.locator("#map .fake-map-surface")).toBeVisible();
  await expect(page.locator("#mode-select")).toHaveValue("DRIVING");
  await expect(page.locator("#comparison-table-container")).toContainText("Home Base");
  await expect(page.locator("#comparison-table-container")).toContainText("Office");
  await expect(page.locator("#comparison-table-container")).toContainText("nearest coffee #2");
  await expect(page.locator("#comparison-graph-container .graph-bar")).toHaveCount(3);
  await expect(page.locator(".graph-meta")).toContainText("Travel times by 🚗 Car");
  await expect(page.locator(".graph-meta")).toContainText("Sunday 11:00");
  await expect(page.locator(".graph-meta")).toContainText("Direction: Location ⬅️ Points of Interest");
});

test("board JSON export and import round-trip preserves rich board state", async ({ page, context }) => {
  await bootFakeApp(page);

  await addLocation(page, "Karl-Liebknecht-Str. 1", "Home Base");
  await addLocation(page, "Rosa-Luxemburg-Straße 1", "Friend Base");
  await addFixedPoi(page, "Berlin Hauptbahnhof", "Office");
  await addDynamicPoi(page, "italian restaurant", 2);
  await page.locator("#mode-select").selectOption("BICYCLING");
  await page.locator("#preset-select").selectOption({ label: "Sunday 11:00" });
  await page.locator("#direction-toggle").click();

  await page.getByRole("button", { name: "Share" }).click();
  const exported = JSON.parse(await page.locator("#share-json-output").inputValue());

  const importedPage = await context.newPage();
  await bootFakeApp(importedPage);
  await importedPage.getByRole("button", { name: "Load…" }).click();
  await importedPage.locator("#load-json-input").fill(JSON.stringify(exported, null, 2));
  await importedPage.locator("#import-load-json-button").click();

  await expect(importedPage.locator("#comparison-table-container")).toContainText("Home Base");
  await expect(importedPage.locator("#comparison-table-container")).toContainText("Friend Base");
  await expect(importedPage.locator("#comparison-table-container")).toContainText("Office");
  await expect(importedPage.locator("#comparison-table-container")).toContainText("nearest italian restaurant #2");
  await expect(importedPage.locator("#mode-select")).toHaveValue("BICYCLING");
  await expect(importedPage.locator("#preset-select")).toHaveValue(exported.selectedPresetId);
  await expect(importedPage.locator(".graph-meta")).toContainText("Travel times by 🚲 Bike");
  await expect(importedPage.locator(".graph-meta")).toContainText("Sunday 11:00");
  await expect(importedPage.locator(".graph-meta")).toContainText("Direction: Location ⬅️ Points of Interest");

  const importedState = await importedPage.evaluate(() => JSON.parse(window.localStorage.getItem("jwd.boardState.v1")));
  expect(importedState.selectedMode).toBe("BICYCLING");
  expect(importedState.selectedDirection).toBe("DESTINATIONS_TO_HOME");
  expect(importedState.homes.map((home) => home.location.label)).toEqual(["Friend Base", "Home Base"]);
  expect(importedState.fixedDestinations[0].label).toBe("Office");
  expect(importedState.dynamicGroups[0].primaryType).toBe("italian restaurant");
});

test("narrow viewport keeps horizontal overflow inside the table container", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 1100 });
  await bootFakeApp(page);

  await importBoardJson(page, buildWideBoardState());
  await expect(page.locator("#comparison-table-container")).toContainText("nearest restaurant #3");

  const layoutMetrics = await page.evaluate(() => {
    const tableContainer = document.querySelector("#comparison-table-container");
    const map = document.querySelector("#map");
    return {
      windowWidth: window.innerWidth,
      pageScrollWidth: document.documentElement.scrollWidth,
      tableClientWidth: tableContainer?.clientWidth || 0,
      tableScrollWidth: tableContainer?.scrollWidth || 0,
      mapWidth: Math.round(map?.getBoundingClientRect().width || 0),
    };
  });

  expect(layoutMetrics.pageScrollWidth).toBeLessThanOrEqual(layoutMetrics.windowWidth + 8);
  expect(layoutMetrics.tableScrollWidth).toBeGreaterThan(layoutMetrics.tableClientWidth);
  expect(layoutMetrics.mapWidth).toBeLessThanOrEqual(layoutMetrics.windowWidth + 1);

  await page.locator("#comparison-table-container").evaluate((element) => {
    element.scrollLeft = 360;
  });
  await page.locator('#comparison-table-container [data-row-id="poi-b"][data-home-index="1"]').click();
  await expect(page.locator("#comparison-table-container .comparison-cell.is-highlighted")).toHaveCount(1);
  await expect(page.locator("#map")).toHaveAttribute("data-highlight-state", "route");
});

test("composer recovers from search and validation errors without a page refresh", async ({ page }) => {
  await bootFakeApp(page, {
    geocodeErrors: { broken: "GEOCODER_GEOCODE: OVER_QUERY_LIMIT" },
  });

  await page.getByRole("button", { name: "Add Candidate Location" }).click();
  await page.locator("#composer-input").fill("broken place");
  await page.waitForTimeout(350);
  await expect(page.locator("#message-bar")).toContainText("Search failed: GEOCODER_GEOCODE: OVER_QUERY_LIMIT");

  await page.locator("#composer-input").fill("Karl-Liebknecht-Str. 1");
  await page.locator("#composer-input").press("Enter");
  await expect(page.locator("#comparison-table-container")).toContainText("Karl-Liebknecht-Str. 1");

  await page.getByRole("button", { name: "Add Point of Interest" }).click();
  await page.locator("#composer-kind-select").selectOption("DYNAMIC");
  await page.locator("#composer-input").fill("coffee");
  await page.locator("#composer-count-input").fill("0");
  await page.locator("#composer-add-button").click();
  await expect(page.locator("#message-bar")).toContainText("Provide a nearby search query and a count between 1 and 10.");

  await page.locator("#composer-count-input").fill("2");
  await page.locator("#composer-add-button").click();
  await expect(page.locator("#comparison-table-container")).toContainText("nearest coffee #2");
});

test("graph uses 15-minute y-axis ticks, guide lines, and synchronized metadata", async ({ page }) => {
  await bootFakeApp(page);

  await importBoardJson(page, buildGraphBoardState());
  await expect(page.locator("#comparison-graph-container .graph-bar")).toHaveCount(6);
  await expect(page.locator("#comparison-graph-container .graph-grid-line--thirty")).toHaveCount(1);
  await expect(page.locator("#comparison-graph-container .graph-grid-line--sixty")).toHaveCount(1);

  const tickLabels = await page.locator("#comparison-graph-container .graph-y-tick span").allTextContents();
  tickLabels.forEach((label) => {
    expect(durationLabelToMinutes(label) % 15).toBe(0);
  });

  const legendLabels = await page.locator("#comparison-graph-container .graph-legend-item").allTextContents();
  expect(legendLabels.map(normalizeText)).toEqual([
    "Billerbeker Weg 123",
    "Rosa-Luxemburg-Straße 1",
    "Karl-Liebknecht-Str. 1",
  ]);

  await page.locator("#mode-select").selectOption("DRIVING");
  await page.locator("#preset-select").selectOption({ label: "Sunday 11:00" });
  await page.locator("#direction-toggle").click();

  await expect(page.locator(".graph-meta")).toContainText("Travel times by 🚗 Car");
  await expect(page.locator(".graph-meta")).toContainText("Sunday 11:00");
  await expect(page.locator(".graph-meta")).toContainText("Direction: Location ⬅️ Points of Interest");
});

function buildWideBoardState() {
  return {
    version: 1,
    homes: [
      location("home-a", 0, "Karl-Liebknecht-Str. 1", "Karl-Liebknecht-Str. 1, 10178 Berlin, Germany", 52.5216, 13.4098),
      location("home-b", 1, "Rosa-Luxemburg-Straße 1", "Rosa-Luxemburg-Straße 1, 10178 Berlin, Germany", 52.5261, 13.4115),
      location("home-c", 2, "Heinrich-Heine-Straße 1", "Heinrich-Heine-Straße 1, 10179 Berlin, Germany", 52.5117, 13.4165),
      location("home-d", 3, "Miquelstraße 37", "Miquelstraße 37, 14199 Berlin, Germany", 52.4761, 13.2981),
    ],
    fixedDestinations: [
      destination("poi-a", "Berlin Hauptbahnhof", "Berlin Hauptbahnhof, Europaplatz 1, 10557 Berlin, Germany", 52.5251, 13.3694, "fake-place-hbf"),
      destination("poi-b", "Alexanderplatz 1", "Alexanderplatz 1, 10178 Berlin, Germany", 52.5219, 13.4132, "fake-place-alex-1"),
      destination("poi-c", "Tempelhofer Feld", "Tempelhofer Damm, 12101 Berlin, Germany", 52.4736, 13.4025, "fake-place-tempelhof"),
    ],
    dynamicGroups: [
      { id: "dynamic-a", label: "nearest coffee", primaryType: "coffee", count: 3 },
      { id: "dynamic-b", label: "nearest restaurant", primaryType: "restaurant", count: 3 },
    ],
    presets: defaultPresets(),
    selectedPresetId: "preset-a",
    selectedMode: "TRANSIT",
    selectedDirection: "HOME_TO_DESTINATIONS",
    highlightedHomeId: "home-a",
    view: "TABLE",
  };
}

function buildGraphBoardState() {
  return {
    version: 1,
    homes: [
      location("home-far", 0, "Billerbeker Weg 123", "Billerbeker Weg 123, 13507 Berlin, Germany", 52.5923, 13.2865),
      location("home-mid", 1, "Rosa-Luxemburg-Straße 1", "Rosa-Luxemburg-Straße 1, 10178 Berlin, Germany", 52.5261, 13.4115),
      location("home-near", 2, "Karl-Liebknecht-Str. 1", "Karl-Liebknecht-Str. 1, 10178 Berlin, Germany", 52.5216, 13.4098),
    ],
    fixedDestinations: [
      destination("poi-a", "Berlin Hauptbahnhof", "Berlin Hauptbahnhof, Europaplatz 1, 10557 Berlin, Germany", 52.5251, 13.3694, "fake-place-hbf"),
      destination("poi-b", "Tempelhofer Feld", "Tempelhofer Damm, 12101 Berlin, Germany", 52.4736, 13.4025, "fake-place-tempelhof"),
    ],
    dynamicGroups: [],
    presets: defaultPresets(),
    selectedPresetId: "preset-a",
    selectedMode: "WALKING",
    selectedDirection: "HOME_TO_DESTINATIONS",
    highlightedHomeId: "home-far",
    view: "TABLE",
  };
}

function defaultPresets() {
  return [
    { id: "preset-a", dayType: "WEEKDAY", timeLocal: "08:30", label: "Weekday 8:30" },
    { id: "preset-b", dayType: "WEEKDAY", timeLocal: "17:30", label: "Weekday 17:30" },
    { id: "preset-c", dayType: "SUNDAY", timeLocal: "11:00", label: "Sunday 11:00" },
  ];
}

function location(id, colorIndex, label, address, lat, lng) {
  return {
    id,
    colorIndex,
    location: {
      label,
      address,
      placeId: `fake-${id}`,
      lat,
      lng,
    },
  };
}

function destination(id, label, address, lat, lng, placeId) {
  return {
    id,
    label,
    location: {
      label,
      address,
      placeId,
      lat,
      lng,
    },
  };
}

function durationLabelToMinutes(label) {
  const hours = Number((label.match(/(\d+)\s*hr/) || [])[1] || 0);
  const minutes = Number((label.match(/(\d+)\s*min/) || [])[1] || 0);
  return (hours * 60) + minutes;
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}
