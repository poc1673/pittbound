import { appState } from "./map-state.js";
import { getNeighborhoodName } from "./map-data.js";
import {
  buildPriceGrid,
  boundsToLeaflet,
  getGridPriceRange,
  getPriceRange,
  priceGridToCanvas,
  priceToColor,
} from "./map-price.js";

export const neighborhoodStyles = {
  default: {
    color: "#6b7280",
    weight: 1,
    fillColor: "#3b82f6",
    fillOpacity: 0.08,
  },
  hover: {
    color: "#2563eb",
    weight: 2,
    fillColor: "#3b82f6",
    fillOpacity: 0.18,
  },
  selected: {
    color: "#1d4ed8",
    weight: 3,
    fillColor: "#2563eb",
    fillOpacity: 0.3,
  },
};

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Format a listing price for display. */
export function formatPrice(value) {
  return priceFormatter.format(value);
}

/** Apply neighborhood polygon styles across the layer group. */
export function resetNeighborhoodStyles() {
  if (!appState.neighborhoodLayer) return;

  appState.neighborhoodLayer.eachLayer((layer) => {
    const isSelected = layer === appState.selectedNeighborhoodLayer;
    layer.setStyle(isSelected ? neighborhoodStyles.selected : neighborhoodStyles.default);
  });
}

/** Return listings filtered by neighborhood selection and price/bed filters. */
export function getFilteredListings(state = appState) {
  return state.listings.filter((listing) => {
    if (state.selectedNeighborhood && listing.neighborhood !== state.selectedNeighborhood) {
      return false;
    }
    if (state.filters.minPrice != null && listing.price < state.filters.minPrice) {
      return false;
    }
    if (state.filters.maxPrice != null && listing.price > state.filters.maxPrice) {
      return false;
    }
    if (state.filters.minBeds != null && listing.beds < state.filters.minBeds) {
      return false;
    }
    return true;
  });
}

/** Render neighborhood polygons on the map. */
export function renderNeighborhoods(map, geojson, onEachFeature) {
  if (appState.neighborhoodLayer) {
    map.removeLayer(appState.neighborhoodLayer);
  }

  appState.neighborhoods = geojson.features
    .map(getNeighborhoodName)
    .filter((name) => name !== "Unknown")
    .sort((a, b) => a.localeCompare(b));

  appState.neighborhoodLayer = L.geoJSON(geojson, {
    style: () => neighborhoodStyles.default,
    onEachFeature,
  }).addTo(map);
}

/** Build popup HTML for a listing marker. */
export function buildListingPopupHtml(listing) {
  const image = listing.imageUrls?.[0]
    ? `<img class="listing-popup__image" src="${listing.imageUrls[0]}" alt="Photo of ${listing.address}" loading="lazy">`
    : "";

  return `
    <div class="listing-popup">
      ${image}
      <div class="listing-popup__price">${formatPrice(listing.price)}</div>
      <div class="listing-popup__address">${listing.address}</div>
      <div class="listing-popup__details">${listing.beds} bd · ${listing.baths} ba · ${listing.sqft.toLocaleString()} sqft</div>
    </div>
  `;
}

/** Remove the price overlay layer from the map if present. */
function removePriceOverlayLayer(map) {
  if (appState.priceOverlayLayer) {
    map.removeLayer(appState.priceOverlayLayer);
    appState.priceOverlayLayer = null;
  }
}

/** Add the cached price overlay layer to the map when visible. */
export function setPriceOverlayVisible(map, visible) {
  appState.priceOverlayVisible = visible;
  removePriceOverlayLayer(map);

  if (!visible || !appState.priceOverlayCache) return;

  const { imageUrl, bounds } = appState.priceOverlayCache;
  appState.priceOverlayLayer = L.imageOverlay(imageUrl, bounds, {
    opacity: 0.55,
    interactive: false,
  }).addTo(map);

  appState.priceOverlayLayer.bringToBack();
  appState.neighborhoodLayer?.bringToFront();
  appState.listingsLayer?.bringToFront();
}

/** Build or refresh the price overlay from the current listing set. */
export function renderPriceOverlay(map, listings) {
  removePriceOverlayLayer(map);
  appState.priceOverlayCache = null;

  const priceRange = getPriceRange(listings);
  if (!priceRange) return;

  const grid = buildPriceGrid(listings);
  const gridRange = getGridPriceRange(grid);
  if (!gridRange) return;

  const canvas = priceGridToCanvas(grid, gridRange.min, gridRange.max);
  const bounds = boundsToLeaflet(grid.bounds);

  appState.priceOverlayCache = {
    imageUrl: canvas.toDataURL(),
    bounds,
  };

  if (appState.priceOverlayVisible) {
    setPriceOverlayVisible(map, true);
  }
}

/** Parse an rgba() string into marker stroke/fill colors. */
function markerColorsFromPrice(price, min, max) {
  const rgba = priceToColor(price, min, max);
  const match = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);

  if (!match) {
    return { color: "#1d4ed8", fillColor: "#2563eb" };
  }

  const r = match[1];
  const g = match[2];
  const b = match[3];
  return {
    color: `rgb(${r}, ${g}, ${b})`,
    fillColor: `rgb(${r}, ${g}, ${b})`,
  };
}

/** Render listing markers for the current filtered set. */
export function renderListings(map, onMarkerCreated) {
  if (appState.listingsLayer) {
    map.removeLayer(appState.listingsLayer);
  }

  appState.listingMarkers.clear();
  const filtered = getFilteredListings();
  const priceRange = getPriceRange(filtered);

  appState.listingsLayer = L.layerGroup();

  filtered.forEach((listing) => {
    const colors = priceRange
      ? markerColorsFromPrice(listing.price, priceRange.min, priceRange.max)
      : { color: "#1d4ed8", fillColor: "#2563eb" };

    const marker = L.circleMarker([listing.lat, listing.lng], {
      radius: 7,
      color: colors.color,
      weight: 2,
      fillColor: colors.fillColor,
      fillOpacity: 0.85,
    });

    marker.bindPopup(buildListingPopupHtml(listing));
    onMarkerCreated?.(marker, listing);
    appState.listingMarkers.set(listing.id, marker);
    appState.listingsLayer.addLayer(marker);
  });

  appState.listingsLayer.addTo(map);
}

/** Build HTML for a single listing card. */
export function renderListingCard(listing, isSelected = false) {
  const imageUrl = listing.imageUrls?.[0] ?? "";
  const imageAlt = imageUrl ? `Photo of ${listing.address}` : "";
  const image = imageUrl
    ? `<img class="listing-card__image" src="${imageUrl}" alt="${imageAlt}" loading="lazy">`
    : `<div class="listing-card__image" aria-hidden="true"></div>`;

  const tags = (listing.tags ?? [])
    .map((tag) => `<span class="listing-card__tag">${tag}</span>`)
    .join("");

  const link = listing.sourceUrl
    ? `<a class="listing-card__link" href="${listing.sourceUrl}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">View listing</a>`
    : "";

  return `
    <article
      class="listing-card${isSelected ? " is-selected" : ""}"
      data-listing-id="${listing.id}"
      tabindex="0"
      role="button"
      aria-pressed="${isSelected}"
      aria-label="${formatPrice(listing.price)}, ${listing.address}"
    >
      ${image}
      <div class="listing-card__body">
        <div class="listing-card__price">${formatPrice(listing.price)}</div>
        <div class="listing-card__address">${listing.address}</div>
        <div class="listing-card__details">${listing.beds} bd · ${listing.baths} ba · ${listing.sqft.toLocaleString()} sqft</div>
        <p class="listing-card__summary">${listing.summary}</p>
        <div class="listing-card__tags">${tags}</div>
        ${link}
      </div>
    </article>
  `;
}

/** Update the side panel header and listing cards. */
export function renderSidePanel(state = appState) {
  const neighborhoodEl = document.getElementById("panel-neighborhood");
  const countEl = document.getElementById("panel-count");
  const cardsEl = document.getElementById("listing-cards");

  if (!neighborhoodEl || !countEl || !cardsEl) return;

  const filtered = getFilteredListings(state);

  neighborhoodEl.textContent = state.selectedNeighborhood ?? "All neighborhoods";
  countEl.textContent = `${filtered.length} listing${filtered.length === 1 ? "" : "s"}`;

  if (filtered.length === 0) {
    cardsEl.innerHTML = `<p class="listing-cards__empty">No listings match your filters.</p>`;
    return;
  }

  cardsEl.innerHTML = filtered
    .map((listing) => renderListingCard(listing, listing.id === state.selectedListingId))
    .join("");
}
