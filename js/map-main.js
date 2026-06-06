import { appState } from "./map-state.js";
import { loadNeighborhoods, loadListings } from "./map-data.js";
import {
  getFilteredListings,
  renderNeighborhoods,
  renderListings,
  renderPriceOverlay,
  renderSidePanel,
  setPriceOverlayVisible,
} from "./map-render.js";
import {
  bindNeighborhoodEvents,
  bindListingCardEvents,
  bindListingMarkerEvents,
  clearNeighborhoodSelection,
} from "./map-interactions.js";

/** Show a user-visible error message. */
function showError(message) {
  const errorEl = document.getElementById("map-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
}

/** Parse a numeric filter input value, returning null when empty. */
function parseFilterValue(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Read filter inputs and store values in app state. */
function applyFiltersFromInputs() {
  appState.filters.minPrice = parseFilterValue(
    document.getElementById("filter-min-price")?.value
  );
  appState.filters.maxPrice = parseFilterValue(
    document.getElementById("filter-max-price")?.value
  );
  appState.filters.minBeds = parseFilterValue(
    document.getElementById("filter-min-beds")?.value
  );
}

/** Re-render markers, overlay, and panel after filter changes. */
function refreshFilteredView() {
  applyFiltersFromInputs();
  renderPriceOverlay(appState.map, getFilteredListings());
  renderListings(appState.map, bindListingMarkerEvents);
  renderSidePanel();
}

/** Reset all filter inputs and refresh the view. */
function clearFilters() {
  const minPrice = document.getElementById("filter-min-price");
  const maxPrice = document.getElementById("filter-max-price");
  const minBeds = document.getElementById("filter-min-beds");

  if (minPrice) minPrice.value = "";
  if (maxPrice) maxPrice.value = "";
  if (minBeds) minBeds.value = "";

  appState.filters = { minPrice: null, maxPrice: null, minBeds: null };
  renderPriceOverlay(appState.map, getFilteredListings());
  renderListings(appState.map, bindListingMarkerEvents);
  renderSidePanel();
}

/** Add a map control to toggle the price overlay on and off. */
function addPriceOverlayControl(map) {
  const control = L.control({ position: "topright" });

  control.onAdd = () => {
    const container = L.DomUtil.create("div", "leaflet-bar map-price-control");
    container.innerHTML = `
      <label class="map-price-control__label">
        <input
          class="map-price-control__input"
          type="checkbox"
          id="toggle-price-overlay"
          ${appState.priceOverlayVisible ? "checked" : ""}
        >
        Price overlay
      </label>
    `;

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    const checkbox = container.querySelector("#toggle-price-overlay");
    checkbox?.addEventListener("change", (event) => {
      setPriceOverlayVisible(map, event.target.checked);
    });

    return container;
  };

  control.addTo(map);
}

/** Attach UI event listeners for filters and neighborhood reset. */
function bindUiEvents() {
  document.getElementById("clear-neighborhood")?.addEventListener("click", clearNeighborhoodSelection);
  document.getElementById("clear-filters")?.addEventListener("click", clearFilters);

  ["filter-min-price", "filter-max-price", "filter-min-beds"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", refreshFilteredView);
  });

  const cardsEl = document.getElementById("listing-cards");
  if (cardsEl) {
    bindListingCardEvents(cardsEl);
  }
}

/** Initialize the Leaflet map and load all data layers. */
async function init() {
  appState.map = L.map("map", {
    center: [40.4406, -79.9959],
    zoom: 12,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  }).addTo(appState.map);

  try {
    const [geojson, listings] = await Promise.all([loadNeighborhoods(), loadListings()]);
    appState.listings = listings;

    renderPriceOverlay(appState.map, getFilteredListings());
    renderNeighborhoods(appState.map, geojson, bindNeighborhoodEvents);
    renderListings(appState.map, bindListingMarkerEvents);
    renderSidePanel();
    addPriceOverlayControl(appState.map);
    bindUiEvents();
  } catch (error) {
    console.error(error);
    showError("Could not load map data. Please refresh the page.");
    const cardsEl = document.getElementById("listing-cards");
    if (cardsEl) {
      cardsEl.innerHTML = `<p class="listing-cards__empty">Unable to load listings.</p>`;
    }
  }
}

init();
