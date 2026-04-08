import { DAY_TYPES, PRESET_KINDS, TRAVEL_MODES } from "./constants.js";
import { escapeHtml, formatDuration, formatTimestamp } from "./utils.js";

export function renderPresetMenu(elements, boardState, handlers) {
  updateCount(elements.presetsCount, boardState.presets.length);

  renderGenericList(
    elements.presetsList,
    boardState.presets,
    (preset) => ({
      title: preset.label,
      subtitle: `${findLabel(PRESET_KINDS, preset.kind)} • ${findLabel(DAY_TYPES, preset.dayType)} • ${preset.timeLocal}`,
      actions: [
        { label: "Use", action: () => handlers.onSelectPreset(preset.id) },
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
    boardState.presets.map((preset) => ({ value: preset.id, label: preset.label })),
    boardState.selectedPresetId,
    (value) => handlers.onSelectPreset(value),
  );

  elements.presetMenuButton.setAttribute("aria-expanded", String(!elements.presetMenuPanel.classList.contains("is-hidden")));
}

export function renderComparison(elements, boardState, snapshot, highlightedCell, handlers) {
  const destinationColumns = snapshot.rows.length ? snapshot.rows : buildPlaceholderColumns(boardState);
  const homeCount = boardState.homes.length;
  const destinationCount = destinationColumns.length;

  elements.comparisonStatus.textContent =
    homeCount === 0 && destinationCount === 0
      ? "Start by adding a home row or a destination column."
      : homeCount === 0
        ? "Add at least one home row to compare travel times."
        : destinationCount === 0
          ? "Add at least one destination column to compare travel times."
          : "";
  elements.comparisonFootnote.textContent = snapshot.computedAt
    ? `Google Maps Platform. Computed at ${formatTimestamp(snapshot.computedAt)}.`
    : "";

  elements.comparisonTableContainer.innerHTML = buildTableMarkup(boardState, destinationColumns, highlightedCell);
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

  container.querySelectorAll("[data-remove-home-id]").forEach((button) => {
    button.addEventListener("click", () => handlers.onRemoveHome(button.getAttribute("data-remove-home-id")));
  });

  container.querySelectorAll("[data-remove-destination-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-remove-destination-id");
      const kind = button.getAttribute("data-destination-kind");
      if (kind === "dynamic") {
        handlers.onRemoveDynamic(id);
      } else {
        handlers.onRemoveDestination(id);
      }
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

  container.querySelectorAll("[data-open-home-dialog]").forEach((button) => {
    button.addEventListener("click", handlers.onOpenHomeDialog);
  });

  container.querySelectorAll("[data-open-destination-dialog]").forEach((button) => {
    button.addEventListener("click", handlers.onOpenDestinationDialog);
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
  const currentValue = element.value;
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

  if (currentValue && Array.from(element.options).some((option) => option.value === currentValue)) {
    element.value = currentValue;
  } else {
    element.value = selectedValue;
  }
}

function updateCount(element, count) {
  element.textContent = String(count);
}

function findLabel(collection, value) {
  return collection.find((entry) => entry.value === value)?.label || value;
}

function buildTableMarkup(boardState, destinationColumns, highlightedCell) {
  const destinationHeaders = destinationColumns
    .map((column) => {
      const removeId = column.kind === "DYNAMIC" ? column.dynamicGroupId : column.id;
      const removeKind = column.kind === "DYNAMIC" ? "dynamic" : "fixed";
      return `
        <th scope="col" class="comparison-column-header comparison-column-header--${column.kind === "DYNAMIC" ? "dynamic" : "destination"}">
          <div class="table-heading-topline">
            <div class="table-heading-title">${buildCenterableLabelPill(column.rowLabel, column.kind === "DYNAMIC" ? "dynamic" : "destination", {
              "data-center-destination-id": removeId,
              "data-destination-kind": removeKind,
            })}</div>
            <div class="table-heading-actions table-heading-actions--inline">
              <button class="table-mini-button" type="button" data-remove-destination-id="${escapeHtml(removeId)}" data-destination-kind="${removeKind}">Remove</button>
            </div>
          </div>
          ${column.rowSubtitle ? `<div class="table-heading-subtitle">${escapeHtml(column.rowSubtitle)}</div>` : ""}
        </th>
      `;
    })
    .join("");

  const homeRows = boardState.homes
    .map((home, homeIndex) => {
      const cells = destinationColumns.length
        ? destinationColumns
            .map((column) => {
              const cell = column.cells[homeIndex];
              const highlighted =
                highlightedCell && highlightedCell.rowId === column.id && highlightedCell.homeIndex === homeIndex ? " is-highlighted" : "";
              return `
                <td>
                  <div class="comparison-cell${highlighted}">
                    <button type="button" data-row-id="${escapeHtml(column.id)}" data-home-index="${homeIndex}">
                      <div class="cell-duration">${buildDurationDisplay(cell)}</div>
                      <div class="cell-distance">${escapeHtml(cell?.formattedDistance || "Unavailable")}</div>
                      <div class="cell-detail">${escapeHtml(cell?.destinationLabel || column.rowLabel)}</div>
                      ${cell?.routeNote ? `<div class="route-note">${escapeHtml(cell.routeNote)}</div>` : ""}
                    </button>
                  </div>
                </td>
              `;
            })
            .join("")
        : "";

      return `
        <tr>
          <th scope="row" class="comparison-row-header">
            <div class="table-heading-topline">
              <div class="table-heading-actions table-heading-actions--inline">
                <button class="table-mini-button" type="button" data-remove-home-id="${escapeHtml(home.id)}">Remove</button>
              </div>
              <div class="table-heading-title">${buildCenterableLabelPill(home.location.label, "home", {
                "data-center-home-id": home.id,
              })}</div>
            </div>
            <div class="table-heading-subtitle">${escapeHtml(home.location.address || "")}</div>
          </th>
          ${cells}
          ${buildTrailingAddDestinationCell()}
        </tr>
      `;
    })
    .join("");

  const addHomeRow = `
    <tr>
      <th scope="row" class="comparison-row-header">
        <button class="table-add-button" type="button" data-open-home-dialog>Add Candidate Home</button>
      </th>
      ${destinationColumns.map(() => '<td class="comparison-empty-cell"></td>').join("")}
      ${buildTrailingAddDestinationCell()}
    </tr>
  `;

  const bodyMarkup = `${homeRows}${addHomeRow}`;

  return `
    <table class="comparison-table">
      <thead>
        <tr>
          <th scope="col" class="comparison-row-header comparison-corner-header">
            <div class="table-heading-title">Candidate homes</div>
          </th>
          ${destinationHeaders}
          <th scope="col">
            <button class="table-add-button" type="button" data-open-destination-dialog>Add Destination</button>
          </th>
        </tr>
      </thead>
      <tbody>
        ${bodyMarkup}
      </tbody>
    </table>
  `;
}

function buildTrailingAddDestinationCell() {
  return '<td class="comparison-empty-cell"></td>';
}

function buildLabelPill(text, type) {
  return `<span class="table-label-pill table-label-pill--${type}">${escapeHtml(text)}</span>`;
}

function buildCenterableLabelPill(text, type, attributes = {}) {
  const serializedAttributes = Object.entries(attributes)
    .map(([key, value]) => `${key}="${escapeHtml(String(value))}"`)
    .join(" ");

  return `<button type="button" class="table-label-pill-button" ${serializedAttributes}>${buildLabelPill(text, type)}</button>`;
}

function buildDynamicRowBaseLabel(primaryType) {
  return `nearest ${primaryType.replaceAll("_", " ")}`;
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

  const scaleMaxDuration = roundUpDurationMillis(Math.max(...finiteDurations));
  const tickFractions = [1, 0.75, 0.5, 0.25, 0];
  const yAxisLabels = tickFractions
    .map(
      (fraction) => `
        <div class="graph-y-tick">
          <span>${escapeHtml(formatDuration(scaleMaxDuration * fraction))}</span>
        </div>
      `,
    )
    .join("");

  const legend = boardState.homes
    .map(
      (home, index) => `
        <div class="graph-legend-item">
          <span class="graph-legend-swatch graph-home-color-${index % 6}"></span>
          <span>${escapeHtml(home.location.label)}</span>
        </div>
      `,
    )
    .join("");

  const groups = destinationColumns
    .map((column) => {
      const bars = column.cells
        .map((cell, homeIndex) => {
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
              title="${escapeHtml(boardState.homes[homeIndex].location.label)}: ${escapeHtml(cell?.formattedDuration || "Unavailable")}"
            >
              <span class="graph-bar graph-home-color-${homeIndex % 6}" style="height:${height}%"></span>
            </button>
          `;
        })
        .join("");

      return `
        <section class="graph-group">
          <div class="graph-bars">${bars}</div>
          <div class="graph-group-label" title="${escapeHtml(column.rowLabel)}">${escapeHtml(column.rowLabel)}</div>
        </section>
      `;
    })
    .join("");

  return `
    <section class="comparison-graph-block">
      <div class="graph-legend">${legend}</div>
      <div class="comparison-graph-frame">
        <div class="graph-y-axis">
          ${yAxisLabels}
        </div>
        <div class="comparison-graph-scroll">
          <div class="comparison-graph-plot">
            <div class="graph-grid-lines">
              ${tickFractions
                .map(
                  (fraction) => `<span class="graph-grid-line" style="bottom:${fraction * 100}%"></span>`,
                )
                .join("")}
            </div>
            ${groups}
          </div>
        </div>
      </div>
    </section>
  `;
}

function roundUpDurationMillis(durationMillis) {
  const stepMinutes = durationMillis <= 30 * 60000 ? 5 : durationMillis <= 2 * 60 * 60000 ? 15 : 30;
  const stepMillis = stepMinutes * 60000;
  return Math.max(stepMillis, Math.ceil(durationMillis / stepMillis) * stepMillis);
}
