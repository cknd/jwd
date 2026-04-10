const { test, expect } = require("@playwright/test");
const { bootFakeApp, importBoardJson } = require("./helpers");
const { installHeadedSceneBreaks } = require("./headed-scene-break");

installHeadedSceneBreaks(test);

test("wide table layout stays stable while horizontally scrolled", async ({ page }) => {
  await bootFakeApp(page);
  await page.setViewportSize({ width: 1600, height: 1300 });

  await importBoardJson(page, buildWideBoardState());
  await expect(page.locator("#comparison-table-container")).toContainText("nearest coffee #3");

  await page.locator("#comparison-table-container").evaluate((element) => {
    element.scrollLeft = 520;
  });
  await page.waitForTimeout(150);

  await expect(page.locator("#comparison-table-container")).toHaveScreenshot("wide-table-scroll.png", {
    animations: "disabled",
    caret: "hide",
  });
});

test("graph layout stays stable for a wide board", async ({ page }) => {
  await bootFakeApp(page);
  await page.setViewportSize({ width: 1600, height: 1300 });

  await importBoardJson(page, buildWideBoardState());
  await expect(page.locator("#comparison-graph-container .graph-bar")).toHaveCount(36);

  await expect(page.locator("#comparison-graph-container")).toHaveScreenshot("wide-graph.png", {
    animations: "disabled",
    caret: "hide",
  });
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
    presets: [
      { id: "preset-a", dayType: "WEEKDAY", timeLocal: "08:30", label: "Weekday 8:30" },
      { id: "preset-b", dayType: "WEEKDAY", timeLocal: "17:30", label: "Weekday 17:30" },
      { id: "preset-c", dayType: "SUNDAY", timeLocal: "11:00", label: "Sunday 11:00" },
    ],
    selectedPresetId: "preset-a",
    selectedMode: "TRANSIT",
    selectedDirection: "HOME_TO_DESTINATIONS",
    highlightedHomeId: "home-a",
    view: "TABLE",
  };
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
