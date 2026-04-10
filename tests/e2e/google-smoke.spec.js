const { test, expect } = require("@playwright/test");
const { bootRealApp } = require("./helpers");

const googleMapsApiKey = process.env.JWD_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";

test("real Google provider can geocode, resolve nearby results, and highlight a route", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Real-provider smoke coverage runs in Chromium only.");
  test.skip(process.env.JWD_RUN_REAL_PROVIDER !== "1", "Set JWD_RUN_REAL_PROVIDER=1 to enable real Google smoke coverage.");
  test.skip(!googleMapsApiKey, "Provide JWD_GOOGLE_MAPS_API_KEY or GOOGLE_MAPS_API_KEY to run real Google smoke coverage.");
  test.slow();

  await bootRealApp(page, googleMapsApiKey);

  await expect(page.locator("#settings-dialog")).not.toBeVisible();
  await page.waitForFunction(() => Boolean(window.google?.maps?.importLibrary));
  await expect(page.locator("#map-status")).toHaveClass(/is-hidden/);
  await assertMapProviderHealthy(page);

  await addRealGeocodedEntry(page, "Add Candidate Location", "Karl-Liebknecht-Str. 1, 10178 Berlin");
  await waitForBoardStateCounts(page, {
    homes: 1,
    fixedDestinations: 0,
  });

  await addRealGeocodedEntry(page, "Add Point of Interest", "Berlin Hauptbahnhof");
  await waitForBoardStateCounts(page, {
    homes: 1,
    fixedDestinations: 1,
  });

  await page.getByRole("button", { name: "Add Point of Interest" }).click();
  await page.locator("#composer-kind-select").selectOption("DYNAMIC");
  await page.locator("#composer-input").fill("supermarket");
  await page.locator("#composer-count-input").fill("1");
  await page.locator("#composer-add-button").click();
  await waitForBoardStateCounts(page, {
    homes: 1,
    fixedDestinations: 1,
    dynamicGroups: 1,
  });
  await expect(page.locator("#comparison-table-container")).toContainText("nearest supermarket #1");

  await expect(page.locator("#map")).toHaveAttribute("data-marker-count", /[1-9]\d*/, { timeout: 15_000 });
  await expect(page.locator("#comparison-table-container .comparison-cell-hitarea")).toHaveCount(2, { timeout: 15_000 });
  await page.locator("#comparison-table-container .comparison-cell-hitarea").first().click();
  await expect(page.locator("#map")).toHaveAttribute("data-highlight-state", /route|fallback/, { timeout: 15_000 });
});

async function readBoardStateCounts(page) {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("jwd.boardState.v1");
    const boardState = raw ? JSON.parse(raw) : null;
    return {
      homes: boardState?.homes?.length || 0,
      fixedDestinations: boardState?.fixedDestinations?.length || 0,
      dynamicGroups: boardState?.dynamicGroups?.length || 0,
    };
  });
}

async function addRealGeocodedEntry(page, launcherName, query) {
  await page.getByRole("button", { name: launcherName }).click();
  await page.locator("#composer-input").fill(query);
  await page.locator("#composer-add-button").click();
}

async function waitForBoardStateCounts(page, expectedCounts, timeout = 20_000) {
  const startTime = Date.now();

  while ((Date.now() - startTime) < timeout) {
    const counts = await readBoardStateCounts(page);
    const matches = Object.entries(expectedCounts).every(([key, value]) => counts[key] === value);
    if (matches) {
      return counts;
    }

    const providerFailure = await readProviderFailure(page);
    if (providerFailure) {
      throw new Error(`Real-provider smoke failed: ${providerFailure}`);
    }

    await page.waitForTimeout(250);
  }

  const counts = await readBoardStateCounts(page);
  const providerFailure = await readProviderFailure(page);
  throw new Error(
    `Timed out waiting for board state ${JSON.stringify(expectedCounts)}. `
      + `Observed ${JSON.stringify(counts)}.`
      + (providerFailure ? ` Failure: ${providerFailure}` : ""),
  );
}

async function assertMapProviderHealthy(page) {
  const providerFailure = await readProviderFailure(page);
  if (providerFailure) {
    throw new Error(`Real-provider smoke cannot start because Google Maps is already failing: ${providerFailure}`);
  }
}

async function readProviderFailure(page) {
  const visibleMessage = await readVisibleMessage(page);
  if (visibleMessage) {
    return visibleMessage;
  }

  return readMapFailure(page);
}

async function readVisibleMessage(page) {
  return page.evaluate(() => {
    const messageBar = document.querySelector("#message-bar");
    if (!messageBar || messageBar.classList.contains("is-hidden")) {
      return "";
    }
    return messageBar.textContent.trim();
  });
}

async function readMapFailure(page) {
  return page.evaluate(() => {
    const map = document.querySelector("#map");
    const text = map?.textContent?.replace(/\s+/g, " ").trim() || "";
    if (!/didn't load google maps correctly|something went wrong|for development purposes only/i.test(text)) {
      return "";
    }
    return text;
  });
}
