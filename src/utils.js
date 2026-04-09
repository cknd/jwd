import { DYNAMIC_PRIMARY_TYPE_ALIASES, HOME_COLOR_PALETTE, SUPPORTED_DYNAMIC_PRIMARY_TYPES } from "./constants.js";

export function createId(prefix = "id") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function titleCase(value) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatDuration(durationMillis) {
  if (!Number.isFinite(durationMillis)) {
    return "Unavailable";
  }

  const totalMinutes = Math.round(durationMillis / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}

export function formatDistance(distanceMeters) {
  if (!Number.isFinite(distanceMeters)) {
    return "Unavailable";
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function formatTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function debounce(fn, delay = 250) {
  let timeoutId;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn(...args), delay);
  };
}

export function toPlainLatLng(locationLike) {
  if (!locationLike) {
    return null;
  }

  if (typeof locationLike.lat === "function" && typeof locationLike.lng === "function") {
    return { lat: locationLike.lat(), lng: locationLike.lng() };
  }

  return { lat: Number(locationLike.lat), lng: Number(locationLike.lng) };
}

export function nextDateForPreset(preset, now = new Date()) {
  const [hours, minutes] = preset.timeLocal.split(":").map((part) => Number(part));
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setHours(hours, minutes, 0, 0);

  const allowedDays = resolveAllowedDays(preset.dayType);
  let attempts = 0;

  while (attempts < 14) {
    const sameDay = isSameDay(candidate, now);
    const inPast = sameDay && candidate <= now;
    const allowed = allowedDays.includes(candidate.getDay());

    if (allowed && !inPast) {
      return candidate;
    }

    candidate.setDate(candidate.getDate() + 1);
    candidate.setHours(hours, minutes, 0, 0);
    attempts += 1;
  }

  return candidate;
}

export function formatPresetLabel(preset) {
  const [hours, minutes] = String(preset.timeLocal).split(":");
  return `${titleCase(preset.dayType.toLowerCase())} ${Number(hours)}:${minutes}`;
}

function resolveAllowedDays(dayType) {
  if (dayType === "SATURDAY") {
    return [6];
  }

  if (dayType === "SUNDAY") {
    return [0];
  }

  return [1, 2, 3, 4, 5];
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function buildLocationRefFromPlace(place, fallbackLabel = "Selected place") {
  const location = toPlainLatLng(place.location);
  if (!location) {
    return null;
  }

  return {
    label: place.displayName || fallbackLabel,
    address: place.formattedAddress || place.displayName || fallbackLabel,
    placeId: place.id,
    lat: location.lat,
    lng: location.lng,
  };
}

export function resolveHomeColor(homeRef) {
  const paletteIndex = resolveHomeColorIndex(homeRef);
  return HOME_COLOR_PALETTE[paletteIndex];
}

export function buildHomeColorStyle(homeRef) {
  const tone = resolveHomeColor(homeRef);
  return [
    `--home-fill:${tone.fill}`,
    `--home-border:${tone.border}`,
    `--home-ink:${tone.ink}`,
    `--home-bar:${tone.bar}`,
    `--home-graph-bar:${blendHexWithWhite(tone.bar, 0.78)}`,
    `--home-row-bg:${blendHexWithWhite(tone.bar, 0.18)}`,
    `--home-row-focus-bg:${blendHexWithWhite(tone.bar, 0.28)}`,
  ].join(";") + ";";
}

export function pickNextHomeColorIndex(homes) {
  const used = new Set(
    homes
      .map((home) => Number(home?.colorIndex))
      .filter((value) => Number.isInteger(value) && value >= 0),
  );

  for (let index = 0; index < HOME_COLOR_PALETTE.length; index += 1) {
    if (!used.has(index)) {
      return index;
    }
  }

  return homes.length % HOME_COLOR_PALETTE.length;
}

export function serializeError(error) {
  if (!error) {
    return "Unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  return error.message || String(error);
}

export function safeParseJson(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeDynamicPrimaryType(rawValue) {
  if (!rawValue) {
    return null;
  }

  const canonical = String(rawValue)
    .trim()
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[()\[\],.]/g, "")
    .replace(/[\s/-]+/g, "_");

  if (!canonical) {
    return null;
  }

  if (SUPPORTED_DYNAMIC_PRIMARY_TYPES.includes(canonical)) {
    return canonical;
  }

  const aliased = DYNAMIC_PRIMARY_TYPE_ALIASES[canonical];
  if (aliased) {
    return aliased;
  }

  if (canonical.endsWith("s")) {
    const singular = canonical.slice(0, -1);
    if (SUPPORTED_DYNAMIC_PRIMARY_TYPES.includes(singular)) {
      return singular;
    }
    if (DYNAMIC_PRIMARY_TYPE_ALIASES[singular]) {
      return DYNAMIC_PRIMARY_TYPE_ALIASES[singular];
    }
  }

  return null;
}

function resolveHomeColorIndex(homeRef) {
  if (homeRef && typeof homeRef === "object" && Number.isInteger(homeRef.colorIndex) && homeRef.colorIndex >= 0) {
    return homeRef.colorIndex % HOME_COLOR_PALETTE.length;
  }

  if (Number.isInteger(homeRef) && homeRef >= 0) {
    return homeRef % HOME_COLOR_PALETTE.length;
  }

  return 0;
}

function blendHexWithWhite(hex, alpha) {
  const normalized = String(hex).replace("#", "");
  if (normalized.length !== 6) {
    return "#ffffff";
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  const blend = (channel) => Math.round((255 * (1 - alpha)) + (channel * alpha));
  return `rgb(${blend(red)}, ${blend(green)}, ${blend(blue)})`;
}
