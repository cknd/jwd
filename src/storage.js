import { STORAGE_KEYS } from "./constants.js";
import { safeParseJson } from "./utils.js";
import { sanitizeBoardState } from "./state.js";

export function loadBoardState() {
  const raw = window.localStorage.getItem(STORAGE_KEYS.boardState);
  return raw ? sanitizeBoardState(safeParseJson(raw)) : null;
}

export function saveBoardState(boardState) {
  window.localStorage.setItem(STORAGE_KEYS.boardState, JSON.stringify(boardState));
}

export function loadRuntimeConfig() {
  const raw = window.localStorage.getItem(STORAGE_KEYS.runtimeConfig);
  return safeParseJson(raw, {});
}

export function saveRuntimeConfig(config) {
  window.localStorage.setItem(STORAGE_KEYS.runtimeConfig, JSON.stringify(config));
}

export function loadCache(storageKey) {
  return safeParseJson(window.localStorage.getItem(storageKey), {});
}

export function saveCache(storageKey, value) {
  window.localStorage.setItem(storageKey, JSON.stringify(value));
}
