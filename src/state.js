import { createId, formatPresetLabel, pickNextHomeColorIndex } from "./utils.js";

export function createDefaultBoardState() {
  const presets = [
    {
      id: createId("preset"),
      dayType: "WEEKDAY",
      timeLocal: "08:30",
    },
    {
      id: createId("preset"),
      dayType: "WEEKDAY",
      timeLocal: "17:30",
    },
    {
      id: createId("preset"),
      dayType: "SUNDAY",
      timeLocal: "11:00",
    },
  ];

  return {
    version: 1,
    homes: [],
    fixedDestinations: [],
    dynamicGroups: [],
    presets,
    selectedPresetId: presets[0].id,
    selectedMode: "TRANSIT",
    selectedDirection: "HOME_TO_DESTINATIONS",
    highlightedHomeId: undefined,
    view: "TABLE",
  };
}

export function sanitizeBoardState(rawState) {
  const fallback = createDefaultBoardState();
  if (!rawState || typeof rawState !== "object") {
    return fallback;
  }

  const homes = assignMissingHomeColorIndexes(sanitizeArray(rawState.homes).map(sanitizeCandidateHome).filter(Boolean));
  const fixedDestinations = sanitizeArray(rawState.fixedDestinations).map(sanitizeFixedDestination).filter(Boolean);
  const dynamicGroups = sanitizeArray(rawState.dynamicGroups).map(sanitizeDynamicGroup).filter(Boolean);
  const presets = migrateLegacyDefaultPresets(sanitizeArray(rawState.presets).map(sanitizePreset).filter(Boolean));
  const selectedPresetId = presets.some((preset) => preset.id === rawState.selectedPresetId)
    ? rawState.selectedPresetId
    : presets[0]?.id || fallback.selectedPresetId;

  return {
    version: 1,
    homes,
    fixedDestinations,
    dynamicGroups,
    presets: presets.length ? presets : fallback.presets,
    selectedPresetId,
    selectedMode: ["DRIVING", "TRANSIT", "BICYCLING", "WALKING"].includes(rawState.selectedMode)
      ? rawState.selectedMode
      : fallback.selectedMode,
    selectedDirection: ["HOME_TO_DESTINATIONS", "DESTINATIONS_TO_HOME"].includes(rawState.selectedDirection)
      ? rawState.selectedDirection
      : fallback.selectedDirection,
    highlightedHomeId: homes.some((home) => home.id === rawState.highlightedHomeId) ? rawState.highlightedHomeId : homes[0]?.id,
    view: rawState.view === "GRAPH" ? "GRAPH" : "TABLE",
  };
}

function migrateLegacyDefaultPresets(presets) {
  if (presets.length !== 2) {
    return presets;
  }

  const signatures = presets
    .map((preset) => `${preset.dayType}:${preset.timeLocal}`)
    .sort()
    .join("|");

  if (signatures !== "WEEKDAY:08:30|WEEKDAY:17:30") {
    return presets;
  }

  return [
    ...presets,
    createPreset({
      dayType: "SUNDAY",
      timeLocal: "11:00",
    }),
  ];
}

export function createHome(location, override = {}) {
  return {
    id: createId("home"),
    location,
    colorIndex: 0,
    ...override,
  };
}

export function createFixedDestination(location, label) {
  return {
    id: createId("destination"),
    label: label || location.label,
    location: {
      ...location,
      label: label || location.label,
    },
  };
}

export function createDynamicGroup({ label, primaryType, count }) {
  const query = String(primaryType || "").trim();
  if (!query) {
    throw new Error(`Unsupported dynamic destination type: ${primaryType}`);
  }

  return {
    id: createId("dynamic"),
    label: label || query,
    primaryType: query,
    count,
  };
}

export function createPreset({ dayType, timeLocal }, override = {}) {
  return {
    id: createId("preset"),
    label: formatPresetLabel({ dayType, timeLocal }),
    dayType,
    timeLocal,
    ...override,
  };
}

function sanitizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function sanitizeLocationRef(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return {
    label: String(value.label || value.address || "Pinned location"),
    placeId: value.placeId ? String(value.placeId) : undefined,
    address: value.address ? String(value.address) : undefined,
    lat,
    lng,
  };
}

function sanitizeCandidateHome(value) {
  const location = sanitizeLocationRef(value?.location);
  if (!location) {
    return null;
  }

  return {
    id: value.id ? String(value.id) : createId("home"),
    location,
    colorIndex: Number.isInteger(value.colorIndex) && value.colorIndex >= 0 ? value.colorIndex : undefined,
  };
}

function assignMissingHomeColorIndexes(homes) {
  const assigned = [];
  homes.forEach((home) => {
    if (Number.isInteger(home.colorIndex) && home.colorIndex >= 0) {
      assigned.push(home);
      return;
    }

    assigned.push({
      ...home,
      colorIndex: pickNextHomeColorIndex(assigned),
    });
  });
  return assigned;
}

function sanitizeFixedDestination(value) {
  const location = sanitizeLocationRef(value?.location);
  if (!location) {
    return null;
  }

  return {
    id: value.id ? String(value.id) : createId("destination"),
    label: String(value.label || location.label),
    location: {
      ...location,
      label: String(value.label || location.label),
    },
  };
}

function sanitizeDynamicGroup(value) {
  if (!value || typeof value !== "object" || !value.primaryType) {
    return null;
  }

  const query = String(value.primaryType || "").trim();
  if (!query) {
    return null;
  }

  const count = Number(value.count);
  if (!Number.isInteger(count) || count < 1 || count > 10) {
    return null;
  }

  return {
    id: value.id ? String(value.id) : createId("dynamic"),
    label: String(value.label || query),
    primaryType: query,
    count,
  };
}

function sanitizePreset(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (!["WEEKDAY", "SATURDAY", "SUNDAY"].includes(value.dayType)) {
    return null;
  }

  if (!/^\d{2}:\d{2}$/.test(String(value.timeLocal))) {
    return null;
  }

  return {
    id: value.id ? String(value.id) : createId("preset"),
    label: String(value.label || formatPresetLabel(value)),
    dayType: value.dayType,
    timeLocal: value.timeLocal,
  };
}
