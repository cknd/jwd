import { DEFAULT_CENTER, STORAGE_KEYS } from "./constants.js";
import { loadCache, saveCache } from "./storage.js";
import { buildHomeColorStyle, buildLocationRefFromPlace, nextDateForPreset, serializeError, toPlainLatLng } from "./utils.js";

export class GoogleTravelProvider {
  constructor(google, mapContainer, config = {}) {
    this.google = google;
    this.config = config;
    this.mapContainer = mapContainer;
    this.map = null;
    this.geocoder = null;
    this.markers = new Map();
    this.highlightCircle = null;
    this.routePolylines = [];
    this.highlightRequestId = 0;
    this.draftMarker = null;
    this.routeCache = new Map(Object.entries(loadCache(STORAGE_KEYS.routeCache)));
    this.nearbyCache = new Map(Object.entries(loadCache(STORAGE_KEYS.nearbyCache)));
    this.placeSelections = {
      home: null,
      destination: null,
    };
    this.mapClickHandler = null;
    this.mapLibrariesReady = null;
  }

  async init() {
    if (this.mapLibrariesReady) {
      return this.mapLibrariesReady;
    }

    this.mapLibrariesReady = this.#initLibraries();
    return this.mapLibrariesReady;
  }

  async #initLibraries() {
    const [{ Map }, { AdvancedMarkerElement }, { Place }, { RouteMatrix, Route }, { Geocoder }] = await Promise.all([
      this.google.maps.importLibrary("maps"),
      this.google.maps.importLibrary("marker"),
      this.google.maps.importLibrary("places"),
      this.google.maps.importLibrary("routes"),
      this.google.maps.importLibrary("geocoding"),
    ]);

    this.MapClass = Map;
    this.AdvancedMarkerElementClass = AdvancedMarkerElement;
    this.PlaceClass = Place;
    this.RouteMatrix = RouteMatrix;
    this.RouteClass = Route;
    this.GeocoderClass = Geocoder;
    this.geocoder = new this.GeocoderClass();

    this.map = new this.MapClass(this.mapContainer, {
      center: DEFAULT_CENTER,
      zoom: 11,
      mapId: this.config.googleMapId || "DEMO_MAP_ID",
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });
  }

  getPendingSelection(kind) {
    return this.placeSelections[kind];
  }

  clearPendingSelection(kind) {
    this.placeSelections[kind] = null;
  }

  showDraftLocation(locationRef, type = "home") {
    if (!this.map || !locationRef) {
      return;
    }

    const content = this.#buildMarkerContent(
      {
        label: type === "home" ? "L" : "P",
        title: locationRef.label,
        type,
      },
      null,
      true,
    );

    if (!this.draftMarker) {
      this.draftMarker = new this.AdvancedMarkerElementClass({
        map: this.map,
        position: locationRef,
        title: locationRef.label,
        content,
        zIndex: this.#getMarkerZIndex(type) + 5,
      });
      return;
    }

    this.draftMarker.position = locationRef;
    this.draftMarker.title = locationRef.label;
    this.draftMarker.content = content;
    this.draftMarker.zIndex = this.#getMarkerZIndex(type) + 5;
  }

  clearDraftLocation() {
    if (!this.draftMarker) {
      return;
    }

    this.draftMarker.map = null;
    this.draftMarker = null;
  }

  setMapClickMode(mode, onResolvedLocation) {
    if (this.mapClickHandler) {
      this.mapClickHandler.remove();
      this.mapClickHandler = null;
    }

    if (this.map) {
      this.map.setOptions({ draggableCursor: mode === "NONE" ? null : "crosshair" });
    }

    if (mode === "NONE") {
      return;
    }

    this.mapClickHandler = this.map.addListener("click", async (event) => {
      try {
        const location = toPlainLatLng(event.latLng);
        const resolved = await this.reverseGeocode(location);
        onResolvedLocation?.(resolved, mode);
      } catch (error) {
        onResolvedLocation?.(null, mode, error);
      }
    });
  }

  async geocode(searchText) {
    const response = await this.geocoder.geocode({ address: searchText });
    return response.results.map((result) => ({
      label: this.#buildAddressLabel(result),
      address: result.formatted_address,
      placeId: result.place_id,
      lat: result.geometry.location.lat(),
      lng: result.geometry.location.lng(),
    }));
  }

  async reverseGeocode(location) {
    const response = await this.geocoder.geocode({ location });
    const best = response.results?.[0];
    if (!best) {
      return {
        label: "Pinned location",
        address: `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`,
        lat: location.lat,
        lng: location.lng,
      };
    }

    return {
      label: this.#buildAddressLabel(best),
      address: best.formatted_address,
      placeId: best.place_id,
      lat: best.geometry.location.lat(),
      lng: best.geometry.location.lng(),
    };
  }

  async searchNearby(home, dynamicGroup) {
    const cacheKey = JSON.stringify({
      lat: home.location.lat,
      lng: home.location.lng,
      query: dynamicGroup.primaryType,
      count: dynamicGroup.count,
    });

    if (this.nearbyCache.has(cacheKey)) {
      return this.nearbyCache.get(cacheKey);
    }

    const center = new this.google.maps.LatLng(home.location.lat, home.location.lng);
    let radius = 800;
    const placeResults = new Map();

    while (radius <= 50000 && placeResults.size < dynamicGroup.count) {
      const response = await this.PlaceClass.searchByText({
        textQuery: dynamicGroup.primaryType,
        fields: ["displayName", "formattedAddress", "location", "id"],
        locationBias: { center, radius },
        rankPreference: "DISTANCE",
        maxResultCount: Math.min(20, dynamicGroup.count * 4),
      });

      (response.places || [])
        .filter((place) => place.location && place.id)
        .forEach((place) => {
          if (!placeResults.has(place.id)) {
            placeResults.set(place.id, place);
          }
        });
      radius *= 2;
    }

    const normalized = Array.from(placeResults.values())
      .sort((left, right) => this.#distanceToLocation(home.location, left.location) - this.#distanceToLocation(home.location, right.location))
      .slice(0, dynamicGroup.count)
      .map((place) => buildLocationRefFromPlace(place, dynamicGroup.primaryType));
    this.nearbyCache.set(cacheKey, normalized);
    saveCache(STORAGE_KEYS.nearbyCache, Object.fromEntries(this.nearbyCache.entries()));
    return normalized;
  }

  async computeMatrix(origins, destinations, mode, preset) {
    if (!origins.length || !destinations.length) {
      return [];
    }

    const cacheKey = JSON.stringify({
      origins: origins.map((origin) => [origin.lat, origin.lng, origin.placeId]),
      destinations: destinations.map((destination) => [destination.lat, destination.lng, destination.placeId]),
      mode,
      preset,
    });

    if (this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey);
    }

    const matrix = Array.from({ length: origins.length }, () => Array.from({ length: destinations.length }, () => null));

    const maxItems = this.#resolveMaxItems(mode);
    const originChunkSize = Math.max(1, Math.min(origins.length, maxItems));

    for (let originStart = 0; originStart < origins.length; originStart += originChunkSize) {
      const originChunk = origins.slice(originStart, originStart + originChunkSize);
      const destinationChunkSize = Math.max(1, Math.floor(maxItems / originChunk.length));

      for (let destinationStart = 0; destinationStart < destinations.length; destinationStart += destinationChunkSize) {
        const destinationChunk = destinations.slice(destinationStart, destinationStart + destinationChunkSize);
        const request = {
          origins: originChunk.map((origin) => this.#buildWaypoint(origin)),
          destinations: destinationChunk.map((destination) => this.#buildWaypoint(destination)),
          travelMode: mode,
          units: this.google.maps.UnitSystem.METRIC,
          fields: ["distanceMeters", "durationMillis", "staticDurationMillis", "condition", "travelAdvisory", "localizedValues", "fallbackInfo"],
          ...this.#buildTimingOptions(mode, preset),
          ...this.#buildTrafficOptions(mode),
        };

        const response = await this.RouteMatrix.computeRouteMatrix(request);
        const rows = response.matrix?.rows || [];

        rows.forEach((row, originOffset) => {
          row.items.forEach((item, destinationOffset) => {
            matrix[originStart + originOffset][destinationStart + destinationOffset] = {
              durationMillis: item.durationMillis ?? Number.NaN,
              staticDurationMillis: item.staticDurationMillis ?? Number.NaN,
              distanceMeters: item.distanceMeters ?? Number.NaN,
              condition: item.condition || "ROUTE_NOT_FOUND",
              localizedValues: item.localizedValues,
              fallbackInfo: item.fallbackInfo,
              travelAdvisory: item.travelAdvisory,
              routeNote: item.error ? serializeError(item.error) : null,
            };
          });
        });
      }
    }

    this.routeCache.set(cacheKey, matrix);
    saveCache(STORAGE_KEYS.routeCache, Object.fromEntries(this.routeCache.entries()));
    return matrix;
  }

  async computeRoutes(origin, destinations, mode, preset) {
    return this.computeMatrix([origin], destinations, mode, preset).then((matrix) => matrix[0]);
  }

  async renderMarkers(boardState, dynamicRows, comparisonData) {
    if (!this.map) {
      return;
    }

    const entries = [];
    boardState.homes.forEach((home) => {
      entries.push({
        key: home.id,
        position: home.location,
        label: "L",
        title: home.location.label,
        type: "home",
        style: buildHomeColorStyle(home),
        target: { type: "home", id: home.id },
      });
    });

    boardState.fixedDestinations.forEach((destination) => {
      entries.push({
        key: destination.id,
        position: destination.location,
        label: "P",
        title: destination.label,
        type: "destination",
        target: { type: "column", id: destination.id },
      });
    });

    dynamicRows.forEach((row) => {
      entries.push({
        key: row.id,
        position: row.location,
        label: "N",
        title: row.placeLabel,
        type: "dynamic",
        target: { type: "column", id: row.rowId },
      });
    });

    const nextKeys = new Set(entries.map((entry) => entry.key));
    for (const [key, marker] of this.markers.entries()) {
      if (!nextKeys.has(key)) {
        marker.setMap(null);
        this.markers.delete(key);
      }
    }

    entries.forEach((entry) => {
      let marker = this.markers.get(entry.key);
      if (!marker) {
        marker = new this.AdvancedMarkerElementClass({
          map: this.map,
          position: entry.position,
          title: entry.title,
          content: this.#buildMarkerContent(entry, comparisonData?.onSelectMarker),
          zIndex: this.#getMarkerZIndex(entry.type),
        });
        this.markers.set(entry.key, marker);
      } else {
        marker.position = entry.position;
        marker.title = entry.title;
        marker.content = this.#buildMarkerContent(entry, comparisonData?.onSelectMarker);
        marker.zIndex = this.#getMarkerZIndex(entry.type);
      }
    });

    const bounds = new this.google.maps.LatLngBounds();
    entries.forEach((entry) => bounds.extend(entry.position));

    if (!bounds.isEmpty() && !comparisonData?.preserveViewport && !comparisonData?.highlight) {
      this.map.fitBounds(bounds, 64);
    }

    if (comparisonData?.highlight) {
      await this.highlightComparisonCell(comparisonData.highlight);
    } else {
      this.clearHighlight();
    }
  }

  async highlightComparisonCell(highlightData) {
    const { homeLocation, destinationLocation, mode, preset, direction } = highlightData;
    if (!this.map || !homeLocation || !destinationLocation) {
      return;
    }

    const requestId = ++this.highlightRequestId;
    this.#clearRoutePolylines();
    const origin = direction === "DESTINATIONS_TO_HOME" ? destinationLocation : homeLocation;
    const destination = direction === "DESTINATIONS_TO_HOME" ? homeLocation : destinationLocation;

    try {
      const request = {
        origin: this.#buildWaypoint(origin),
        destination: this.#buildWaypoint(destination),
        travelMode: mode,
        fields: this.#buildRouteFields(mode),
        ...this.#buildTimingOptions(mode, preset),
        ...this.#buildTrafficOptions(mode),
      };

      const { routes } = await this.RouteClass.computeRoutes(request);
      if (requestId !== this.highlightRequestId) {
        return;
      }

      if (routes?.[0]) {
        this.routePolylines = routes[0].createPolylines();
        this.routePolylines.forEach((polyline) => {
          polyline.setOptions({
            strokeColor: "#d76c2f",
            strokeOpacity: 0.85,
            strokeWeight: 5,
          });
          polyline.setMap(this.map);
        });
        const routeBounds = this.#buildPolylineBounds(this.routePolylines);
        if (routeBounds && !routeBounds.isEmpty()) {
          this.map.fitBounds(routeBounds, 48);
        } else {
          this.#fitLocations(origin, destination);
        }
        this.#clearFallbackHighlight();
        return;
      }
    } catch {
      // Fall back to a straight segment when route rendering is unavailable.
    }

    if (!this.highlightCircle) {
      this.highlightCircle = new this.google.maps.Polyline({
        map: this.map,
        strokeColor: "#d76c2f",
        strokeOpacity: 0.85,
        strokeWeight: 4,
      });
    }

    this.highlightCircle.setPath([origin, destination]);
    this.#fitLocations(origin, destination);
  }

  clearHighlight() {
    this.highlightRequestId += 1;
    this.#clearRoutePolylines();
    this.#clearFallbackHighlight();
  }

  centerLocation(locationRef) {
    if (!this.map || !locationRef) {
      return;
    }

    this.map.panTo(locationRef);
  }

  #clearFallbackHighlight() {
    if (this.highlightCircle) {
      this.highlightCircle.setMap(null);
      this.highlightCircle = null;
    }
  }

  #clearRoutePolylines() {
    this.routePolylines.forEach((polyline) => polyline.setMap(null));
    this.routePolylines = [];
  }

  #fitLocations(origin, destination) {
    const bounds = new this.google.maps.LatLngBounds();
    bounds.extend(origin);
    bounds.extend(destination);
    this.map.fitBounds(bounds, 48);
  }

  #buildPolylineBounds(polylines) {
    if (!polylines?.length) {
      return null;
    }

    const bounds = new this.google.maps.LatLngBounds();
    let hasPoints = false;
    polylines.forEach((polyline) => {
      const path = polyline.getPath?.();
      if (!path) {
        return;
      }

      path.forEach((point) => {
        bounds.extend(point);
        hasPoints = true;
      });
    });

    return hasPoints ? bounds : null;
  }

  #buildWaypoint(locationRef) {
    return { lat: locationRef.lat, lng: locationRef.lng };
  }

  #buildTimingOptions(mode, preset) {
    const targetDate = nextDateForPreset(preset);
    return { departureTime: targetDate };
  }

  #buildTrafficOptions(mode) {
    if (mode === "DRIVING") {
      return { routingPreference: "TRAFFIC_AWARE_OPTIMAL" };
    }

    return {};
  }

  #buildRouteFields(mode) {
    if (mode === "TRANSIT") {
      return ["path", "legs"];
    }

    if (mode === "DRIVING") {
      return ["path", "travelAdvisory"];
    }

    return ["path"];
  }

  #buildMarkerContent(entry, onSelectMarker, isDraft = false) {
    const wrapper = document.createElement("button");
    wrapper.type = "button";
    wrapper.className = `map-marker-pill map-marker-pill--${entry.type}${isDraft ? " map-marker-pill--draft" : ""}`;
    wrapper.title = entry.title;
    wrapper.textContent = entry.label;
    if (entry.style) {
      wrapper.style.cssText = entry.style;
    }
    wrapper.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelectMarker?.(entry.target);
    });
    return wrapper;
  }

  #getMarkerZIndex(type) {
    if (type === "home") {
      return 30;
    }

    if (type === "destination") {
      return 20;
    }

    return 10;
  }

  #resolveMaxItems(mode) {
    if (mode === "TRANSIT" || mode === "DRIVING") {
      return 100;
    }

    return 625;
  }

  #buildAddressLabel(geocoderResult) {
    if (!geocoderResult) {
      return "Pinned location";
    }

    const formattedAddress = geocoderResult.formatted_address || "";
    const firstSegment = formattedAddress.split(",")[0]?.trim();
    if (firstSegment) {
      return firstSegment;
    }

    const route = geocoderResult.address_components?.find((component) => component.types.includes("route"))?.long_name;
    const streetNumber = geocoderResult.address_components?.find((component) => component.types.includes("street_number"))?.long_name;
    if (route && streetNumber) {
      return `${route} ${streetNumber}`;
    }

    return formattedAddress || "Pinned location";
  }

  #distanceToLocation(origin, locationLike) {
    const target = toPlainLatLng(locationLike);
    if (!origin || !target) {
      return Number.POSITIVE_INFINITY;
    }

    const latScale = 111320;
    const lngScale = Math.cos(((origin.lat + target.lat) / 2) * (Math.PI / 180)) * 111320;
    const latDelta = (target.lat - origin.lat) * latScale;
    const lngDelta = (target.lng - origin.lng) * lngScale;
    return Math.hypot(latDelta, lngDelta);
  }
}
