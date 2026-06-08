import { appState } from "./map-state.js";
import {
  getMapListings,
  neighborhoodStyles,
  renderListings,
  renderPriceOverlay,
  renderSidePanel,
  resetNeighborhoodStyles,
} from "./map-render.js";
import { getNeighborhoodName } from "./map-data.js";

/** Wire hover and click handlers for a neighborhood polygon. */
export function bindNeighborhoodEvents(feature, layer) {
  const name = getNeighborhoodName(feature);

  layer.on("mouseover", () => {
    if (layer !== appState.selectedNeighborhoodLayer) {
      layer.setStyle(neighborhoodStyles.hover);
    }
  });

  layer.on("mouseout", () => {
    if (layer !== appState.selectedNeighborhoodLayer) {
      layer.setStyle(neighborhoodStyles.default);
    }
  });

  layer.on("click", () => selectNeighborhood(name, layer));
}

/** Select a neighborhood, zoom to it, and filter the side panel only. */
export function selectNeighborhood(neighborhoodName, layer) {
  appState.selectedNeighborhood = neighborhoodName;
  appState.selectedNeighborhoodLayer = layer;
  appState.selectedListingId = null;

  resetNeighborhoodStyles();
  appState.map.fitBounds(layer.getBounds(), { padding: [20, 20] });

  renderPriceOverlay(appState.map, getMapListings());
  renderListings(appState.map, bindListingMarkerEvents);
  renderSidePanel();
}

/** Clear neighborhood selection and show all filtered listings. */
export function clearNeighborhoodSelection() {
  appState.selectedNeighborhood = null;
  appState.selectedNeighborhoodLayer = null;
  appState.selectedListingId = null;

  resetNeighborhoodStyles();
  appState.map.setView([40.4406, -79.9959], 12);

  renderPriceOverlay(appState.map, getMapListings());
  renderListings(appState.map, bindListingMarkerEvents);
  renderSidePanel();
}

/** Wire popup and selection behavior for a listing marker. */
export function bindListingMarkerEvents(marker, listing) {
  marker.on("click", () => selectListing(listing.id));
}

/** Highlight a listing in the side panel and scroll it into view. */
export function selectListing(listingId) {
  appState.selectedListingId = listingId;
  renderSidePanel();

  const card = document.querySelector(`[data-listing-id="${listingId}"]`);
  if (card) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "nearest" });
  }

  const marker = appState.listingMarkers.get(listingId);
  if (marker) {
    marker.openPopup();
  }
}

/** Delegate click and keyboard events on listing cards. */
export function bindListingCardEvents(container) {
  container.addEventListener("click", (event) => {
    const card = event.target.closest("[data-listing-id]");
    if (!card) return;
    selectListing(card.dataset.listingId);
  });

  container.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const card = event.target.closest("[data-listing-id]");
    if (!card) return;
    event.preventDefault();
    selectListing(card.dataset.listingId);
  });
}
