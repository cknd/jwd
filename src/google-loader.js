let googlePromise;
let loadedKey = null;

export async function loadGoogleMapsApi({ googleMapsApiKey }) {
  const apiKey = googleMapsApiKey;
  if (!apiKey) {
    throw new Error("Missing Google Maps API key.");
  }

  if (window.google?.maps?.importLibrary) {
    return window.google;
  }

  if (!googlePromise || (loadedKey && loadedKey !== apiKey)) {
    loadedKey = apiKey;
    googlePromise = loadScript({ apiKey });
  }

  try {
    await googlePromise;
  } catch (error) {
    googlePromise = null;
    throw error;
  }

  return window.google;
}

function loadScript({ apiKey }) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[data-google-maps-loader="true"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps failed to load.")), { once: true });
      return;
    }

    const callbackName = `__jwdGoogleInit${Date.now()}`;
    window[callbackName] = () => {
      delete window[callbackName];
      resolve();
    };

    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      loading: "async",
      callback: callbackName,
    });

    const script = document.createElement("script");
    script.dataset.googleMapsLoader = "true";
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Google Maps failed to load."));
    document.head.append(script);
  });
}
