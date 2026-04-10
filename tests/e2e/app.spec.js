const { test, expect } = require("@playwright/test");
const { addDynamicPoi, addFixedPoi, addLocation, bootFakeApp, importBoardJson } = require("./helpers");
const { installHeadedSceneBreaks } = require("./headed-scene-break");

installHeadedSceneBreaks(test);

test("can add locations and Points of Interest through the main UI", async ({ page }) => {
  await bootFakeApp(page);

  await addLocation(page, "Karl-Liebknecht-Str. 1");
  await expect(page.locator("#comparison-table-container")).toContainText("Karl-Liebknecht-Str. 1");

  await addFixedPoi(page, "Berlin Hauptbahnhof");
  await expect(page.locator("#comparison-table-container")).toContainText("Berlin Hauptbahnhof");

  await addDynamicPoi(page, "coffee", 2);
  await expect(page.locator("#comparison-table-container")).toContainText("nearest coffee #1");
  await expect(page.locator("#comparison-table-container")).toContainText("nearest coffee #2");
  await expect(page.locator(".graph-bar").first()).toBeVisible();
});

test("imported board JSON updates mode, preset, and direction in the UI", async ({ page }) => {
  await bootFakeApp(page);

  const importedState = {
    version: 1,
    homes: [
      {
        id: "home-import-1",
        colorIndex: 1,
        location: {
          label: "Imported Home",
          address: "Alexanderplatz 1, 10178 Berlin, Germany",
          placeId: "fake-import-home",
          lat: 52.5219,
          lng: 13.4132,
        },
      },
    ],
    fixedDestinations: [
      {
        id: "destination-import-1",
        label: "Imported POI",
        location: {
          label: "Imported POI",
          address: "Berlin Hauptbahnhof, Europaplatz 1, 10557 Berlin, Germany",
          placeId: "fake-import-destination",
          lat: 52.5251,
          lng: 13.3694,
        },
      },
    ],
    dynamicGroups: [],
    presets: [
      { id: "preset-import-1", dayType: "WEEKDAY", timeLocal: "08:30", label: "Weekday 8:30" },
      { id: "preset-import-2", dayType: "SUNDAY", timeLocal: "11:00", label: "Sunday 11:00" },
    ],
    selectedPresetId: "preset-import-2",
    selectedMode: "WALKING",
    selectedDirection: "DESTINATIONS_TO_HOME",
    highlightedHomeId: "home-import-1",
    view: "GRAPH",
  };

  await importBoardJson(page, importedState);

  await expect(page.locator("#mode-select")).toHaveValue("WALKING");
  await expect(page.locator("#preset-select")).toHaveValue("preset-import-2");
  await expect(page.locator(".graph-meta")).toContainText("Travel times by 🚶 Walk");
  await expect(page.locator(".graph-meta")).toContainText("Sunday 11:00");
  await expect(page.locator(".graph-meta")).toContainText("Direction: Location ⬅️ Points of Interest");
});

test("share dialog exports the current board JSON state", async ({ page }) => {
  await bootFakeApp(page);

  await addLocation(page, "Karl-Liebknecht-Str. 1", "Home Base");
  await addFixedPoi(page, "Berlin Hauptbahnhof", "Office");
  await page.locator("#mode-select").selectOption("DRIVING");
  await page.locator("#direction-toggle").click();

  await page.getByRole("button", { name: "Share" }).click();
  const exported = JSON.parse(await page.locator("#share-json-output").inputValue());

  expect(exported.selectedMode).toBe("DRIVING");
  expect(exported.selectedDirection).toBe("DESTINATIONS_TO_HOME");
  expect(exported.homes[0].location.label).toBe("Home Base");
  expect(exported.fixedDestinations[0].label).toBe("Office");
});

test("delete confirmations still work for multiple sequential deletes", async ({ page }) => {
  await bootFakeApp(page);

  await importBoardJson(page, {
    version: 1,
    homes: [
      {
        id: "home-a",
        colorIndex: 0,
        location: { label: "Karl-Liebknecht-Str. 1", address: "Karl-Liebknecht-Str. 1, 10178 Berlin, Germany", lat: 52.5216, lng: 13.4098 },
      },
      {
        id: "home-b",
        colorIndex: 2,
        location: { label: "Rosa-Luxemburg-Straße 1", address: "Rosa-Luxemburg-Straße 1, 10178 Berlin, Germany", lat: 52.5261, lng: 13.4115 },
      },
    ],
    fixedDestinations: [
      {
        id: "poi-a",
        label: "Berlin Hauptbahnhof",
        location: { label: "Berlin Hauptbahnhof", address: "Berlin Hauptbahnhof, Europaplatz 1, 10557 Berlin, Germany", lat: 52.5251, lng: 13.3694 },
      },
      {
        id: "poi-b",
        label: "Heinrich-Heine-Straße 1",
        location: { label: "Heinrich-Heine-Straße 1", address: "Heinrich-Heine-Straße 1, 10179 Berlin, Germany", lat: 52.5117, lng: 13.4165 },
      },
    ],
    dynamicGroups: [],
    presets: [{ id: "preset-a", dayType: "WEEKDAY", timeLocal: "08:30", label: "Weekday 8:30" }],
    selectedPresetId: "preset-a",
    selectedMode: "TRANSIT",
    selectedDirection: "HOME_TO_DESTINATIONS",
    highlightedHomeId: "home-a",
    view: "TABLE",
  });

  await page.locator('[data-request-delete-kind="home"]').first().click();
  await expect(page.locator('[data-confirm-delete-kind="home"]').first()).toBeVisible();
  await page.locator('[data-confirm-delete-kind="home"]').first().click();
  await expect(page.locator("#comparison-table-container")).not.toContainText("Karl-Liebknecht-Str. 1");

  await page.locator('[data-request-delete-kind="destination"]').first().click();
  await expect(page.locator('[data-confirm-delete-kind="destination"]').first()).toBeVisible();
  await page.locator('[data-confirm-delete-kind="destination"]').first().click();
  await expect(page.locator("#comparison-table-container")).not.toContainText("Berlin Hauptbahnhof");

  await page.locator('[data-request-delete-kind="home"]').first().click();
  await expect(page.locator('[data-confirm-delete-kind="home"]').first()).toBeVisible();
});

test("map pick flow works with the fake provider", async ({ page }) => {
  await bootFakeApp(page);

  await page.getByRole("button", { name: "Add Candidate Location" }).click();
  await page.getByRole("button", { name: "Select on map" }).click();
  await page.locator("#map").click({ position: { x: 180, y: 140 } });
  await expect(page.locator("#composer-map-detail")).not.toContainText("Click on the map to place");
  await page.getByRole("button", { name: "Confirm Location" }).click();

  await expect(page.locator("#comparison-table-container")).toContainText("Pinned");
});
