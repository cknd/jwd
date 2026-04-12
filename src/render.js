import { ROUTE_DIRECTIONS, TRAVEL_MODES } from "./constants.js";
import { buildHomeColorStyle, escapeHtml, formatDuration, formatPresetLabel, formatTimestamp } from "./utils.js";

export function renderPresetMenu(elements, boardState, handlers) {
  renderGenericList(
    elements.presetsList,
    boardState.presets,
    (preset) => ({
      title: formatPresetLabel(preset),
      actions: [
        ...(boardState.presets.length > 1 ? [{ label: "Remove", danger: true, action: () => handlers.onRemovePreset(preset.id) }] : []),
      ],
    }),
  );
}

export function renderModeAndPresetSelectors(elements, boardState, handlers) {
  renderSelect(
    elements.modeSelect,
    TRAVEL_MODES,
    boardState.selectedMode,
    (value) => handlers.onSelectMode(value),
  );

  renderSelect(
    elements.presetSelect,
    [
      ...boardState.presets.map((preset) => ({ value: preset.id, label: formatPresetLabel(preset) })),
      { value: "__CUSTOMIZE__", label: "Customize..." },
    ],
    boardState.selectedPresetId,
    (value) => {
      if (value === "__CUSTOMIZE__") {
        elements.presetSelect.value = boardState.selectedPresetId;
        handlers.onOpenPresetMenu();
        return;
      }
      handlers.onSelectPreset(value);
    },
  );

  const destinationsToHome = boardState.selectedDirection === ROUTE_DIRECTIONS[1].value;
  elements.directionToggle.classList.toggle("is-destinations-to-home", destinationsToHome);
  elements.directionToggle.setAttribute(
    "aria-label",
    destinationsToHome ? "Travel direction: Points of Interest to Location" : "Travel direction: Location to Points of Interest",
  );
  elements.directionToggle.title = destinationsToHome
    ? "Click to switch to Location to Points of Interest"
    : "Click to switch to Points of Interest to Location";
}

export function renderComparison(elements, boardState, snapshot, highlightedCell, handlers) {
  const destinationColumns = snapshot.rows.length ? snapshot.rows : buildPlaceholderColumns(boardState);
  const homeCount = boardState.homes.length;
  const destinationCount = destinationColumns.length;

  elements.comparisonStatus.textContent =
    homeCount === 0 && destinationCount === 0
      ? "Start by adding a location or a Point of Interest."
      : homeCount === 0
        ? "Add at least one location to compare travel times."
        : destinationCount === 0
          ? "Add at least one Point of Interest to compare travel times."
          : "";
  elements.comparisonFootnote.textContent = snapshot.computedAt
    ? `Times computed via Google Maps API at ${formatTimestamp(snapshot.computedAt)}.`
    : "";

  elements.comparisonTableContainer.innerHTML = buildTableMarkup(
    boardState,
    destinationColumns,
    highlightedCell,
    handlers.tableFocus,
    handlers.pendingDelete,
  );
  elements.comparisonGraphContainer.innerHTML = buildGraphMarkup(boardState, destinationColumns, highlightedCell);

  bindTableInteractions(elements.comparisonTableContainer, handlers);
  bindGraphInteractions(elements.comparisonGraphContainer, handlers);
}

function buildPlaceholderColumns(boardState) {
  const emptyCellForHome = (home) => ({
    homeId: home.id,
    formattedDuration: "Pending",
    formattedDistance: "",
    destinationLabel: "",
    routeNote: null,
  });

  const fixedColumns = boardState.fixedDestinations.map((destination) => ({
    id: destination.id,
    kind: "FIXED",
    rowLabel: destination.label,
    rowSubtitle: destination.location.address || "",
    cells: boardState.homes.map(emptyCellForHome),
  }));

  const dynamicColumns = boardState.dynamicGroups.flatMap((group) =>
    Array.from({ length: group.count }, (_, index) => ({
      id: `${group.id}-${index + 1}`,
      kind: "DYNAMIC",
      dynamicGroupId: group.id,
      rowLabel: `${buildDynamicRowBaseLabel(group.primaryType)} #${index + 1}`,
      rowSubtitle: "",
      cells: boardState.homes.map(emptyCellForHome),
    })),
  );

  return [...fixedColumns, ...dynamicColumns];
}

function bindTableInteractions(container, handlers) {
  container.querySelectorAll("[data-home-index][data-row-id]").forEach((button) => {
    button.addEventListener("click", () => {
      handlers.onSelectCell(button.getAttribute("data-row-id"), Number(button.getAttribute("data-home-index")));
    });
  });

  container.querySelectorAll("[data-request-delete-kind]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onRequestDelete({
        kind: button.getAttribute("data-request-delete-kind"),
        id: button.getAttribute("data-request-delete-id"),
        scopeKey: button.getAttribute("data-request-delete-scope"),
      });
    });
  });

  container.querySelectorAll("[data-edit-kind]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onEditItem({
        kind: button.getAttribute("data-edit-kind"),
        id: button.getAttribute("data-edit-id"),
      });
    });
  });

  container.querySelectorAll("[data-confirm-delete-kind]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onConfirmDelete({
        kind: button.getAttribute("data-confirm-delete-kind"),
        id: button.getAttribute("data-confirm-delete-id"),
      });
    });
  });

  container.querySelectorAll("[data-cancel-delete]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handlers.onCancelDelete();
    });
  });

  container.querySelectorAll("[data-center-home-id]").forEach((button) => {
    button.addEventListener("click", () => handlers.onCenterHome(button.getAttribute("data-center-home-id")));
  });

  container.querySelectorAll("[data-center-destination-id]").forEach((button) => {
    button.addEventListener("click", () => {
      handlers.onCenterDestination(
        button.getAttribute("data-center-destination-id"),
        button.getAttribute("data-destination-kind"),
      );
    });
  });

}

function bindGraphInteractions(container, handlers) {
  container.querySelectorAll("[data-home-index][data-row-id]").forEach((button) => {
    button.addEventListener("click", () => {
      handlers.onSelectCell(button.getAttribute("data-row-id"), Number(button.getAttribute("data-home-index")));
    });
  });
}

function renderGenericList(listElement, items, projector) {
  listElement.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "Nothing added yet.";
    listElement.append(empty);
    return;
  }

  items.forEach((item, index) => {
    const descriptor = projector(item, index);
    const itemNode = document.createElement("li");
    const itemHead = document.createElement("div");
    itemHead.className = "item-head";

    const textBlock = document.createElement("div");
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = descriptor.title;
    textBlock.append(title);

    if (descriptor.subtitle) {
      const subtitle = document.createElement("div");
      subtitle.className = "item-subtitle";
      subtitle.textContent = descriptor.subtitle;
      textBlock.append(subtitle);
    }

    const actions = document.createElement("div");
    actions.className = "item-actions";

    descriptor.actions.forEach((actionDescriptor) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chip-button${actionDescriptor.danger ? " is-danger" : ""}`;
      button.textContent = actionDescriptor.label;
      button.addEventListener("click", actionDescriptor.action);
      actions.append(button);
    });

    itemHead.append(textBlock, actions);
    itemNode.append(itemHead);
    listElement.append(itemNode);
  });
}

function renderSelect(element, options, selectedValue, onChange) {
  element.innerHTML = "";
  options.forEach((optionDescriptor) => {
    const option = document.createElement("option");
    option.value = optionDescriptor.value;
    option.textContent = optionDescriptor.label;
    option.selected = optionDescriptor.value === selectedValue;
    element.append(option);
  });

  if (!element.dataset.bound) {
    element.addEventListener("change", () => onChange(element.value));
    element.dataset.bound = "true";
  }

  element.value = selectedValue;
}

function buildTableMarkup(boardState, destinationColumns, highlightedCell, tableFocus, pendingDelete) {
  const destinationHeaders = destinationColumns
    .map((column) => {
      const removeId = column.kind === "DYNAMIC" ? column.dynamicGroupId : column.id;
      const removeKind = column.kind === "DYNAMIC" ? "dynamic" : "destination";
      const isColumnFocused = tableFocus?.type === "column" && tableFocus.id === column.id;
      const hasOpenDelete =
        pendingDelete &&
        pendingDelete.kind === removeKind &&
        pendingDelete.id === removeId &&
        pendingDelete.scopeKey === column.id;
      return `
        <th scope="col" class="comparison-column-header comparison-column-header--${column.kind === "DYNAMIC" ? "dynamic" : "destination"}${isColumnFocused ? " is-table-focused" : ""}${hasOpenDelete ? " is-popout-open" : ""}" data-table-focus-key="column:${escapeHtml(column.id)}">
          <div class="table-heading-topline">
            <div class="table-heading-title">${buildCenterableHeading(column.rowLabel, column.kind === "DYNAMIC" ? "dynamic" : "destination", {
              "data-center-destination-id": removeId,
              "data-destination-kind": column.kind === "DYNAMIC" ? "dynamic" : "fixed",
            })}</div>
            <div class="table-heading-actions table-heading-actions--inline">
              ${buildEditControl({
                kind: removeKind,
                id: removeId,
                label: column.kind === "DYNAMIC" ? "Edit nearby group" : "Edit Point of Interest",
              })}
              ${buildDeleteControl(
                {
                  kind: removeKind,
                  id: removeId,
                  scopeKey: column.id,
                  label: column.kind === "DYNAMIC" ? "Remove nearby group" : "Remove Point of Interest",
                },
                pendingDelete,
              )}
            </div>
          </div>
          ${column.rowSubtitle ? `<div class="table-heading-subtitle">${escapeHtml(column.rowSubtitle)}</div>` : ""}
        </th>
      `;
    })
    .join("");

  const homeRows = boardState.homes
    .map((home, homeIndex) => {
      const isHomeFocused = tableFocus?.type === "home" && tableFocus.id === home.id;
      const hasOpenDelete =
        pendingDelete &&
        pendingDelete.kind === "home" &&
        pendingDelete.id === home.id &&
        pendingDelete.scopeKey === home.id;
      const cells = destinationColumns.length
        ? destinationColumns
            .map((column) => {
              const cell = findCellForHome(column, home);
              const highlighted =
                highlightedCell && highlightedCell.rowId === column.id && highlightedCell.homeIndex === homeIndex ? " is-highlighted" : "";
              const columnFocused = tableFocus?.type === "column" && tableFocus.id === column.id ? " comparison-column-focus" : "";
              return `
                <td class="${columnFocused.trim()}">
                  <div class="comparison-cell${highlighted}">
                    <button class="comparison-cell-hitarea" type="button" data-row-id="${escapeHtml(column.id)}" data-home-index="${homeIndex}"></button>
                    <div class="comparison-cell-content">
                      <div class="cell-duration-row">
                        <div class="cell-duration">${buildDurationDisplay(cell)}</div>
                        ${buildExternalRouteLink(boardState, home, cell)}
                      </div>
                      <div class="cell-distance">${escapeHtml(cell?.formattedDistance || "Unavailable")}</div>
                      <div class="cell-detail-row">
                        ${buildCellDetailContent(column, cell)}
                      </div>
                      ${cell?.routeNote ? `<div class="route-note">${escapeHtml(cell.routeNote)}</div>` : ""}
                    </div>
                  </div>
                </td>
              `;
            })
            .join("")
        : "";

      return `
        <tr class="comparison-home-row${isHomeFocused ? " comparison-row-focus" : ""}" data-table-focus-key="home:${escapeHtml(home.id)}" style="${escapeHtml(buildHomeColorStyle(home))}">
          <th scope="row" class="comparison-row-header${isHomeFocused ? " is-table-focused" : ""}${hasOpenDelete ? " is-popout-open" : ""}">
            <div class="table-heading-topline">
              <div class="table-heading-title">${buildCenterableHeading(home.location.label, "home", {
                "data-center-home-id": home.id,
              })}</div>
              <div class="table-heading-actions table-heading-actions--inline">
                ${buildEditControl({
                  kind: "home",
                  id: home.id,
                  label: "Edit location",
                })}
                ${buildDeleteControl(
                  {
                    kind: "home",
                    id: home.id,
                    scopeKey: home.id,
                    label: "Remove location",
                  },
                  pendingDelete,
                )}
              </div>
            </div>
            <div class="table-heading-subtitle">${escapeHtml(home.location.address || "")}</div>
          </th>
          ${cells}
        </tr>
      `;
    })
    .join("");

  const bodyMarkup = homeRows;

  return `
    <table class="comparison-table">
      <thead>
        <tr>
          <th scope="col" class="comparison-row-header comparison-corner-header">
            <div class="corner-axis-hint">
              <div class="corner-axis-line">Points of Interest →</div>
              <div class="corner-axis-line">Candidate Locations ↓</div>
            </div>
          </th>
          ${destinationHeaders}
        </tr>
      </thead>
      <tbody>
        ${bodyMarkup}
      </tbody>
    </table>
  `;
}

function buildCenterableHeading(text, type, attributes = {}) {
  const { style = "", ...restAttributes } = attributes;
  const serializedAttributes = Object.entries(restAttributes)
    .map(([key, value]) => `${key}="${escapeHtml(String(value))}"`)
    .join(" ");

  const attributeMarkup = serializedAttributes ? ` ${serializedAttributes}` : "";
  const styleMarkup = style ? ` style="${escapeHtml(style)}"` : "";
  return `<button type="button" class="table-heading-link table-heading-link--${type}"${attributeMarkup}${styleMarkup}>${escapeHtml(text)}</button>`;
}

function buildExternalRouteLink(boardState, home, cell) {
  if (!cell?.destinationLocation || !cell?.isReachable) {
    return "";
  }

  const origin = boardState.selectedDirection === "DESTINATIONS_TO_HOME" ? cell.destinationLocation : home.location;
  const destination = boardState.selectedDirection === "DESTINATIONS_TO_HOME" ? home.location : cell.destinationLocation;
  const href = buildGoogleMapsRouteUrl(origin, destination, boardState.selectedMode);

  return `
    <a
      class="cell-external-link"
      href="${escapeHtml(href)}"
      target="_blank"
      rel="noreferrer noopener"
      title="Open this route in Google Maps"
      aria-label="Open this route in Google Maps"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M9.5 2.25H13a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V4.81L7.78 9.28a.75.75 0 1 1-1.06-1.06l4.47-4.47H9.5a.75.75 0 0 1 0-1.5Z"></path>
        <path d="M4 3.25h2a.75.75 0 0 1 0 1.5H4.75v6.5h6.5V10a.75.75 0 0 1 1.5 0v2a.75.75 0 0 1-.75.75H4A.75.75 0 0 1 3.25 12V4A.75.75 0 0 1 4 3.25Z"></path>
      </svg>
    </a>
  `;
}

function buildCellDetailContent(column, cell) {
  const label = escapeHtml(cell?.destinationLabel || column.rowLabel);
  if (column.kind !== "DYNAMIC" || !cell?.destinationLocation) {
    return `<span class="cell-detail-text">${label}</span>`;
  }

  return `
    <a
      class="cell-detail-link cell-detail-link--dynamic"
      href="${escapeHtml(buildGoogleMapsPlaceUrl(cell.destinationLocation))}"
      target="_blank"
      rel="noreferrer noopener"
      title="Open this place in Google Maps"
      aria-label="Open this place in Google Maps"
    >
      ${label}
    </a>
  `;
}

function buildGoogleMapsRouteUrl(origin, destination, mode) {
  const travelMode = mode === "DRIVING" ? "driving" : mode === "BICYCLING" ? "bicycling" : mode === "WALKING" ? "walking" : "transit";
  const params = new URLSearchParams({
    api: "1",
    origin: formatMapsWaypoint(origin),
    destination: formatMapsWaypoint(destination),
    travelmode: travelMode,
  });

  if (origin?.placeId) {
    params.set("origin_place_id", origin.placeId);
  }

  if (destination?.placeId) {
    params.set("destination_place_id", destination.placeId);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildGoogleMapsPlaceUrl(location) {
  const params = new URLSearchParams({
    api: "1",
    query: formatMapsWaypoint(location),
  });

  if (location?.placeId) {
    params.set("query_place_id", location.placeId);
  }

  return `https://www.google.com/maps/search/?${params.toString()}`;
}

function formatMapsWaypoint(location) {
  if (!location) {
    return "";
  }

  if (location.placeId && location.label) {
    return location.label;
  }

  if (location.address) {
    return location.address;
  }

  return `${location.lat},${location.lng}`;
}

function buildDeleteControl(descriptor, pendingDelete) {
  const isOpen =
    pendingDelete &&
    pendingDelete.kind === descriptor.kind &&
    pendingDelete.id === descriptor.id &&
    pendingDelete.scopeKey === descriptor.scopeKey;

  return `
    <div class="table-delete-control${isOpen ? " is-open" : ""}" data-delete-control>
      <button
        class="table-icon-button"
        type="button"
        aria-label="${escapeHtml(descriptor.label)}"
        title="${escapeHtml(descriptor.label)}"
        data-request-delete-kind="${escapeHtml(descriptor.kind)}"
        data-request-delete-id="${escapeHtml(descriptor.id)}"
        data-request-delete-scope="${escapeHtml(descriptor.scopeKey)}"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d="M6 2.5h4l.5 1.5H13a.75.75 0 0 1 0 1.5h-.63l-.55 6.05A1.75 1.75 0 0 1 10.08 13H5.92A1.75 1.75 0 0 1 4.18 11.55L3.63 5.5H3a.75.75 0 0 1 0-1.5h2.5L6 2.5Zm.27 3.25a.65.65 0 0 1 .65.59l.3 4.3a.65.65 0 0 1-1.3.1l-.3-4.3a.65.65 0 0 1 .65-.69Zm3.46 0a.65.65 0 0 1 .65.69l-.3 4.3a.65.65 0 1 1-1.3-.1l.3-4.3a.65.65 0 0 1 .65-.59Z"></path>
        </svg>
      </button>
      ${
        isOpen
          ? `
            <div class="table-delete-popout" data-delete-popout>
              <span>Delete?</span>
              <button
                class="table-mini-button table-mini-button--danger"
                type="button"
                data-confirm-delete-kind="${escapeHtml(descriptor.kind)}"
                data-confirm-delete-id="${escapeHtml(descriptor.id)}"
              >
                Delete
              </button>
              <button class="table-mini-button" type="button" data-cancel-delete>Cancel</button>
            </div>
          `
          : ""
      }
    </div>
  `;
}

function buildEditControl(descriptor) {
  return `
    <button
      class="table-icon-button table-icon-button--edit"
      type="button"
      aria-label="${escapeHtml(descriptor.label)}"
      title="${escapeHtml(descriptor.label)}"
      data-edit-kind="${escapeHtml(descriptor.kind)}"
      data-edit-id="${escapeHtml(descriptor.id)}"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <path d="M11.95 2.45a1.6 1.6 0 0 1 2.26 2.26l-7.1 7.1-2.96.7.7-2.96 7.1-7.1Zm-6.3 7.74-.23.98.98-.23 6.5-6.5-.75-.75-6.5 6.5Z"></path>
      </svg>
    </button>
  `;
}

function buildDynamicRowBaseLabel(primaryType) {
  return `nearest ${primaryType.replaceAll("_", " ")}`;
}

function findCellForHome(column, home) {
  if (!column?.cells?.length || !home) {
    return null;
  }

  return column.cells.find((cell) => cell?.homeId === home.id) || null;
}

function buildDurationDisplay(cell) {
  const label = cell?.formattedDuration || "Unavailable";
  if (!Number.isFinite(cell?.durationMillis)) {
    return `<span>${escapeHtml(label)}</span>`;
  }

  const minutesTotal = Math.max(0, cell.durationMillis / 60000);
  const fullHours = Math.floor(minutesTotal / 60);
  const remainderMinutes = minutesTotal % 60;
  const markers = [];

  if (fullHours === 0) {
    markers.push(buildDurationMarker(minutesTotal / 60));
  } else {
    for (let index = 0; index < fullHours; index += 1) {
      markers.push(buildDurationMarker(1));
    }
    if (remainderMinutes > 0) {
      markers.push(buildDurationMarker(remainderMinutes / 60));
    }
  }

  return `
    <span class="duration-display">
      <span class="duration-markers" aria-hidden="true">${markers.join("")}</span>
      <span class="duration-label">${escapeHtml(label)}</span>
    </span>
  `;
}

function buildDurationMarker(fraction) {
  const clamped = Math.max(0, Math.min(1, fraction));
  const radius = 5;
  const center = 6;
  const startX = center;
  const startY = center - radius;

  if (clamped >= 0.999) {
    return `
      <svg class="duration-marker" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <circle cx="${center}" cy="${center}" r="${radius}" class="duration-marker-base"></circle>
        <circle cx="${center}" cy="${center}" r="${radius}" class="duration-marker-fill"></circle>
      </svg>
    `;
  }

  if (clamped <= 0.001) {
    return `
      <svg class="duration-marker" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <circle cx="${center}" cy="${center}" r="${radius}" class="duration-marker-base"></circle>
      </svg>
    `;
  }

  const endAngle = (clamped * Math.PI * 2) - (Math.PI / 2);
  const endX = center + (radius * Math.cos(endAngle));
  const endY = center + (radius * Math.sin(endAngle));
  const largeArcFlag = clamped > 0.5 ? 1 : 0;
  const sectorPath = [
    `M ${center} ${center}`,
    `L ${startX} ${startY}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
    "Z",
  ].join(" ");

  return `
    <svg class="duration-marker" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <circle cx="${center}" cy="${center}" r="${radius}" class="duration-marker-base"></circle>
      <path d="${sectorPath}" class="duration-marker-fill"></path>
    </svg>
  `;
}

function buildGraphMarkup(boardState, destinationColumns, highlightedCell) {
  if (!boardState.homes.length || !destinationColumns.length) {
    return "";
  }

  const finiteDurations = destinationColumns
    .flatMap((column) => column.cells.map((cell) => cell?.durationMillis))
    .filter(Number.isFinite);

  if (!finiteDurations.length) {
    return `
      <section class="comparison-graph-block">
        <p class="muted">Bars will appear here once travel times have been computed.</p>
      </section>
    `;
  }

  const { scaleMaxDuration, ticks } = buildGraphTicks(Math.max(...finiteDurations));
  const gridLines = buildGraphGridLines(scaleMaxDuration, ticks);
  const activeModeLabel = TRAVEL_MODES.find((mode) => mode.value === boardState.selectedMode)?.label || boardState.selectedMode;
  const activePreset = boardState.presets.find((preset) => preset.id === boardState.selectedPresetId);
  const activeDirectionLabel = ROUTE_DIRECTIONS.find((direction) => direction.value === boardState.selectedDirection)?.label
    || boardState.selectedDirection;
  const yAxisLabels = ticks
    .map(
      (tick, index) => `
        <div class="graph-y-tick${index === 0 ? " is-top" : ""}${index === ticks.length - 1 ? " is-bottom" : ""}" style="bottom:${tick.fraction * 100}%">
          <span>${escapeHtml(formatDuration(tick.valueMillis))}</span>
        </div>
      `,
    )
    .join("");

  const legend = boardState.homes
    .map(
      (home) => `
        <div class="graph-legend-item">
          <span class="graph-legend-swatch" style="${escapeHtml(buildHomeColorStyle(home))}"></span>
          <span>${escapeHtml(home.location.label)}</span>
        </div>
      `,
    )
    .join("");
  const graphGroupStyle = buildGraphGroupStyle(boardState.homes.length);

  const groups = destinationColumns
    .map((column) => {
      const bars = boardState.homes
        .map((home, homeIndex) => {
          const cell = findCellForHome(column, home);
          const durationMillis = cell?.durationMillis;
          const height = Number.isFinite(durationMillis) && scaleMaxDuration > 0 ? Math.max(4, (durationMillis / scaleMaxDuration) * 100) : 0;
          const highlighted =
            highlightedCell && highlightedCell.rowId === column.id && highlightedCell.homeIndex === homeIndex ? " is-highlighted" : "";
          return `
            <button
              type="button"
              class="graph-bar-button${highlighted}"
              data-row-id="${escapeHtml(column.id)}"
              data-home-index="${homeIndex}"
              title="${escapeHtml(home.location.label)}: ${escapeHtml(cell?.formattedDuration || "Unavailable")}"
            >
              <span class="graph-bar" style="${escapeHtml(`${buildHomeColorStyle(home)}height:${height}%;`)}"></span>
            </button>
          `;
        })
        .join("");

      return `
        <section class="graph-group" style="${escapeHtml(graphGroupStyle)}">
          <div class="graph-bars">${bars}</div>
          <div class="graph-group-label" title="${escapeHtml(column.rowLabel)}">${escapeHtml(column.rowLabel)}</div>
        </section>
      `;
    })
    .join("");

  return `
    <section class="comparison-graph-block">
      <div class="graph-meta">
        Travel times by ${escapeHtml(activeModeLabel)}
        &nbsp;·&nbsp;
        ${escapeHtml(activePreset ? formatPresetLabel(activePreset) : "Unknown")}
        &nbsp;·&nbsp;
        Direction: ${escapeHtml(activeDirectionLabel)}
      </div>
      <div class="comparison-graph-frame">
        <div class="graph-y-axis">
          ${yAxisLabels}
        </div>
        <div class="comparison-graph-scroll">
          <div class="comparison-graph-plot">
            <div class="graph-grid-lines">
              ${gridLines
                .map(
                  (line) =>
                    `<span class="graph-grid-line ${escapeHtml(line.className)}" style="bottom:${line.bottom}%"></span>`,
                )
                .join("")}
            </div>
            ${groups}
          </div>
        </div>
      </div>
      <div class="graph-legend">
        <span class="graph-legend-title">Locations:</span>
        ${legend}
      </div>
    </section>
  `;
}

function buildGraphTicks(maxDurationMillis) {
  const rawStepMinutes = maxDurationMillis / 60000 / 4;
  const stepMinutes = Math.max(15, Math.ceil(rawStepMinutes / 15) * 15);
  const stepMillis = stepMinutes * 60000;
  const scaleMaxDuration = Math.max(stepMillis, Math.ceil(maxDurationMillis / stepMillis) * stepMillis);
  const ticks = [];

  for (let valueMillis = scaleMaxDuration; valueMillis >= 0; valueMillis -= stepMillis) {
    ticks.push({
      valueMillis,
      fraction: scaleMaxDuration > 0 ? valueMillis / scaleMaxDuration : 0,
    });
  }

  if (ticks.at(-1)?.valueMillis !== 0) {
    ticks.push({ valueMillis: 0, fraction: 0 });
  }

  return { scaleMaxDuration, ticks };
}

function buildGraphGridLines(scaleMaxDuration, ticks) {
  const lineMap = new Map();

  const addLine = (fraction, className = "") => {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      return;
    }

    const key = fraction.toFixed(6);
    const existing = lineMap.get(key);
    if (existing) {
      existing.classNames.add(className);
      return;
    }

    lineMap.set(key, {
      bottom: fraction * 100,
      classNames: new Set(className ? [className] : []),
    });
  };

  ticks.forEach((tick) => addLine(tick.fraction));

  const thirtyMinutesFraction = (30 * 60000) / scaleMaxDuration;
  if (thirtyMinutesFraction > 0 && thirtyMinutesFraction < 1) {
    addLine(thirtyMinutesFraction, "graph-grid-line--thirty");
  }

  const sixtyMinutesFraction = (60 * 60000) / scaleMaxDuration;
  if (sixtyMinutesFraction > 0 && sixtyMinutesFraction <= 1) {
    addLine(sixtyMinutesFraction, "graph-grid-line--sixty");
  }

  return Array.from(lineMap.values())
    .sort((left, right) => right.bottom - left.bottom)
    .map((line) => ({
      bottom: line.bottom,
      className: Array.from(line.classNames).join(" ").trim(),
    }));
}

function buildGraphGroupStyle(seriesCount) {
  const count = Math.max(1, Number(seriesCount) || 1);
  const barWidthRem = clampNumber(1.2 - ((count - 1) * 0.04), 0.72, 1.2);
  const gapRem = clampNumber(0.35 - ((count - 1) * 0.02), 0.12, 0.35);
  const groupWidthRem = Math.max(8, (count * barWidthRem) + ((count - 1) * gapRem) + 0.5);

  return [
    `--graph-group-width:${groupWidthRem.toFixed(3)}rem`,
    `--graph-bar-width:${barWidthRem.toFixed(3)}rem`,
    `--graph-bar-gap:${gapRem.toFixed(3)}rem`,
  ].join(";") + ";";
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
