(function installJwdTestEnv() {
  const KNOWN_LOCATIONS = [
    { label: "Karl-Liebknecht-Str. 1", address: "Karl-Liebknecht-Str. 1, 10178 Berlin, Germany", lat: 52.5216, lng: 13.4098, placeId: "fake-place-karl-liebknecht-1" },
    { label: "Rosa-Luxemburg-Straße 1", address: "Rosa-Luxemburg-Straße 1, 10178 Berlin, Germany", lat: 52.5261, lng: 13.4115, placeId: "fake-place-rosa-luxemburg-1" },
    { label: "Miquelstraße 37", address: "Miquelstraße 37, 14199 Berlin, Germany", lat: 52.4761, lng: 13.2981, placeId: "fake-place-miquel-37" },
    { label: "Billerbeker Weg 123", address: "Billerbeker Weg 123, 13507 Berlin, Germany", lat: 52.5923, lng: 13.2865, placeId: "fake-place-billerbeker-123" },
    { label: "Heinrich-Heine-Straße 1", address: "Heinrich-Heine-Straße 1, 10179 Berlin, Germany", lat: 52.5117, lng: 13.4165, placeId: "fake-place-heinrich-heine-1" },
    { label: "Berlin Hauptbahnhof", address: "Berlin Hauptbahnhof, Europaplatz 1, 10557 Berlin, Germany", lat: 52.5251, lng: 13.3694, placeId: "fake-place-hbf" },
    { label: "Alexanderplatz 1", address: "Alexanderplatz 1, 10178 Berlin, Germany", lat: 52.5219, lng: 13.4132, placeId: "fake-place-alex-1" },
    { label: "Tempelhofer Feld", address: "Tempelhofer Damm, 12101 Berlin, Germany", lat: 52.4736, lng: 13.4025, placeId: "fake-place-tempelhof" },
  ];

  const QUERY_NAME_BANK = {
    coffee: ["Coffee Oase", "WhyNot Kaffee", "Zimt & Zucker Kaffeehaus", "Concierge Coffee", "soulcafe"],
    italian: ["Fantasia Del Gelato Cafe", "Amato Cafe", "It's a long story", "Pasta Nostra", "Trattoria Roma"],
    restaurant: ["Mitte Kitchen", "Neighborhood Supper", "Daily Fork", "Spice Table", "Lokal Bistro"],
    supermarket: ["REWE", "EDEKA", "Nahkauf", "Bio Markt", "Fresh Corner"],
  };
  const HOME_MARKER_PALETTE = [
    { fill: "#c4ddf4", border: "#4e79a7", ink: "#23486f" },
    { fill: "#f5cfd0", border: "#e15759", ink: "#8a2f33" },
    { fill: "#d0e8ca", border: "#59a14f", ink: "#2a5d23" },
    { fill: "#f7ddb6", border: "#f28e2b", ink: "#875016" },
    { fill: "#ddd1ef", border: "#b07aa1", ink: "#62405b" },
    { fill: "#c8e7e4", border: "#76b7b2", ink: "#2e6661" },
  ];

  class FakeTravelProvider {
    constructor(mapContainer) {
      this.mapContainer = mapContainer;
      this.markerLayer = null;
      this.routeLayer = null;
      this.mapClickMode = "NONE";
      this.mapClickCallback = null;
      this.markers = new Map();
      this.draftMarker = null;
      this.boundMapClick = this.handleMapClick.bind(this);
    }

    async init() {
      ensureFakeMapStyles();
      this.mapContainer.innerHTML = "";
      this.mapContainer.classList.add("fake-map-canvas");

      const surface = document.createElement("div");
      surface.className = "fake-map-surface";
      surface.innerHTML = '<div class="fake-map-grid"></div><div class="fake-map-label">Fake map</div>';

      this.markerLayer = document.createElement("div");
      this.markerLayer.className = "fake-map-marker-layer";

      this.routeLayer = document.createElement("div");
      this.routeLayer.className = "fake-map-route-layer";

      surface.append(this.routeLayer, this.markerLayer);
      this.mapContainer.append(surface);
      this.mapContainer.addEventListener("click", this.boundMapClick);
    }

    setMapClickMode(mode, onResolvedLocation) {
      this.mapClickMode = mode;
      this.mapClickCallback = onResolvedLocation || null;
      this.mapContainer.dataset.mapClickMode = mode;
    }

    getPendingSelection() {
      return null;
    }

    clearPendingSelection() {
      // no-op for fake provider
    }

    async geocode(searchText) {
      const query = String(searchText || "").trim().toLowerCase();
      if (!query) {
        return [];
      }

      const matches = KNOWN_LOCATIONS.filter((location) =>
        location.label.toLowerCase().includes(query) || location.address.toLowerCase().includes(query),
      );

      if (matches.length) {
        return matches.map((location) => ({ ...location }));
      }

      return [createSyntheticLocation(query)];
    }

    async reverseGeocode(location) {
      return {
        label: `Pinned ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`,
        address: `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)} Berlin, Germany`,
        placeId: `fake-pin-${hashString(`${location.lat},${location.lng}`)}`,
        lat: location.lat,
        lng: location.lng,
      };
    }

    async searchNearby(home, dynamicGroup) {
      const query = String(dynamicGroup.primaryType || "").trim();
      const labels = resolveNearbyLabels(query, dynamicGroup.count);

      return labels.map((label, index) => {
        const offset = 0.002 + (index * 0.0014);
        return {
          label,
          address: `${label}, near ${home.location.label}, Berlin, Germany`,
          placeId: `fake-nearby-${hashString(`${home.id}:${query}:${label}`)}`,
          lat: home.location.lat + offset,
          lng: home.location.lng + offset / 1.7,
        };
      });
    }

    async computeMatrix(origins, destinations, mode, preset) {
      return origins.map((origin) => destinations.map((destination) => buildRouteItem(origin, destination, mode, preset)));
    }

    async computeRoutes(origin, destinations, mode, preset) {
      return destinations.map((destination) => buildRouteItem(origin, destination, mode, preset));
    }

    async renderMarkers(boardState, dynamicRows, comparisonData) {
      if (!this.markerLayer) {
        return;
      }

      this.markerLayer.innerHTML = "";
      const entries = [];

      boardState.homes.forEach((home) => {
        entries.push({
          key: home.id,
          position: home.location,
          title: home.location.label,
          label: "L",
          type: "home",
          target: { type: "home", id: home.id },
          style: buildHomeMarkerStyle(home.colorIndex),
        });
      });

      boardState.fixedDestinations.forEach((destination) => {
        entries.push({
          key: destination.id,
          position: destination.location,
          title: destination.label,
          label: "P",
          type: "destination",
          target: { type: "column", id: destination.id },
        });
      });

      dynamicRows.forEach((row) => {
        entries.push({
          key: row.id,
          position: row.location,
          title: row.placeLabel,
          label: "N",
          type: "dynamic",
          target: { type: "column", id: row.rowId },
        });
      });

      entries.forEach((entry) => {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = `map-marker-pill map-marker-pill--${entry.type} fake-map-marker`;
        marker.textContent = entry.label;
        marker.title = entry.title;
        if (entry.style) {
          Object.assign(marker.style, entry.style);
        }
        const position = projectLatLng(entry.position);
        marker.style.left = `${position.x}%`;
        marker.style.top = `${position.y}%`;
        marker.addEventListener("click", (event) => {
          event.stopPropagation();
          comparisonData?.onSelectMarker?.(entry.target);
        });
        this.markerLayer.append(marker);
      });

      if (this.draftMarker) {
        this.markerLayer.append(this.draftMarker);
      }

      if (comparisonData?.highlight) {
        const { homeLocation, destinationLocation } = comparisonData.highlight;
        if (homeLocation && destinationLocation) {
          this.routeLayer.textContent = `Route: ${homeLocation.label} → ${destinationLocation.label}`;
          this.routeLayer.classList.add("is-visible");
        }
      } else {
        this.clearHighlight();
      }
    }

    clearHighlight() {
      if (!this.routeLayer) {
        return;
      }

      this.routeLayer.textContent = "";
      this.routeLayer.classList.remove("is-visible");
    }

    centerLocation(locationRef) {
      this.mapContainer.dataset.centeredLocation = locationRef?.label || "";
    }

    showDraftLocation(locationRef, type) {
      const marker = document.createElement("div");
      marker.className = `map-marker-pill map-marker-pill--${type} map-marker-pill--draft fake-map-marker`;
      marker.textContent = type === "home" ? "L" : "P";
      marker.title = locationRef.label;
      const position = projectLatLng(locationRef);
      marker.style.left = `${position.x}%`;
      marker.style.top = `${position.y}%`;
      this.draftMarker = marker;
      if (this.markerLayer) {
        this.markerLayer.append(marker);
      }
    }

    clearDraftLocation() {
      this.draftMarker?.remove();
      this.draftMarker = null;
    }

    handleMapClick(event) {
      if (this.mapClickMode === "NONE" || !this.mapClickCallback || event.target.closest(".fake-map-marker")) {
        return;
      }

      const rect = this.mapContainer.getBoundingClientRect();
      const xRatio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const yRatio = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      const location = {
        lat: 52.42 + ((1 - yRatio) * 0.18),
        lng: 13.23 + (xRatio * 0.33),
      };

      this.reverseGeocode(location)
        .then((resolved) => this.mapClickCallback?.(resolved, this.mapClickMode))
        .catch((error) => this.mapClickCallback?.(null, this.mapClickMode, error));
    }
  }

  function buildRouteItem(origin, destination, mode, preset) {
    const distanceMeters = Math.max(120, Math.round(distanceBetween(origin, destination)));
    const speedKmh = {
      DRIVING: 33,
      TRANSIT: 24,
      BICYCLING: 16,
      WALKING: 5,
    }[mode] || 20;
    const timingFactor = resolveTimingFactor(mode, preset);
    const durationHours = (distanceMeters / 1000) / speedKmh * timingFactor;
    const durationMillis = Math.max(60_000, Math.round(durationHours * 60) * 60_000);

    return {
      durationMillis,
      staticDurationMillis: durationMillis,
      distanceMeters,
      condition: "ROUTE_EXISTS",
      localizedValues: null,
      fallbackInfo: null,
      travelAdvisory: null,
      routeNote: null,
    };
  }

  function resolveTimingFactor(mode, preset) {
    const day = preset?.dayType || "WEEKDAY";
    const time = preset?.timeLocal || "08:30";
    if (mode === "DRIVING" && day === "WEEKDAY" && time === "17:30") {
      return 1.35;
    }
    if (mode === "TRANSIT" && day === "SUNDAY") {
      return 1.2;
    }
    if (mode === "WALKING") {
      return 1;
    }
    return 1.05;
  }

  function resolveNearbyLabels(query, count) {
    const normalized = String(query || "").toLowerCase();
    const bankKey = Object.keys(QUERY_NAME_BANK).find((key) => normalized.includes(key));
    const bank = bankKey ? QUERY_NAME_BANK[bankKey] : null;

    return Array.from({ length: count }, (_, index) => {
      if (bank?.[index]) {
        return bank[index];
      }
      return `${toTitleCase(query)} ${index + 1}`;
    });
  }

  function createSyntheticLocation(query) {
    const seed = hashString(query);
    const lat = 52.42 + ((seed % 1800) / 10000);
    const lng = 13.23 + (((seed >> 3) % 3300) / 10000);
    const label = toTitleCase(query.split(",")[0] || query);
    return {
      label,
      address: `${label}, Berlin, Germany`,
      placeId: `fake-geocode-${seed}`,
      lat,
      lng,
    };
  }

  function buildHomeMarkerStyle(colorIndex) {
    const tone = HOME_MARKER_PALETTE[Math.abs(Number(colorIndex) || 0) % HOME_MARKER_PALETTE.length];
    return {
      background: tone.fill,
      borderColor: tone.border,
      color: tone.ink,
    };
  }

  function projectLatLng(location) {
    const x = clamp(((location.lng - 13.23) / 0.33) * 100, 6, 94);
    const y = clamp((1 - ((location.lat - 52.42) / 0.18)) * 100, 8, 92);
    return { x, y };
  }

  function distanceBetween(origin, destination) {
    const latMeters = (origin.lat - destination.lat) * 111_000;
    const lngMeters = (origin.lng - destination.lng) * 71_500;
    return Math.sqrt((latMeters ** 2) + (lngMeters ** 2));
  }

  function hashString(value) {
    let hash = 0;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(index);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function toTitleCase(value) {
    return String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function ensureFakeMapStyles() {
    if (document.getElementById("jwd-fake-map-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "jwd-fake-map-style";
    style.textContent = `
      .fake-map-canvas {
        position: relative;
        overflow: hidden;
      }
      .fake-map-surface {
        position: absolute;
        inset: 0;
        background:
          linear-gradient(135deg, rgba(218, 232, 226, 0.6), rgba(255, 255, 255, 0.8)),
          repeating-linear-gradient(0deg, rgba(207, 216, 205, 0.28) 0 1px, transparent 1px 44px),
          repeating-linear-gradient(90deg, rgba(207, 216, 205, 0.28) 0 1px, transparent 1px 44px);
      }
      .fake-map-grid {
        position: absolute;
        inset: 0;
      }
      .fake-map-label {
        position: absolute;
        left: 0.75rem;
        bottom: 0.6rem;
        color: rgba(27, 34, 29, 0.45);
        font-size: 0.78rem;
        font-weight: 600;
        letter-spacing: 0.02em;
      }
      .fake-map-marker-layer {
        position: absolute;
        inset: 0;
      }
      .fake-map-route-layer {
        position: absolute;
        left: 0.75rem;
        top: 0.75rem;
        padding: 0.2rem 0.45rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.88);
        color: rgba(27, 34, 29, 0.72);
        font-size: 0.74rem;
        opacity: 0;
        transition: opacity 120ms ease;
      }
      .fake-map-route-layer.is-visible {
        opacity: 1;
      }
      .fake-map-marker {
        position: absolute;
        transform: translate(-50%, -50%);
      }
    `;
    document.head.append(style);
  }

  window.JWD_TEST_ENV = {
    skipApiKeyPrompt: true,
    runtimeConfig: {
      googleMapsApiKey: "fake-browser-key",
    },
    async createProvider({ mapContainer }) {
      return new FakeTravelProvider(mapContainer);
    },
  };
})();
