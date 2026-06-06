const NEIGHBORHOOD_NAME_KEYS = ["hood", "neighborhood", "name", "NAME", "Neighborhood"];

/** Resolve the neighborhood label from a GeoJSON feature's properties. */
export function getNeighborhoodName(feature) {
  const props = feature?.properties ?? {};
  const name = NEIGHBORHOOD_NAME_KEYS.map((key) => props[key]).find(
    (value) => typeof value === "string" && value.trim().length > 0
  );
  return name?.trim() ?? "Unknown";
}

/** Load Pittsburgh neighborhood polygon boundaries. */
export async function loadNeighborhoods() {
  const response = await fetch("/data/pittsburgh-neighborhoods.geojson");
  if (!response.ok) {
    throw new Error(`Failed to load neighborhoods (${response.status})`);
  }
  return response.json();
}

/** Load listing records with pre-set coordinates. */
export async function loadListings() {
  const response = await fetch("/data/listings.json");
  if (!response.ok) {
    throw new Error(`Failed to load listings (${response.status})`);
  }
  return response.json();
}
