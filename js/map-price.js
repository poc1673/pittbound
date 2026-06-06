const EARTH_RADIUS_KM = 6371;
const EXACT_MATCH_KM = 0.01;
const DEFAULT_IDW_POWER = 3;
const MAX_IDW_DISTANCE_KM = 4;
const MAX_IDW_NEIGHBORS = 8;

const GRID_COLS = 32;
const GRID_ROWS = 24;
const CANVAS_COLS = 512;
const CANVAS_ROWS = 384;
const OVERLAY_ALPHA = 1;

const LOW_COLOR = { r: 30, g: 58, b: 138 };
const HIGH_COLOR = { r: 220, g: 38, b: 38 };

const PITTSBURGH_BOUNDS = {
  south: 40.35,
  north: 40.52,
  west: -80.1,
  east: -79.85,
};

/** Return { min, max } price range or null when listings are empty. */
export function getPriceRange(listings) {
  if (!listings.length) return null;

  return listings.reduce(
    (range, listing) => ({
      min: Math.min(range.min, listing.price),
      max: Math.max(range.max, listing.price),
    }),
    { min: Infinity, max: -Infinity }
  );
}

/** Map a price to t in [0, 1] using the given range. */
export function normalizePrice(price, min, max) {
  if (max <= min) return 0.5;
  return Math.min(1, Math.max(0, (price - min) / (max - min)));
}

/** Interpolate RGB channels between deep blue (low) and red (high). */
export function priceToColor(price, min, max) {
  const t = normalizePrice(price, min, max);
  const r = Math.round(LOW_COLOR.r + (HIGH_COLOR.r - LOW_COLOR.r) * t);
  const g = Math.round(LOW_COLOR.g + (HIGH_COLOR.g - LOW_COLOR.g) * t);
  const b = Math.round(LOW_COLOR.b + (HIGH_COLOR.b - LOW_COLOR.b) * t);
  return `rgba(${r}, ${g}, ${b}, ${OVERLAY_ALPHA})`;
}

/** Haversine distance in kilometers between two lat/lng points. */
export function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimate price at a point using inverse-distance weighting from nearby nodes.
 * Uses only the closest neighbors within a distance cutoff for local variation.
 */
export function estimatePriceAt(lat, lng, nodes, options = {}) {
  const power = options.power ?? DEFAULT_IDW_POWER;
  const maxDistanceKm = options.maxDistanceKm ?? MAX_IDW_DISTANCE_KM;
  const maxNeighbors = options.maxNeighbors ?? MAX_IDW_NEIGHBORS;

  if (!nodes.length) return null;

  const sorted = nodes
    .map((node) => ({
      ...node,
      distance: haversineDistanceKm(lat, lng, node.lat, node.lng),
    }))
    .sort((a, b) => a.distance - b.distance);

  const withinRadius = sorted.filter((node) => node.distance <= maxDistanceKm);
  const neighbors = (withinRadius.length ? withinRadius : sorted).slice(0, maxNeighbors);

  for (const node of neighbors) {
    if (node.distance < EXACT_MATCH_KM) {
      return node.price;
    }
  }

  let weightSum = 0;
  let priceSum = 0;

  for (const node of neighbors) {
    const weight = 1 / node.distance ** power;
    weightSum += weight;
    priceSum += weight * node.price;
  }

  return priceSum / weightSum;
}

/** Build padded lat/lng bounds from listing coordinates. */
export function getListingBounds(listings, padding = 0.01) {
  if (!listings.length) {
    return { ...PITTSBURGH_BOUNDS };
  }

  const bounds = listings.reduce(
    (acc, listing) => ({
      south: Math.min(acc.south, listing.lat),
      north: Math.max(acc.north, listing.lat),
      west: Math.min(acc.west, listing.lng),
      east: Math.max(acc.east, listing.lng),
    }),
    {
      south: Infinity,
      north: -Infinity,
      west: Infinity,
      east: -Infinity,
    }
  );

  const latPad = (bounds.north - bounds.south) * padding || padding;
  const lngPad = (bounds.east - bounds.west) * padding || padding;

  return {
    south: bounds.south - latPad,
    north: bounds.north + latPad,
    west: bounds.west - lngPad,
    east: bounds.east + lngPad,
  };
}

/** Compute a coarse grid of interpolated prices over the given bounds. */
export function buildPriceGrid(listings, bounds = getListingBounds(listings)) {
  const nodes = listings.map(({ lat, lng, price }) => ({ lat, lng, price }));
  const cols = GRID_COLS;
  const rows = GRID_ROWS;
  const prices = new Float32Array(cols * rows);

  const latStep = (bounds.north - bounds.south) / (rows - 1 || 1);
  const lngStep = (bounds.east - bounds.west) / (cols - 1 || 1);

  for (let row = 0; row < rows; row += 1) {
    const lat = bounds.south + latStep * row;

    for (let col = 0; col < cols; col += 1) {
      const lng = bounds.west + lngStep * col;
      prices[row * cols + col] = estimatePriceAt(lat, lng, nodes);
    }
  }

  return { bounds, cols, rows, prices };
}

/** Return { min, max } from interpolated grid values for overlay coloring. */
export function getGridPriceRange(grid) {
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < grid.prices.length; i += 1) {
    const price = grid.prices[i];
    if (!Number.isFinite(price)) continue;
    min = Math.min(min, price);
    max = Math.max(max, price);
  }

  if (!Number.isFinite(min)) return null;
  return { min, max };
}

/** Rasterize a price grid to an upscaled canvas for use as a map overlay. */
export function priceGridToCanvas(grid, min, max) {
  const coarseCanvas = document.createElement("canvas");
  coarseCanvas.width = grid.cols;
  coarseCanvas.height = grid.rows;
  const coarseCtx = coarseCanvas.getContext("2d");
  const imageData = coarseCtx.createImageData(grid.cols, grid.rows);
  const { data } = imageData;

  for (let row = 0; row < grid.rows; row += 1) {
    const pixelRow = grid.rows - 1 - row;

    for (let col = 0; col < grid.cols; col += 1) {
      const price = grid.prices[row * grid.cols + col];
      const color = priceToColor(price, min, max);
      const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
      const offset = (pixelRow * grid.cols + col) * 4;

      if (match) {
        data[offset] = Number(match[1]);
        data[offset + 1] = Number(match[2]);
        data[offset + 2] = Number(match[3]);
        data[offset + 3] = Math.round(Number(match[4]) * 255);
      }
    }
  }

  coarseCtx.putImageData(imageData, 0, 0);

  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_COLS;
  canvas.height = CANVAS_ROWS;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(coarseCanvas, 0, 0, CANVAS_COLS, CANVAS_ROWS);

  const cellWidth = CANVAS_COLS / grid.cols;
  const cellHeight = CANVAS_ROWS / grid.rows;
  
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  
  for (let col = 0; col <= grid.cols; col += 1) {
    const x = col * cellWidth + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_ROWS);
    ctx.stroke();
  }
  
  for (let row = 0; row <= grid.rows; row += 1) {
    const y = row * cellHeight + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_COLS, y);
    ctx.stroke();
  }

  return canvas;
}

/** Leaflet lat/lng bounds array [[south, west], [north, east]]. */
export function boundsToLeaflet(bounds) {
  return [
    [bounds.south, bounds.west],
    [bounds.north, bounds.east],
  ];
}
