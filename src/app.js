import { buildComparisonSnapshot, collectMapDynamicRows, emptySnapshot } from "./comparison.js";
import { loadGoogleMapsApi } from "./google-loader.js";
import { GoogleTravelProvider } from "./google-provider.js";
import { renderComparison, renderModeAndPresetSelectors, renderPresetMenu } from "./render.js";
import { encodeBoardState, buildShareUrl, decodeBoardState, getShareHealth, parseBoardStateFromHash } from "./share.js";
import {
  createDefaultBoardState,
  createDynamicGroup,
  createFixedDestination,
  createHome,
  createPreset,
  sanitizeBoardState,
} from "./state.js";
import { loadBoardState, loadRuntimeConfig, saveBoardState, saveRuntimeConfig } from "./storage.js";
import { debounce, escapeHtml, normalizeDynamicPrimaryType, serializeError } from "./utils.js";

const elements = captureElements();

let boardState = createDefaultBoardState();
let runtimeConfig = {
  ...window.JWD_CONFIG,
  ...loadRuntimeConfig(),
};
let provider = null;
let comparisonSnapshot = emptySnapshot();
let highlightedCell = null;
let mapReady = false;
let selectedPlaces = {
  home: null,
  destination: null,
};
let searchResults = {
  home: [],
  destination: [],
};

initialize();

async function initialize() {
  try {
    await hydrateBoardState();
    bindGlobalEvents();
    syncDestinationDialogMode();
    renderAll();
    await ensureMapProvider();
    await recomputeComparisons();
  } catch (error) {
    setMessage(serializeError(error), "error");
  }
}

async function hydrateBoardState() {
  const sharedHash = parseBoardStateFromHash();
  if (sharedHash) {
    boardState = await decodeBoardState(sharedHash);
    saveBoardState(boardState);
    elements.importBanner.classList.remove("is-hidden");
    setMessage("Loaded board from shared link.", "");
    return;
  }

  const localState = loadBoardState();
  boardState = localState || createDefaultBoardState();
}

function bindGlobalEvents() {
  elements.settingsButton.addEventListener("click", openSettings);
  elements.shareButton.addEventListener("click", openShareDialog);
  elements.presetMenuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.presetMenuPanel.classList.toggle("is-hidden");
    renderAll();
  });
  elements.presetMenuPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  elements.clearShareButton.addEventListener("click", clearShareHash);
  elements.openHomeDialogButton?.addEventListener("click", openHomeDialog);
  elements.openDestinationDialogButton?.addEventListener("click", openDestinationDialog);
  document.addEventListener("click", () => {
    if (!elements.presetMenuPanel.classList.contains("is-hidden")) {
      elements.presetMenuPanel.classList.add("is-hidden");
      renderAll();
    }
    hideSearchResults("home");
    hideSearchResults("destination");
  });

  bindLocationSearch("home", elements.homeSearchInput, elements.homeSearchResults, (location) => {
    selectedPlaces.home = location;
  });
  bindLocationSearch("destination", elements.destinationSearchInput, elements.destinationSearchResults, (location) => {
    selectedPlaces.destination = location;
  });

  elements.cancelHomeButton.addEventListener("click", () => elements.homeDialog.close());
  elements.cancelDestinationButton.addEventListener("click", () => elements.destinationDialog.close());
  elements.destinationKindSelect.addEventListener("change", syncDestinationDialogMode);

  elements.addHomeManualButton.addEventListener("click", () => {
    if (!provider) {
      setMessage("Load the map provider first by saving a working API key in Settings.", "warning");
      return;
    }

    if (!selectedPlaces.home) {
      resolveFirstSearchResult("home")
        .then((location) => {
          if (!location) {
            setMessage("Type an address and choose a result first.", "warning");
            return;
          }

          addHome(location);
          clearSearchSelection("home");
        })
        .catch((error) => setMessage(`Home lookup failed: ${serializeError(error)}`, "error"));
      return;
    }

    addHome(selectedPlaces.home);
    clearSearchSelection("home");
    elements.homeDialog.close();
  });

  elements.addDestinationButton.addEventListener("click", () => {
    if (!provider) {
      setMessage("Load the map provider first by saving a working API key in Settings.", "warning");
      return;
    }

    if (elements.destinationKindSelect.value === "DYNAMIC") {
      const rawPrimaryType = elements.dynamicTypeInput.value.trim();
      const primaryType = normalizeDynamicPrimaryType(rawPrimaryType);
      const count = Number(elements.dynamicCountInput.value);
      if (!primaryType || !Number.isInteger(count) || count < 1 || count > 10) {
        setMessage("Provide a supported nearby place type such as supermarket, restaurant, pharmacy, gym, park, train_station, or subway_station, plus a count between 1 and 10.", "warning");
        return;
      }

      const label = buildDynamicDestinationLabel(primaryType, count);
      const dynamicGroup = createDynamicGroup({ label, primaryType, count });
      updateBoardState({ dynamicGroups: [...boardState.dynamicGroups, dynamicGroup] });
      clearDestinationDialog();
      elements.destinationDialog.close();
      return;
    }

    if (!selectedPlaces.destination) {
      resolveFirstSearchResult("destination")
        .then((location) => {
          if (!location) {
            setMessage("Type an address and choose a result first.", "warning");
            return;
          }

          const label = elements.destinationLabelInput.value.trim() || location.label;
          addDestination(location, label);
          clearSearchSelection("destination");
          elements.destinationLabelInput.value = "";
          elements.destinationDialog.close();
        })
        .catch((error) => setMessage(`Destination lookup failed: ${serializeError(error)}`, "error"));
      return;
    }

    const label = elements.destinationLabelInput.value.trim() || selectedPlaces.destination.label;
    addDestination(selectedPlaces.destination, label);
    clearSearchSelection("destination");
    elements.destinationLabelInput.value = "";
    elements.destinationDialog.close();
  });

  elements.addPresetButton.addEventListener("click", () => {
    const preset = createPreset({
      label: elements.presetLabelInput.value.trim(),
      kind: elements.presetKindInput.value,
      dayType: elements.presetDayInput.value,
      timeLocal: elements.presetTimeInput.value,
    });

    updateBoardState({
      presets: [...boardState.presets, preset],
      selectedPresetId: preset.id,
    });

    elements.presetLabelInput.value = "";
    elements.presetTimeInput.value = "08:30";
  });

  elements.saveSettingsButton.addEventListener("click", async () => {
    runtimeConfig = {
      googleMapsApiKey: elements.apiKeyInput.value.trim(),
      googleMapId: elements.mapIdInput.value.trim(),
    };

    saveRuntimeConfig(runtimeConfig);
    elements.settingsDialog.close();
    provider = null;
    mapReady = false;
    await ensureMapProvider();
    await recomputeComparisons();
  });

  elements.cancelSettingsButton.addEventListener("click", () => {
    elements.settingsDialog.close();
  });

  elements.copyShareLinkButton.addEventListener("click", async () => {
    if (!elements.copyShareLinkButton.disabled) {
      await navigator.clipboard.writeText(elements.shareLinkOutput.value);
      setMessage("Share link copied.", "");
    }
  });

  elements.copyShareJsonButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(elements.shareJsonOutput.value);
    setMessage("JSON export copied.", "");
  });

  elements.importShareJsonButton.addEventListener("click", async () => {
    const raw = elements.shareJsonInput.value.trim();
    if (!raw) {
      setMessage("Paste a JSON board export to import it.", "warning");
      return;
    }

    try {
      const nextState = sanitizeBoardState(JSON.parse(raw));
      boardState = nextState;
      highlightedCell = null;
      saveBoardState(boardState);
      elements.shareDialog.close();
      renderAll();
      await recomputeComparisons();
      setMessage("Imported board from JSON.", "");
    } catch (error) {
      setMessage(`JSON import failed: ${serializeError(error)}`, "error");
    }
  });
}

async function ensureMapProvider() {
  if (!runtimeConfig.googleMapsApiKey) {
    elements.mapStatus.textContent = "Enter a Google Maps API key in Settings or edit config.js to load the map.";
    return;
  }

  if (provider && mapReady) {
    return;
  }

  try {
    const google = await loadGoogleMapsApi(runtimeConfig);
    provider = new GoogleTravelProvider(google, elements.map, runtimeConfig);
    await provider.init();
    provider.setMapClickMode("NONE");
    elements.mapStatus.classList.add("is-hidden");
    mapReady = true;
    renderMap();
  } catch (error) {
    elements.mapStatus.classList.remove("is-hidden");
    elements.mapStatus.textContent = `Map could not load: ${serializeError(error)}`;
    setMessage(`Map could not load: ${serializeError(error)}`, "error");
  }
}

async function recomputeComparisons() {
  if (!provider || !mapReady) {
    renderAll();
    return;
  }

  if (boardState.homes.length === 0 || (boardState.fixedDestinations.length === 0 && boardState.dynamicGroups.length === 0)) {
    comparisonSnapshot = emptySnapshot();
    highlightedCell = null;
    renderAll();
    return;
  }

  setMessage("Computing travel times...", "");

  try {
    comparisonSnapshot = await buildComparisonSnapshot(boardState, provider);
    setMessage("Travel times updated.", "");
  } catch (error) {
    comparisonSnapshot = emptySnapshot();
    setMessage(`Travel-time query failed: ${serializeError(error)}`, "error");
  }

  renderAll();
}

const debouncedRecompute = debounce(recomputeComparisons, 250);

function updateBoardState(partialState, options = {}) {
  boardState = sanitizeBoardState({
    ...boardState,
    ...partialState,
    view: "TABLE",
  });

  if (!boardState.highlightedHomeId && boardState.homes[0]) {
    boardState.highlightedHomeId = boardState.homes[0].id;
  }

  saveBoardState(boardState);
  renderAll();
  if (options.recompute !== false) {
    debouncedRecompute();
  }
}

function addHome(location) {
  const homes = [...boardState.homes, createHome(location)];
  updateBoardState({
    homes,
    highlightedHomeId: boardState.highlightedHomeId || homes[0]?.id,
  });
}

function addDestination(location, label) {
  updateBoardState({
    fixedDestinations: [...boardState.fixedDestinations, createFixedDestination(location, label)],
  });
}

function bindLocationSearch(kind, inputElement, resultsElement, onSelect) {
  const debouncedSearch = debounce(async () => {
    if (!provider) {
      return;
    }

    const query = inputElement.value.trim();
    if (query.length < 3) {
      searchResults[kind] = [];
      hideSearchResults(kind);
      return;
    }

    try {
      const results = await provider.geocode(query);
      searchResults[kind] = results.slice(0, 5);
      renderSearchResults(kind);
    } catch (error) {
      setMessage(`Search failed: ${serializeError(error)}`, "error");
    }
  }, 250);

  inputElement.addEventListener("input", (event) => {
    event.stopPropagation();
    selectedPlaces[kind] = null;
    debouncedSearch();
  });

  inputElement.addEventListener("focus", (event) => {
    event.stopPropagation();
    if (searchResults[kind].length) {
      renderSearchResults(kind);
    }
  });

  inputElement.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  inputElement.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const location = await resolveFirstSearchResult(kind);
    if (!location) {
      setMessage("No matching result found for that query.", "warning");
      return;
    }

    onSelect(location);
    inputElement.value = location.address || location.label;
    hideSearchResults(kind);
    setMessage(`Selected ${kind}: ${location.label}`, "");
  });

  resultsElement.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

async function resolveFirstSearchResult(kind) {
  if (selectedPlaces[kind]) {
    return selectedPlaces[kind];
  }

  const inputElement = kind === "home" ? elements.homeSearchInput : elements.destinationSearchInput;
  const query = inputElement.value.trim();
  if (!query || !provider) {
    return null;
  }

  const existingResults = searchResults[kind];
  if (existingResults.length) {
    const first = existingResults[0];
    selectedPlaces[kind] = first;
    inputElement.value = first.address || first.label;
    hideSearchResults(kind);
    return first;
  }

  const results = await provider.geocode(query);
  const first = results[0] || null;
  if (first) {
    selectedPlaces[kind] = first;
    inputElement.value = first.address || first.label;
  }
  searchResults[kind] = results.slice(0, 5);
  hideSearchResults(kind);
  return first;
}

function renderSearchResults(kind) {
  const listElement = kind === "home" ? elements.homeSearchResults : elements.destinationSearchResults;
  const inputElement = kind === "home" ? elements.homeSearchInput : elements.destinationSearchInput;
  const results = searchResults[kind];

  if (!results.length) {
    hideSearchResults(kind);
    return;
  }

  listElement.innerHTML = "";
  results.forEach((location) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `
      <div class="search-result-title">${escapeHtml(location.label)}</div>
      <div class="search-result-subtitle">${escapeHtml(location.address || "")}</div>
    `;
    button.addEventListener("click", () => {
      selectedPlaces[kind] = location;
      inputElement.value = location.address || location.label;
      hideSearchResults(kind);
      setMessage(`Selected ${kind}: ${location.label}`, "");
    });
    item.append(button);
    listElement.append(item);
  });

  listElement.classList.remove("is-hidden");
}

function hideSearchResults(kind) {
  const listElement = kind === "home" ? elements.homeSearchResults : elements.destinationSearchResults;
  listElement.classList.add("is-hidden");
}

function clearSearchSelection(kind) {
  selectedPlaces[kind] = null;
  searchResults[kind] = [];
  if (kind === "home") {
    elements.homeSearchInput.value = "";
  } else {
    elements.destinationSearchInput.value = "";
  }
  hideSearchResults(kind);
}

function clearDestinationDialog() {
  clearSearchSelection("destination");
  elements.destinationLabelInput.value = "";
  elements.dynamicTypeInput.value = "";
  elements.dynamicCountInput.value = "3";
  elements.destinationKindSelect.value = "FIXED";
  syncDestinationDialogMode();
}

function syncDestinationDialogMode() {
  const isDynamic = elements.destinationKindSelect.value === "DYNAMIC";
  elements.fixedDestinationFields.classList.toggle("is-hidden", isDynamic);
  elements.dynamicDestinationFields.classList.toggle("is-hidden", !isDynamic);
  elements.addDestinationButton.textContent = isDynamic ? "Add Dynamic Destination" : "Add Destination";
}

function openHomeDialog() {
  clearSearchSelection("home");
  elements.homeDialog.showModal();
  elements.homeSearchInput.focus();
}

function openDestinationDialog() {
  clearDestinationDialog();
  elements.destinationDialog.showModal();
  elements.destinationKindSelect.focus();
}

function buildDynamicDestinationLabel(primaryType, count) {
  const normalized = primaryType.replaceAll("_", " ");
  return `nearest ${normalized}`;
}

function openSettings() {
  elements.apiKeyInput.value = runtimeConfig.googleMapsApiKey || "";
  elements.mapIdInput.value = runtimeConfig.googleMapId || "";
  elements.settingsDialog.showModal();
}

async function openShareDialog() {
  const encoded = await encodeBoardState(boardState);
  const url = buildShareUrl(encoded);
  const shareHealth = getShareHealth(url);

  elements.shareLinkOutput.value = url;
  elements.shareJsonOutput.value = JSON.stringify(boardState, null, 2);
  elements.copyShareLinkButton.disabled = shareHealth.blocked;
  elements.shareSummary.textContent = shareHealth.blocked
    ? `Share link blocked at ${shareHealth.length} characters. Use the JSON export instead.`
    : shareHealth.warning
      ? `Share link is ${shareHealth.length} characters long. It may be too long for some apps.`
      : `Share link is ${shareHealth.length} characters long.`;
  elements.shareDialog.showModal();
}

function clearShareHash() {
  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState(null, "", url.toString());
  elements.importBanner.classList.add("is-hidden");
  setMessage("Removed shared hash from the URL. The current board stays as the local draft.", "");
}

function renderAll() {
  renderModeAndPresetSelectors(elements, boardState, {
    onSelectMode: (value) => updateBoardState({ selectedMode: value }),
    onSelectPreset: (value) => updateBoardState({ selectedPresetId: value }),
  });

  renderPresetMenu(elements, boardState, {
    onSelectPreset: (presetId) => updateBoardState({ selectedPresetId: presetId }),
    onRemovePreset: (presetId) =>
      updateBoardState({
        presets: boardState.presets.filter((preset) => preset.id !== presetId),
        selectedPresetId:
          boardState.selectedPresetId === presetId
            ? boardState.presets.find((preset) => preset.id !== presetId)?.id
            : boardState.selectedPresetId,
      }),
  });

  renderComparison(elements, boardState, comparisonSnapshot, highlightedCell, {
    onSelectCell: handleCellSelection,
    onCenterHome: centerHomeById,
    onCenterDestination: centerDestinationById,
    onRemoveHome: (homeId) => updateBoardState({ homes: boardState.homes.filter((home) => home.id !== homeId) }),
    onRemoveDestination: (destinationId) =>
      updateBoardState({ fixedDestinations: boardState.fixedDestinations.filter((item) => item.id !== destinationId) }),
    onRemoveDynamic: (dynamicId) =>
      updateBoardState({ dynamicGroups: boardState.dynamicGroups.filter((item) => item.id !== dynamicId) }),
    onOpenHomeDialog: openHomeDialog,
    onOpenDestinationDialog: openDestinationDialog,
  });
  renderMap();
}

function renderMap() {
  if (!provider || !mapReady) {
    return;
  }

  const selectedPreset = boardState.presets.find((preset) => preset.id === boardState.selectedPresetId);
  const dynamicRows = collectMapDynamicRows(comparisonSnapshot, boardState);
  provider.renderMarkers(boardState, dynamicRows, {
    highlight: highlightedCell
      ? {
          homeLocation: boardState.homes[highlightedCell.homeIndex]?.location,
          destinationLocation: findDestinationLocation(highlightedCell),
          mode: boardState.selectedMode,
          preset: selectedPreset,
        }
      : null,
  });
}

function handleCellSelection(rowId, homeIndex) {
  highlightedCell = { rowId, homeIndex };
  const home = boardState.homes[homeIndex];
  if (home) {
    boardState.highlightedHomeId = home.id;
    saveBoardState(boardState);
  }
  renderAll();
}

function centerHomeById(homeId) {
  const home = boardState.homes.find((item) => item.id === homeId);
  if (!home || !provider) {
    return;
  }

  provider.centerLocation(home.location);
}

function centerDestinationById(destinationId, kind) {
  if (!provider || kind !== "fixed") {
    return;
  }

  const destination = boardState.fixedDestinations.find((item) => item.id === destinationId);
  if (!destination) {
    return;
  }

  provider.centerLocation(destination.location);
}

function findDestinationLocation(cellSelection) {
  const row = comparisonSnapshot.rows.find((item) => item.id === cellSelection.rowId);
  return row?.cells[cellSelection.homeIndex]?.destinationLocation || null;
}

function setMessage(message, tone = "") {
  const visible = tone === "warning" || tone === "error";
  elements.messageBar.textContent = message;
  elements.messageBar.classList.toggle("is-hidden", !visible);
  elements.messageBar.classList.toggle("is-warning", tone === "warning");
  elements.messageBar.classList.toggle("is-error", tone === "error");
}

function captureElements() {
  return {
    modeSelect: document.querySelector("#mode-select"),
    presetSelect: document.querySelector("#preset-select"),
    presetMenuButton: document.querySelector("#preset-menu-button"),
    presetMenuPanel: document.querySelector("#preset-menu-panel"),
    shareButton: document.querySelector("#share-button"),
    settingsButton: document.querySelector("#settings-button"),
    clearShareButton: document.querySelector("#clear-share-button"),
    importBanner: document.querySelector("#import-banner"),
    messageBar: document.querySelector("#message-bar"),
    map: document.querySelector("#map"),
    mapStatus: document.querySelector("#map-status"),
    homeDialog: document.querySelector("#home-dialog"),
    homeSearchInput: document.querySelector("#home-search-input"),
    homeSearchResults: document.querySelector("#home-search-results"),
    cancelHomeButton: document.querySelector("#cancel-home-button"),
    destinationDialog: document.querySelector("#destination-dialog"),
    destinationKindSelect: document.querySelector("#destination-kind-select"),
    fixedDestinationFields: document.querySelector("#fixed-destination-fields"),
    dynamicDestinationFields: document.querySelector("#dynamic-destination-fields"),
    destinationSearchInput: document.querySelector("#destination-search-input"),
    destinationSearchResults: document.querySelector("#destination-search-results"),
    destinationLabelInput: document.querySelector("#destination-label-input"),
    dynamicTypeInput: document.querySelector("#dynamic-type-input"),
    dynamicCountInput: document.querySelector("#dynamic-count-input"),
    addDestinationButton: document.querySelector("#add-destination-button"),
    cancelDestinationButton: document.querySelector("#cancel-destination-button"),
    presetLabelInput: document.querySelector("#preset-label-input"),
    presetKindInput: document.querySelector("#preset-kind-input"),
    presetDayInput: document.querySelector("#preset-day-input"),
    presetTimeInput: document.querySelector("#preset-time-input"),
    addHomeManualButton: document.querySelector("#add-home-manual-button"),
    addPresetButton: document.querySelector("#add-preset-button"),
    presetsList: document.querySelector("#presets-list"),
    presetsCount: document.querySelector("#presets-count"),
    comparisonStatus: document.querySelector("#comparison-status"),
    comparisonTableContainer: document.querySelector("#comparison-table-container"),
    comparisonGraphContainer: document.querySelector("#comparison-graph-container"),
    comparisonFootnote: document.querySelector("#comparison-footnote"),
    settingsDialog: document.querySelector("#settings-dialog"),
    apiKeyInput: document.querySelector("#api-key-input"),
    mapIdInput: document.querySelector("#map-id-input"),
    saveSettingsButton: document.querySelector("#save-settings-button"),
    cancelSettingsButton: document.querySelector("#cancel-settings-button"),
    shareDialog: document.querySelector("#share-dialog"),
    shareSummary: document.querySelector("#share-summary"),
    shareLinkOutput: document.querySelector("#share-link-output"),
    shareJsonOutput: document.querySelector("#share-json-output"),
    shareJsonInput: document.querySelector("#share-json-input"),
    copyShareLinkButton: document.querySelector("#copy-share-link-button"),
    copyShareJsonButton: document.querySelector("#copy-share-json-button"),
    importShareJsonButton: document.querySelector("#import-share-json-button"),
  };
}
