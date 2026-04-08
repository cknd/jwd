import { DAY_TYPES, PRESET_KINDS, TRAVEL_MODES } from "./constants.js";
import { escapeHtml, formatTimestamp, titleCase } from "./utils.js";

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

  elements.comparisonSubtitle.textContent = `${homeCount} homes • ${destinationCount} destinations • ${titleCase(boardState.selectedMode.toLowerCase())}`;
  elements.computedAtValue.textContent = snapshot.computedAt ? formatTimestamp(snapshot.computedAt) : "Not yet computed";
  elements.comparisonStatus.textContent =
    homeCount === 0 && destinationCount === 0
      ? "Start by adding a home row or a destination column."
      : homeCount === 0
        ? "Add at least one home row to compare travel times."
        : destinationCount === 0
          ? "Add at least one destination column to compare travel times."
          : "";

  elements.comparisonTableContainer.innerHTML = buildTableMarkup(boardState, destinationColumns, highlightedCell);

  bindTableInteractions(elements.comparisonTableContainer, handlers);
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
      rowLabel: `${group.label} #${index + 1}`,
      rowSubtitle: `Nearest ${group.primaryType.replaceAll("_", " ")}`,
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

  container.querySelectorAll("[data-highlight-home-id]").forEach((button) => {
    button.addEventListener("click", () => handlers.onHighlightHome(button.getAttribute("data-highlight-home-id")));
  });

  container.querySelectorAll("[data-open-home-dialog]").forEach((button) => {
    button.addEventListener("click", handlers.onOpenHomeDialog);
  });

  container.querySelectorAll("[data-open-destination-dialog]").forEach((button) => {
    button.addEventListener("click", handlers.onOpenDestinationDialog);
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
        <th scope="col">
          <span class="table-axis-label">${column.kind === "DYNAMIC" ? "Dynamic" : "Destination"}</span>
          <div class="table-heading-title">${buildLabelPill(column.rowLabel, column.kind === "DYNAMIC" ? "dynamic" : "destination")}</div>
          <div class="table-heading-subtitle">${escapeHtml(column.rowSubtitle || "")}</div>
          <div class="table-heading-actions">
            <button class="table-mini-button" type="button" data-remove-destination-id="${escapeHtml(removeId)}" data-destination-kind="${removeKind}">Remove</button>
          </div>
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
                      <div class="cell-duration">${escapeHtml(cell?.formattedDuration || "Unavailable")}</div>
                      <div class="cell-distance">${escapeHtml(cell?.formattedDistance || "Unavailable")}</div>
                      <div class="cell-detail">${buildLabelPill(cell?.destinationLabel || column.rowLabel, column.kind === "DYNAMIC" ? "dynamic" : "destination")}</div>
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
            <span class="table-axis-label">Home</span>
            <div class="table-heading-title">${buildLabelPill(home.location.label, "home")}</div>
            <div class="table-heading-subtitle">${escapeHtml(home.location.address || "")}</div>
            <div class="table-heading-actions">
              <button class="table-mini-button" type="button" data-highlight-home-id="${escapeHtml(home.id)}">Show on map</button>
              <button class="table-mini-button" type="button" data-remove-home-id="${escapeHtml(home.id)}">Remove</button>
            </div>
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
          <th scope="col" class="comparison-row-header">
            <span class="table-axis-label">Homes</span>
            <div class="table-heading-title">Candidate homes</div>
            <div class="table-heading-subtitle">Each row is one home. Click a value cell to inspect it on the map.</div>
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
