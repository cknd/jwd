import { buildComparisonSnapshot, collectMapDynamicRows, emptySnapshot } from "./comparison.js";
import { loadGoogleMapsApi } from "./google-loader.js";
import { GoogleTravelProvider } from "./google-provider.js";
import { renderComparison, renderModeAndPresetSelectors, renderPresetMenu } from "./render.js";
import {
  createDefaultBoardState,
  createDynamicGroup,
  createFixedDestination,
  createHome,
  createPreset,
  sanitizeBoardState,
} from "./state.js";
import { clearLocalStorageData, loadBoardState, loadRuntimeConfig, saveBoardState, saveRuntimeConfig } from "./storage.js";
import { debounce, escapeHtml, pickNextHomeColorIndex, serializeError } from "./utils.js";

const elements = captureElements();

let boardState = createDefaultBoardState();
let runtimeConfig = {
  ...window.JWD_CONFIG,
  ...loadRuntimeConfig(),
};
let provider = null;
let comparisonSnapshot = emptySnapshot();
let highlightedCell = null;
let tableFocus = null;
let mapReady = false;
let preserveMapViewport = false;
let pendingDelete = null;
let composerState = {
  target: null,
  destinationKind: "FIXED",
  editing: null,
};
let activeMapPick = null;
let selectedPlaces = {
  home: null,
  destination: null,
};
let searchResults = {
  home: [],
  destination: [],
};
let searchFeedback = {
  home: "",
  destination: "",
};
let hasPromptedForApiKey = false;

initialize();

async function initialize() {
  try {
    await hydrateBoardState();
    bindGlobalEvents();
    renderAll();
    maybePromptForApiKey();
    await ensureMapProvider();
    await recomputeComparisons();
  } catch (error) {
    setMessage(serializeError(error), "error");
  }
}

async function hydrateBoardState() {
  const localState = loadBoardState();
  boardState = localState || createDefaultBoardState();
}

function bindGlobalEvents() {
  elements.settingsButton.addEventListener("click", openSettings);
  elements.shareButton.addEventListener("click", openShareDialog);
  elements.loadButton.addEventListener("click", openLoadDialog);
  elements.presetMenuPanel.addEventListener("click", (event) => {
    event.stopPropagation();
  });
  elements.directionToggle.addEventListener("click", () =>
    updateBoardState({
      selectedDirection:
        boardState.selectedDirection === "HOME_TO_DESTINATIONS" ? "DESTINATIONS_TO_HOME" : "HOME_TO_DESTINATIONS",
    }),
  );
  document.addEventListener("click", (event) => {
    let needsRender = false;

    if (!elements.presetMenuPanel.classList.contains("is-hidden")) {
      elements.presetMenuPanel.classList.add("is-hidden");
      needsRender = true;
    }
    hideSearchResults("home");
    hideSearchResults("destination");
    if (pendingDelete && !(event.target instanceof Element && event.target.closest("[data-delete-control]"))) {
      pendingDelete = null;
      needsRender = true;
    }
    if (shouldClearSelectionOnDocumentClick(event.target)) {
      if (clearActiveSelection({ render: false })) {
        needsRender = true;
      }
    }
    if (needsRender) {
      renderAll();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }

    if (activeMapPick || composerState.target) {
      event.preventDefault();
      resetComposer();
    }
  });

  document.addEventListener("dragover", (event) => {
    if (!hasJsonFile(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    elements.dropOverlay.classList.remove("is-hidden");
  });

  document.addEventListener("dragleave", (event) => {
    if (!(event.target instanceof Node) || !document.documentElement.contains(event.relatedTarget)) {
      elements.dropOverlay.classList.add("is-hidden");
    }
  });

  document.addEventListener("drop", (event) => {
    if (!hasJsonFile(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    elements.dropOverlay.classList.add("is-hidden");
    const file = event.dataTransfer.files?.[0];
    if (file) {
      importBoardStateFromFile(file).catch((error) => {
        setMessage(`JSON import failed: ${serializeError(error)}`, "error");
      });
    }
  });

  bindLocationSearch();

  elements.activatePlaceButton.addEventListener("click", () => activateComposer("home"));
  elements.activateDestinationButton.addEventListener("click", () => activateComposer("destination"));
  elements.composerKindSelect.addEventListener("change", () => {
    composerState.destinationKind = elements.composerKindSelect.value;
    selectedPlaces.destination = null;
    searchResults.destination = [];
    applyComposerDefaults();
    renderComposer();
  });
  elements.composerCountInput.addEventListener("input", () => {
    renderComposer();
  });
  elements.composerMapButton.addEventListener("click", () => startMapPick(composerState.target));
  elements.composerAddButton.addEventListener("click", () => {
    submitComposer().catch((error) => setMessage(`Add failed: ${serializeError(error)}`, "error"));
  });
  elements.composerCancelButton.addEventListener("click", resetComposer);
  elements.composerMapConfirmButton.addEventListener("click", confirmMapPick);
  elements.composerMapCancelButton.addEventListener("click", resetComposer);

  elements.addPresetButton.addEventListener("click", () => {
    const preset = createPreset({
      dayType: elements.presetDayInput.value,
      timeLocal: elements.presetTimeInput.value,
    });

    updateBoardState({
      presets: [...boardState.presets, preset],
      selectedPresetId: preset.id,
    });

    elements.presetDayInput.value = "WEEKDAY";
    elements.presetTimeInput.value = "08:30";
  });

  elements.saveSettingsButton.addEventListener("click", async () => {
    const apiKey = elements.apiKeyInput.value.trim();
    if (!apiKey) {
      elements.settingsRequiredNote.classList.remove("is-hidden");
      elements.apiKeyInput.focus();
      return;
    }

    runtimeConfig = {
      googleMapsApiKey: apiKey,
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

  elements.clearLocalStorageButton.addEventListener("click", async () => {
    clearLocalStorageData();
    runtimeConfig = {
      ...window.JWD_CONFIG,
    };
    boardState = createDefaultBoardState();
    comparisonSnapshot = emptySnapshot();
    highlightedCell = null;
    tableFocus = null;
    pendingDelete = null;
    resetComposer();
    elements.settingsDialog.close();
    provider = null;
    mapReady = false;
    renderAll();
    maybePromptForApiKey(true);
    await ensureMapProvider();
    await recomputeComparisons();
    setMessage("Deleted local storage and reset the local board.", "");
  });

  elements.copyShareJsonButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(elements.shareJsonOutput.value);
    setMessage("JSON export copied.", "");
  });

  elements.downloadShareJsonButton.addEventListener("click", () => {
    downloadBoardStateJson();
  });

  elements.importLoadJsonButton.addEventListener("click", async () => {
    await importBoardStateFromText(elements.loadJsonInput.value, { closeDialog: true });
  });

  elements.uploadLoadJsonButton.addEventListener("click", () => {
    elements.loadJsonFileInput.click();
  });

  elements.loadJsonFileInput.addEventListener("change", async () => {
    const file = elements.loadJsonFileInput.files?.[0];
    if (!file) {
      return;
    }
    await importBoardStateFromFile(file, { closeDialog: true });
    elements.loadJsonFileInput.value = "";
  });
}

async function ensureMapProvider() {
  if (!runtimeConfig.googleMapsApiKey) {
    elements.mapStatus.textContent = "Enter a Google Maps API key in Settings to load the map.";
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

function addPlace(location) {
  const customLabel = elements.composerNameInput.value.trim();
  const nextLocation = customLabel ? { ...location, label: customLabel } : location;
  const homes = [createHome(nextLocation, { colorIndex: pickNextHomeColorIndex(boardState.homes) }), ...boardState.homes];
  updateBoardState({
    homes,
    highlightedHomeId: homes[0]?.id,
  });
}

function addDestination(location, label) {
  const customLabel = elements.composerNameInput.value.trim();
  updateBoardState({
    fixedDestinations: [createFixedDestination(location, customLabel || label), ...boardState.fixedDestinations],
  });
}

function bindLocationSearch() {
  const debouncedSearch = debounce(async () => {
    if (!provider) {
      return;
    }

    const kind = composerState.target;
    if (!kind) {
      return;
    }

    if (composerState.target !== kind || activeMapPick) {
      hideSearchResults(kind);
      return;
    }

    if (kind === "destination" && composerState.destinationKind === "DYNAMIC") {
      searchResults[kind] = [];
      searchFeedback[kind] = "";
      hideSearchResults(kind);
      return;
    }

    const query = elements.composerInput.value.trim();
    if (query.length < 3) {
      searchResults[kind] = [];
      searchFeedback[kind] = "";
      hideSearchResults(kind);
      return;
    }

    try {
      const results = await provider.geocode(query);
      searchResults[kind] = results.slice(0, 5);
      searchFeedback[kind] = results.length ? "" : buildSearchFeedback(kind, "ZERO_RESULTS");
      renderSearchResults(kind);
    } catch (error) {
      searchResults[kind] = [];
      const message = serializeError(error);
      searchFeedback[kind] = buildSearchFeedback(kind, message);
      if (searchFeedback[kind]) {
        renderSearchResults(kind);
      } else {
        setMessage(`Search failed: ${message}`, "error");
      }
    }
  }, 250);

  elements.composerInput.addEventListener("input", (event) => {
    event.stopPropagation();
    const activeKind = composerState.target;
    if (!activeKind) {
      return;
    }

    selectedPlaces[activeKind] = null;
    searchFeedback[activeKind] = "";
    if (activeKind === "destination" && composerState.destinationKind === "DYNAMIC") {
      hideSearchResults(activeKind);
      return;
    }
    debouncedSearch();
  });

  elements.composerInput.addEventListener("focus", (event) => {
    event.stopPropagation();
    const activeKind = composerState.target;
    if (!activeKind) {
      return;
    }

    if (searchResults[activeKind].length) {
      renderSearchResults(activeKind);
    }
  });

  elements.composerInput.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  elements.composerInput.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    await submitComposer();
  });

  elements.composerSearchResults.addEventListener("click", (event) => {
    event.stopPropagation();
  });
}

async function resolveFirstSearchResult(kind) {
  if (selectedPlaces[kind]) {
    return selectedPlaces[kind];
  }

  const query = elements.composerInput.value.trim();
  if (!query || !provider) {
    return null;
  }

  const existingResults = searchResults[kind];
  if (existingResults.length) {
    const first = existingResults[0];
    selectedPlaces[kind] = first;
    elements.composerInput.value = first.address || first.label;
    hideSearchResults(kind);
    return first;
  }

  const results = await provider.geocode(query);
  const first = results[0] || null;
  if (first) {
    selectedPlaces[kind] = first;
    elements.composerInput.value = first.address || first.label;
  }
  searchResults[kind] = results.slice(0, 5);
  hideSearchResults(kind);
  return first;
}

function renderSearchResults(kind) {
  const listElement = elements.composerSearchResults;
  const results = searchResults[kind];
  const feedback = searchFeedback[kind];

  if (!results.length && !feedback) {
    hideSearchResults(kind);
    return;
  }

  listElement.innerHTML = "";
  if (feedback) {
    const item = document.createElement("li");
    item.innerHTML = `<div class="search-result-empty">${escapeHtml(feedback)}</div>`;
    listElement.append(item);
    listElement.classList.remove("is-hidden");
    return;
  }

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
      elements.composerInput.value = location.address || location.label;
      hideSearchResults(kind);
    });
    item.append(button);
    listElement.append(item);
  });

  listElement.classList.remove("is-hidden");
}

function hideSearchResults(kind) {
  void kind;
  elements.composerSearchResults.classList.add("is-hidden");
  elements.composerSearchResults.innerHTML = "";
}

function clearSearchSelection(kind) {
  selectedPlaces[kind] = null;
  searchResults[kind] = [];
  searchFeedback[kind] = "";
  if (composerState.target === kind && !activeMapPick) {
    elements.composerInput.value = "";
  }
  hideSearchResults(kind);
}

function buildSearchFeedback(kind, errorText) {
  const normalized = String(errorText || "").toUpperCase();
  if (kind === "destination" && normalized.includes("ZERO_RESULTS")) {
    return "Doesn't seem to be an address. Try find near location instead?";
  }

  return "";
}

function buildDynamicDestinationLabel(primaryType, count) {
  const normalized = primaryType.replaceAll("_", " ");
  return `nearest ${normalized}`;
}

function activateComposer(target) {
  stopMapPick({ clearSelection: true });
  composerState.target = target;
  composerState.editing = null;
  elements.composerNameInput.value = "";
  if (target === "home") {
    clearSearchSelection("home");
  } else {
    clearSearchSelection("destination");
    applyComposerDefaults();
  }
  renderComposer();
  elements.composerInput.focus();
}

function applyComposerDefaults() {
  if (composerState.target !== "destination") {
    return;
  }

  if (composerState.destinationKind === "DYNAMIC") {
    elements.composerInput.value = "";
    elements.composerCountInput.value = elements.composerCountInput.value || "3";
    hideSearchResults("destination");
    return;
  }

  elements.composerInput.value = "";
}

function renderComposer() {
  const target = composerState.target;
  const isDestination = target === "destination";
  const isDynamic = isDestination && composerState.destinationKind === "DYNAMIC";
  const isEditing = Boolean(composerState.editing);
  const isMapPicking = Boolean(activeMapPick);
  const isOpen = Boolean(target) || isMapPicking;

  elements.activatePlaceButton.classList.toggle("is-active", target === "home");
  elements.activateDestinationButton.classList.toggle("is-active", target === "destination");
  elements.locationComposer.classList.toggle("is-hidden", !isOpen);

  elements.composerEmptyState.classList.add("is-hidden");
  elements.composerEditPanel.classList.toggle("is-hidden", !target || isMapPicking);
  elements.composerMapPanel.classList.toggle("is-hidden", !isMapPicking);
  elements.composerEditPanel.classList.toggle("is-home", target === "home");
  elements.composerEditPanel.classList.toggle("is-destination-fixed", isDestination && !isDynamic);
  elements.composerKindField.classList.toggle("is-hidden", !isDestination);
  elements.composerCountField.classList.toggle("is-hidden", !isDynamic);
  elements.composerMapButton.classList.toggle("is-hidden", isDynamic);

  if (!target && !isMapPicking) {
    return;
  }

  if (target) {
    elements.composerKindSelect.value = composerState.destinationKind;
    elements.composerKindSelect.disabled = isEditing;
    elements.composerInputLabel.textContent = "";
    elements.composerCountLabel.textContent = isDynamic
      ? `Shows the closest ${Math.max(1, Number(elements.composerCountInput.value) || 1)} results\nnear each location`
      : "";
    elements.composerNameInput.placeholder = "optional name";
    elements.composerInput.placeholder = target === "home"
      ? "for example: Alexanderplatz 1, Berlin"
      : isDynamic
        ? "for example: italian restaurant"
        : "for example: Alexanderplatz 1, Berlin";
    elements.composerInput.setAttribute(
      "aria-label",
      target === "home" ? "Location address" : isDynamic ? "Find near location query" : "Point of Interest address",
    );
    elements.composerHelp.textContent = "";
    elements.composerAddButton.textContent = isEditing ? "Save" : "Add";
    elements.composerInput.removeAttribute("list");
  }

  if (isMapPicking) {
    const noun = activeMapPick.label;
    const hasLocation = Boolean(activeMapPick.location);
    elements.composerMapTitle.textContent = `Select ${noun} on map`;
    elements.composerMapDetail.textContent = hasLocation
      ? activeMapPick.location.address || activeMapPick.location.label
      : `Click on the map to place the ${noun}. Click again to move it, then confirm.`;
    elements.composerMapConfirmButton.textContent = activeMapPick.kind === "home" ? "Confirm Location" : "Confirm Point of Interest";
  }
}

function resetComposer() {
  stopMapPick({ clearSelection: true });
  composerState.target = null;
  composerState.editing = null;
  clearSearchSelection("home");
  clearSearchSelection("destination");
  elements.composerInput.value = "";
  elements.composerNameInput.value = "";
  elements.composerCountInput.value = "3";
  renderComposer();
}

function commitFixedLocation(kind, location) {
  if (!location) {
    return;
  }

  if (composerState.editing?.kind === "home") {
    const label = elements.composerNameInput.value.trim() || buildDefaultLocationLabel(location);
    updateBoardState({
      homes: boardState.homes.map((home) =>
        home.id === composerState.editing.id
          ? {
              ...home,
              location: {
                ...location,
                label,
              },
            }
          : home,
      ),
    });
  } else if (composerState.editing?.kind === "destination") {
    const label = elements.composerNameInput.value.trim() || buildDefaultLocationLabel(location);
    updateBoardState({
      fixedDestinations: boardState.fixedDestinations.map((destination) =>
        destination.id === composerState.editing.id
          ? {
              ...destination,
              label,
              location: {
                ...location,
                label,
              },
            }
          : destination,
      ),
    });
  } else if (kind === "home") {
    addPlace(location);
  } else {
    addDestination(location, location.label);
  }
  resetComposer();
}

async function submitComposer() {
  const kind = composerState.target;
  if (!kind) {
    return;
  }

  if (kind === "destination" && composerState.destinationKind === "DYNAMIC") {
    submitDynamicDestination();
    return;
  }

  const location = await resolveFirstSearchResult(kind);
  if (!location) {
    setMessage("No matching result found for that query.", "warning");
    return;
  }

  selectedPlaces[kind] = location;
  elements.composerInput.value = location.address || location.label;
  hideSearchResults(kind);
  commitFixedLocation(kind, location);
}

function submitDynamicDestination() {
  const primaryType = elements.composerInput.value.trim();
  const count = Number(elements.composerCountInput.value);
  if (!primaryType || !Number.isInteger(count) || count < 1 || count > 10) {
    setMessage("Provide a nearby search query and a count between 1 and 10.", "warning");
    return;
  }

  const label = elements.composerNameInput.value.trim() || buildDynamicDestinationLabel(primaryType, count);
  if (composerState.editing?.kind === "dynamic") {
    updateBoardState({
      dynamicGroups: boardState.dynamicGroups.map((group) =>
        group.id === composerState.editing.id
          ? {
              ...group,
              label,
              primaryType,
              count,
            }
          : group,
      ),
    });
  } else {
    const dynamicGroup = createDynamicGroup({ label, primaryType, count });
    updateBoardState({ dynamicGroups: [dynamicGroup, ...boardState.dynamicGroups] });
  }
  resetComposer();
}

function openSettings() {
  const needsApiKey = !runtimeConfig.googleMapsApiKey;
  elements.apiKeyInput.value = runtimeConfig.googleMapsApiKey || "";
  elements.settingsRequiredNote.classList.toggle("is-hidden", !needsApiKey);
  elements.settingsDialog.showModal();
  window.setTimeout(() => elements.apiKeyInput.focus(), 0);
}

function maybePromptForApiKey(force = false) {
  if (runtimeConfig.googleMapsApiKey || (!force && hasPromptedForApiKey)) {
    return;
  }

  hasPromptedForApiKey = true;
  openSettings();
}

async function openShareDialog() {
  elements.shareJsonOutput.value = JSON.stringify(boardState, null, 2);
  elements.shareSummary.textContent = "Copy this JSON or download it as a file to share the current board.";
  elements.shareDialog.showModal();
}

function openLoadDialog() {
  elements.loadJsonInput.value = "";
  elements.loadDialog.showModal();
}

async function importBoardStateFromText(raw, options = {}) {
  if (!String(raw || "").trim()) {
    setMessage("Paste a JSON board export to import it.", "warning");
    return;
  }

  try {
    const nextState = sanitizeBoardState(JSON.parse(raw));
    boardState = nextState;
    highlightedCell = null;
    tableFocus = null;
    pendingDelete = null;
    resetComposer();
    saveBoardState(boardState);
    if (options.closeDialog) {
      elements.loadDialog.close();
    }
    renderAll();
    await recomputeComparisons();
    setMessage("Imported board from JSON.", "");
  } catch (error) {
    setMessage(`JSON import failed: ${serializeError(error)}`, "error");
  }
}

async function importBoardStateFromFile(file, options = {}) {
  const text = await file.text();
  await importBoardStateFromText(text, options);
}

function downloadBoardStateJson() {
  const blob = new Blob([JSON.stringify(boardState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `jwd-board-${buildTimestampSlug()}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setMessage("Downloaded board JSON.", "");
}

function buildTimestampSlug() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ];
  return parts.join("");
}

function hasJsonFile(dataTransfer) {
  if (!dataTransfer?.items?.length && !dataTransfer?.files?.length) {
    return false;
  }

  return Array.from(dataTransfer.items || []).some((item) => item.kind === "file")
    || Array.from(dataTransfer.files || []).some((file) => file.type === "application/json" || file.name.endsWith(".json"));
}

function renderAll() {
  renderModeAndPresetSelectors(elements, boardState, {
    onSelectMode: (value) => updateBoardState({ selectedMode: value }),
    onSelectPreset: (value) => updateBoardState({ selectedPresetId: value }),
    onOpenPresetMenu: openPresetMenu,
  });

  renderPresetMenu(elements, boardState, {
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
    tableFocus,
    pendingDelete,
    onSelectCell: handleCellSelection,
    onCenterHome: centerHomeById,
    onCenterDestination: centerDestinationById,
    onEditItem: openEditorForItem,
    onRequestDelete: requestDelete,
    onConfirmDelete: confirmDelete,
    onCancelDelete: cancelDelete,
  });
  renderComposer();
  renderMap();
}

function renderMap() {
  if (!provider || !mapReady) {
    return;
  }

  const selectedPreset = boardState.presets.find((preset) => preset.id === boardState.selectedPresetId);
  const dynamicRows = collectMapDynamicRows(comparisonSnapshot, boardState);
  provider.renderMarkers(boardState, dynamicRows, {
    preserveViewport: preserveMapViewport,
    onSelectMarker: handleMarkerSelection,
    highlight: highlightedCell
      ? {
          homeLocation: boardState.homes[highlightedCell.homeIndex]?.location,
          destinationLocation: findDestinationLocation(highlightedCell),
          mode: boardState.selectedMode,
          preset: selectedPreset,
          direction: boardState.selectedDirection,
        }
      : null,
  });
  preserveMapViewport = false;
}

function handleCellSelection(rowId, homeIndex) {
  highlightedCell = { rowId, homeIndex };
  tableFocus = null;
  const home = boardState.homes[homeIndex];
  if (home) {
    boardState.highlightedHomeId = home.id;
    saveBoardState(boardState);
  }
  renderAll();
}

function handleMarkerSelection(target) {
  if (!target) {
    return;
  }

  highlightedCell = null;
  tableFocus = target;
  preserveMapViewport = true;
  if (target.type === "home") {
    const home = boardState.homes.find((item) => item.id === target.id);
    if (home) {
      boardState.highlightedHomeId = home.id;
      saveBoardState(boardState);
    }
  }
  renderAll();
}

function startMapPick(kind) {
  if (!provider || !mapReady) {
    setMessage("Load the map provider first by saving a working API key in Settings.", "warning");
    return;
  }

  if (!kind) {
    return;
  }

  if (kind === "destination" && composerState.destinationKind === "DYNAMIC") {
    setMessage("Find near location is query-based and cannot be pinned on the map.", "warning");
    return;
  }

  activeMapPick = {
    kind,
    label: kind === "home" ? "location" : "Point of Interest",
    location: null,
  };

  selectedPlaces[kind] = null;
  provider.clearDraftLocation();
  provider.setMapClickMode(kind.toUpperCase(), async (resolved, _mode, error) => {
    if (error || !resolved) {
      setMessage(`Map pick failed: ${serializeError(error)}`, "error");
      return;
    }
    if (!activeMapPick || activeMapPick.kind !== kind) {
      return;
    }

    selectedPlaces[kind] = resolved;
    activeMapPick = {
      ...activeMapPick,
      location: resolved,
    };
    provider.showDraftLocation(resolved, kind === "home" ? "home" : "destination");
    renderComposer();
  });

  renderComposer();
}

function confirmMapPick() {
  if (!activeMapPick) {
    return;
  }

  if (!activeMapPick.location) {
    setMessage(`Click on the map to place the ${activeMapPick.label} first.`, "warning");
    return;
  }

  const { kind, location } = activeMapPick;
  stopMapPick({ clearSelection: false });
  commitFixedLocation(kind, location);
}

function stopMapPick({ clearSelection = true } = {}) {
  if (!activeMapPick) {
    return;
  }

  provider?.setMapClickMode("NONE");
  provider?.clearDraftLocation();

  if (clearSelection && activeMapPick.kind) {
    selectedPlaces[activeMapPick.kind] = null;
  }

  activeMapPick = null;
}

function clearActiveSelection(options = {}) {
  if (!highlightedCell && !tableFocus) {
    return false;
  }

  highlightedCell = null;
  tableFocus = null;
  preserveMapViewport = true;
  if (options.render !== false) {
    renderAll();
  }
  return true;
}

function openEditorForItem(descriptor) {
  stopMapPick({ clearSelection: true });
  pendingDelete = null;

  if (descriptor.kind === "home") {
    const home = boardState.homes.find((item) => item.id === descriptor.id);
    if (!home) {
      return;
    }

    composerState = {
      target: "home",
      destinationKind: "FIXED",
      editing: { kind: "home", id: home.id },
    };
    selectedPlaces.home = home.location;
    searchResults.home = [];
    searchFeedback.home = "";
    hideSearchResults("home");
    elements.composerInput.value = home.location.address || home.location.label;
    elements.composerNameInput.value = deriveEditableCustomName(home.location.label, home.location.address);
    renderComposer();
    elements.composerNameInput.focus();
    return;
  }

  if (descriptor.kind === "destination") {
    const destination = boardState.fixedDestinations.find((item) => item.id === descriptor.id);
    if (!destination) {
      return;
    }

    composerState = {
      target: "destination",
      destinationKind: "FIXED",
      editing: { kind: "destination", id: destination.id },
    };
    selectedPlaces.destination = destination.location;
    searchResults.destination = [];
    searchFeedback.destination = "";
    hideSearchResults("destination");
    elements.composerInput.value = destination.location.address || destination.label;
    elements.composerNameInput.value = deriveEditableCustomName(destination.label, destination.location.address);
    renderComposer();
    elements.composerNameInput.focus();
    return;
  }

  const dynamicGroup = boardState.dynamicGroups.find((item) => item.id === descriptor.id);
  if (!dynamicGroup) {
    return;
  }

  composerState = {
    target: "destination",
    destinationKind: "DYNAMIC",
    editing: { kind: "dynamic", id: dynamicGroup.id },
  };
  selectedPlaces.destination = null;
  searchResults.destination = [];
  searchFeedback.destination = "";
  hideSearchResults("destination");
  elements.composerInput.value = dynamicGroup.primaryType.replaceAll("_", " ");
  elements.composerCountInput.value = String(dynamicGroup.count);
  elements.composerNameInput.value = dynamicGroup.label === buildDynamicDestinationLabel(dynamicGroup.primaryType, dynamicGroup.count)
    ? ""
    : dynamicGroup.label;
  renderComposer();
  elements.composerNameInput.focus();
}

function deriveEditableCustomName(label, address = "") {
  const defaultLabel = String(address || "").split(",")[0]?.trim();
  if (!label) {
    return "";
  }
  return label === defaultLabel ? "" : label;
}

function buildDefaultLocationLabel(location) {
  const firstAddressSegment = String(location?.address || "").split(",")[0]?.trim();
  return firstAddressSegment || location?.label || "Pinned location";
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

function shouldClearSelectionOnDocumentClick(target) {
  if (!(target instanceof Element)) {
    return false;
  }

  return !target.closest([
    "[data-row-id]",
    "[data-center-home-id]",
    "[data-center-destination-id]",
    "[data-delete-control]",
    ".graph-bar-button",
    ".map-marker-pill",
    ".location-composer",
  ].join(","));
}

function requestDelete(descriptor) {
  const isSameTarget =
    pendingDelete &&
    pendingDelete.kind === descriptor.kind &&
    pendingDelete.id === descriptor.id &&
    pendingDelete.scopeKey === descriptor.scopeKey;

  pendingDelete = isSameTarget ? null : descriptor;
  renderAll();
}

function confirmDelete(descriptor) {
  pendingDelete = null;

  if (descriptor.kind === "home") {
    updateBoardState({ homes: boardState.homes.filter((home) => home.id !== descriptor.id) });
    return;
  }

  if (descriptor.kind === "dynamic") {
    updateBoardState({ dynamicGroups: boardState.dynamicGroups.filter((item) => item.id !== descriptor.id) });
    return;
  }

  updateBoardState({ fixedDestinations: boardState.fixedDestinations.filter((item) => item.id !== descriptor.id) });
}

function cancelDelete() {
  if (!pendingDelete) {
    return;
  }

  pendingDelete = null;
  renderAll();
}

function openPresetMenu() {
  elements.presetMenuPanel.classList.remove("is-hidden");
  renderAll();
}

function captureElements() {
  return {
    modeSelect: document.querySelector("#mode-select"),
    presetSelect: document.querySelector("#preset-select"),
    presetMenuPanel: document.querySelector("#preset-menu-panel"),
    directionToggle: document.querySelector("#direction-toggle"),
    shareButton: document.querySelector("#share-button"),
    loadButton: document.querySelector("#load-button"),
    settingsButton: document.querySelector("#settings-button"),
    dropOverlay: document.querySelector("#drop-overlay"),
    messageBar: document.querySelector("#message-bar"),
    map: document.querySelector("#map"),
    mapStatus: document.querySelector("#map-status"),
    locationComposer: document.querySelector("#location-composer"),
    activatePlaceButton: document.querySelector("#activate-place-button"),
    activateDestinationButton: document.querySelector("#activate-destination-button"),
    composerEmptyState: document.querySelector("#composer-empty-state"),
    composerEditPanel: document.querySelector("#composer-edit-panel"),
    composerMapPanel: document.querySelector("#composer-map-panel"),
    composerKindField: document.querySelector("#composer-kind-field"),
    composerKindSelect: document.querySelector("#composer-kind-select"),
    composerInputLabel: document.querySelector("#composer-input-label"),
    composerInput: document.querySelector("#composer-input"),
    composerNameInput: document.querySelector("#composer-name-input"),
    composerCountLabel: document.querySelector("#composer-count-field > span"),
    composerHelp: document.querySelector("#composer-help"),
    composerCountField: document.querySelector("#composer-count-field"),
    composerCountInput: document.querySelector("#composer-count-input"),
    composerMapButton: document.querySelector("#composer-map-button"),
    composerAddButton: document.querySelector("#composer-add-button"),
    composerCancelButton: document.querySelector("#composer-cancel-button"),
    composerSearchResults: document.querySelector("#composer-search-results"),
    composerMapTitle: document.querySelector("#composer-map-title"),
    composerMapDetail: document.querySelector("#composer-map-detail"),
    composerMapConfirmButton: document.querySelector("#composer-map-confirm-button"),
    composerMapCancelButton: document.querySelector("#composer-map-cancel-button"),
    presetDayInput: document.querySelector("#preset-day-input"),
    presetTimeInput: document.querySelector("#preset-time-input"),
    addPresetButton: document.querySelector("#add-preset-button"),
    presetsList: document.querySelector("#presets-list"),
    comparisonStatus: document.querySelector("#comparison-status"),
    comparisonTableContainer: document.querySelector("#comparison-table-container"),
    comparisonGraphContainer: document.querySelector("#comparison-graph-container"),
    comparisonFootnote: document.querySelector("#comparison-footnote"),
    settingsDialog: document.querySelector("#settings-dialog"),
    settingsRequiredNote: document.querySelector("#settings-required-note"),
    apiKeyInput: document.querySelector("#api-key-input"),
    clearLocalStorageButton: document.querySelector("#clear-local-storage-button"),
    saveSettingsButton: document.querySelector("#save-settings-button"),
    cancelSettingsButton: document.querySelector("#cancel-settings-button"),
    shareDialog: document.querySelector("#share-dialog"),
    shareSummary: document.querySelector("#share-summary"),
    shareJsonOutput: document.querySelector("#share-json-output"),
    downloadShareJsonButton: document.querySelector("#download-share-json-button"),
    copyShareJsonButton: document.querySelector("#copy-share-json-button"),
    loadDialog: document.querySelector("#load-dialog"),
    loadJsonInput: document.querySelector("#load-json-input"),
    loadJsonFileInput: document.querySelector("#load-json-file-input"),
    uploadLoadJsonButton: document.querySelector("#upload-load-json-button"),
    importLoadJsonButton: document.querySelector("#import-load-json-button"),
  };
}
