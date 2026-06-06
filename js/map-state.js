/** Shared application state for the Pittsburgh map page. */
export const appState = {
  map: null,
  neighborhoodLayer: null,
  listingsLayer: null,
  neighborhoods: [],
  listings: [],
  selectedNeighborhood: null,
  selectedListingId: null,
  selectedNeighborhoodLayer: null,
  listingMarkers: new Map(),
  filters: {
    minPrice: null,
    maxPrice: null,
    minBeds: null,
  },
  priceOverlayLayer: null,
  priceOverlayVisible: true,
  priceOverlayCache: null,
};
