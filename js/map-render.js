import { appState } from "./map-state.js";
import { getNeighborhoodName } from "./map-data.js";
import {
  buildPriceGrid,
  buildPriceQuantileScale,
  boundsToLeaflet,
  priceGridToCanvas,
  priceToQuantileColor,
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

/** Build the fixed decile scale once from all listings so filter changes keep colors stable. */
export function ensurePriceQuantileScale() {
  if (appState.priceQuantileScale || !appState.listings.length) return;

  appState.priceQuantileScale = buildPriceQuantileScale(appState.listings);
  renderPriceLegend(appState.map);
}

/** Format a decile bin's price range for the legend. */
function formatBinRange(bin) {
  if (bin.min === bin.max) return formatPrice(bin.min);
  return `${formatPrice(bin.min)} – ${formatPrice(bin.max)}`;
}

/** Parse a quantile rgba() string into marker stroke/fill colors. */
function markerColorsFromQuantileColor(rgba) {
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

/** Add or refresh the decile price legend on the map. */
export function renderPriceLegend(map) {
  if (!map || !appState.priceQuantileScale) return;

  if (appState.priceLegendControl) {
    map.removeControl(appState.priceLegendControl);
    appState.priceLegendControl = null;
  }

  const { bins } = appState.priceQuantileScale;
  const rows = [...bins]
    .reverse()
    .map(
      (bin) => `
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
          <span
            style="display:inline-block;width:1rem;height:1rem;border-radius:2px;background:${bin.color};border:1px solid rgba(0,0,0,0.15);flex-shrink:0;"
            aria-hidden="true"
          ></span>
          <span style="font-size:0.75rem;line-height:1.3;color:var(--text,#1f2937);">
            D${bin.index}: ${formatBinRange(bin)}
          </span>
        </div>
      `
    )
    .join("");

  const control = L.control({ position: "bottomleft" });

  control.onAdd = () => {
    const container = L.DomUtil.create("div", "map-price-legend");
    container.style.cssText =
      "background:var(--panel-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:6px;box-shadow:0 1px 4px rgba(0,0,0,0.12);padding:0.6rem 0.75rem;max-width:14rem;";
    container.innerHTML = `
      <div style="font-size:0.8rem;font-weight:600;margin-bottom:0.45rem;color:var(--text,#1f2937);">
        Price deciles
      </div>
      ${rows}
    `;
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    return container;
  };

  control.addTo(map);
  appState.priceLegendControl = control;
}

/** Apply neighborhood polygon styles across the layer group. */
export function resetNeighborhoodStyles() {
  if (!appState.neighborhoodLayer) return;

  appState.neighborhoodLayer.eachLayer((layer) => {
    const isSelected = layer === appState.selectedNeighborhoodLayer;
    layer.setStyle(isSelected ? neighborhoodStyles.selected : neighborhoodStyles.default);
  });
}

/** Return listings matching price/bed filters (ignores neighborhood selection). */
export function getMapListings(state = appState) {
  return state.listings.filter((listing) => {
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

/** Return listings for the side panel (neighborhood + price/bed filters). */
export function getFilteredListings(state = appState) {
  return getMapListings(state).filter((listing) => {
    if (state.selectedNeighborhood && listing.neighborhood !== state.selectedNeighborhood) {
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
    opacity: 1.0,
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
  ensurePriceQuantileScale();

  if (!listings.length || !appState.priceQuantileScale) return;

  const grid = buildPriceGrid(listings);
  const canvas = priceGridToCanvas(grid, appState.priceQuantileScale);
  const bounds = boundsToLeaflet(grid.bounds);

  appState.priceOverlayCache = {
    imageUrl: canvas.toDataURL(),
    bounds,
  };

  if (appState.priceOverlayVisible) {
    setPriceOverlayVisible(map, true);
  }
}

/** Render listing markers for the map (price/bed filters only; not neighborhood). */
export function renderListings(map, onMarkerCreated) {
  if (appState.listingsLayer) {
    map.removeLayer(appState.listingsLayer);
  }

  appState.listingMarkers.clear();
  ensurePriceQuantileScale();
  const mapListings = getMapListings();
  const scale = appState.priceQuantileScale;

  appState.listingsLayer = L.layerGroup();

  mapListings.forEach((listing) => {
    const colors = scale
      ? markerColorsFromQuantileColor(priceToQuantileColor(listing.price, scale))
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
