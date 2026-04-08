import { formatDistance, formatDuration } from "./utils.js";

export async function buildComparisonSnapshot(boardState, provider) {
  const preset = boardState.presets.find((item) => item.id === boardState.selectedPresetId);
  if (!preset || boardState.homes.length === 0) {
    return emptySnapshot();
  }

  const fixedRows = await buildFixedRows(boardState, provider, preset);
  const dynamicRows = await buildDynamicRows(boardState, provider, preset);

  return {
    fixedRows,
    dynamicRows,
    rows: [...fixedRows, ...dynamicRows],
    computedAt: new Date(),
  };
}

export async function buildFixedRows(boardState, provider, preset) {
  if (boardState.fixedDestinations.length === 0) {
    return [];
  }

  const homes = boardState.homes.map((home) => home.location);
  const destinations = boardState.fixedDestinations.map((destination) => destination.location);
  const matrix = boardState.selectedDirection === "HOME_TO_DESTINATIONS"
    ? await provider.computeMatrix(homes, destinations, boardState.selectedMode, preset)
    : await provider.computeMatrix(destinations, homes, boardState.selectedMode, preset);

  return boardState.fixedDestinations.map((destination, destinationIndex) => ({
    id: destination.id,
    kind: "FIXED",
    rowLabel: destination.label,
    rowSubtitle: destination.location.address || "",
    homeId: null,
    placeLabel: destination.label,
    location: destination.location,
    cells: boardState.homes.map((home, homeIndex) =>
      normalizeCell(
        home,
        destination.location,
        boardState.selectedDirection === "HOME_TO_DESTINATIONS"
          ? matrix[homeIndex][destinationIndex]
          : matrix[destinationIndex][homeIndex],
        destination.label,
      ),
    ),
  }));
}

export async function buildDynamicRows(boardState, provider, preset) {
  const rows = [];

  for (const dynamicGroup of boardState.dynamicGroups) {
    const baseLabel = buildDynamicRowBaseLabel(dynamicGroup.primaryType);
    const resultsByHome = await Promise.all(
      boardState.homes.map(async (home) => {
        const nearbyPlaces = await provider.searchNearby(home, dynamicGroup);
        const routeItems = nearbyPlaces.length
          ? await Promise.all(
              nearbyPlaces.map((place) =>
                boardState.selectedDirection === "HOME_TO_DESTINATIONS"
                  ? provider.computeRoutes(home.location, [place], boardState.selectedMode, preset).then((items) => items[0])
                  : provider.computeRoutes(place, [home.location], boardState.selectedMode, preset).then((items) => items[0]),
              ),
            )
          : [];

        return {
          home,
          places: nearbyPlaces,
          routeItems,
        };
      }),
    );

    for (let ordinal = 0; ordinal < dynamicGroup.count; ordinal += 1) {
      const cells = resultsByHome.map(({ home, places, routeItems }) => {
        const location = places[ordinal];
        const item = routeItems[ordinal];
        return normalizeCell(home, location, item, dynamicGroup.label);
      });

      rows.push({
        id: `${dynamicGroup.id}-${ordinal + 1}`,
        kind: "DYNAMIC",
        dynamicGroupId: dynamicGroup.id,
        rowLabel: `${baseLabel} #${ordinal + 1}`,
        rowSubtitle: "",
        homeId: boardState.highlightedHomeId || boardState.homes[0]?.id,
        placeLabel: baseLabel,
        location: null,
        cells,
      });
    }
  }

  return rows;
}

export function collectMapDynamicRows(snapshot, boardState) {
  if (!snapshot?.dynamicRows?.length || !boardState?.homes?.length) {
    return [];
  }

  const rows = [];
  for (const row of snapshot.dynamicRows) {
    row.cells.forEach((cell, homeIndex) => {
      if (!cell?.destinationLocation) {
        return;
      }

      const homeId = boardState.homes[homeIndex]?.id;
      if (!homeId) {
        return;
      }

      rows.push({
        id: `${row.id}-${homeId}`,
        homeId,
        rowId: row.id,
        location: cell.destinationLocation,
        placeLabel: cell.destinationLabel,
      });
    });
  }

  return rows;
}

export function emptySnapshot() {
  return {
    fixedRows: [],
    dynamicRows: [],
    rows: [],
    computedAt: null,
  };
}

function normalizeCell(home, destinationLocation, routeItem, fallbackLabel) {
  if (!destinationLocation) {
    return {
      homeId: home.id,
      homeLabel: home.location.label,
      destinationLabel: `${fallbackLabel} unavailable`,
      destinationLocation: null,
      durationMillis: Number.NaN,
      distanceMeters: Number.NaN,
      routeNote: "No nearby place found.",
      staticDurationMillis: Number.NaN,
      formattedDuration: "Unavailable",
      formattedDistance: "Unavailable",
      isReachable: false,
    };
  }

  const durationMillis = routeItem?.durationMillis ?? Number.NaN;
  const distanceMeters = routeItem?.distanceMeters ?? Number.NaN;
  const condition = routeItem?.condition || "";
  const isReachable = Number.isFinite(durationMillis) && condition !== "ROUTE_NOT_FOUND";

  return {
    homeId: home.id,
    homeLabel: home.location.label,
    destinationLabel: destinationLocation.label || fallbackLabel,
    destinationLocation,
    durationMillis,
    distanceMeters,
    staticDurationMillis: routeItem?.staticDurationMillis ?? Number.NaN,
    routeNote: routeItem?.routeNote || (routeItem?.fallbackInfo ? "Fallback applied." : null),
    formattedDuration: formatDuration(durationMillis),
    formattedDistance: formatDistance(distanceMeters),
    isReachable,
  };
}

function buildDynamicRowBaseLabel(primaryType) {
  return `nearest ${primaryType.replaceAll("_", " ")}`;
}
