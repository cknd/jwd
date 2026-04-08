import { SHARE_LENGTH_LIMIT, SHARE_LENGTH_WARNING } from "./constants.js";
import { sanitizeBoardState } from "./state.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function encodeBoardState(boardState) {
  const json = JSON.stringify(boardState);
  const compressed = await compressText(json);
  const payload = toBase64Url(compressed);
  return typeof CompressionStream === "function" ? `gz.${payload}` : `plain.${payload}`;
}

export async function decodeBoardState(encoded) {
  const [encoding, payload] = splitEncodedPayload(encoded);
  const bytes = fromBase64Url(payload);
  const text = encoding === "gz" ? await decompressBytes(bytes) : textDecoder.decode(bytes);
  return sanitizeBoardState(JSON.parse(text));
}

export function buildShareUrl(encodedState) {
  const url = new URL(window.location.href);
  url.hash = `board=${encodedState}`;
  return url.toString();
}

export function parseBoardStateFromHash(hashValue = window.location.hash) {
  const hash = hashValue.startsWith("#") ? hashValue.slice(1) : hashValue;
  const params = new URLSearchParams(hash);
  return params.get("board");
}

export function getShareHealth(url) {
  const length = url.length;
  return {
    length,
    warning: length > SHARE_LENGTH_WARNING,
    blocked: length > SHARE_LENGTH_LIMIT,
  };
}

async function compressText(text) {
  if (typeof CompressionStream === "function") {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  return textEncoder.encode(text);
}

async function decompressBytes(bytes) {
  if (typeof DecompressionStream === "function") {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return textDecoder.decode(await new Response(stream).arrayBuffer());
  }

  return textDecoder.decode(bytes);
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function splitEncodedPayload(encoded) {
  const [encoding, payload] = encoded.split(".", 2);
  if (payload && (encoding === "gz" || encoding === "plain")) {
    return [encoding, payload];
  }

  return ["plain", encoded];
}
