export const STORAGE_KEYS = {
  boardState: "jwd.boardState.v1",
  runtimeConfig: "jwd.runtimeConfig.v1",
  routeCache: "jwd.routeCache.v1",
  nearbyCache: "jwd.nearbyCache.v1",
};

export const SHARE_LENGTH_WARNING = 6000;
export const SHARE_LENGTH_LIMIT = 8000;

export const TRAVEL_MODES = [
  { value: "DRIVING", label: "🚗 Car" },
  { value: "TRANSIT", label: "🚆 Public Transit" },
  { value: "BICYCLING", label: "🚲 Bike" },
  { value: "WALKING", label: "🚶 Walk" },
];

export const DAY_TYPES = [
  { value: "WEEKDAY", label: "Weekday" },
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
];

export const ROUTE_DIRECTIONS = [
  { value: "HOME_TO_DESTINATIONS", label: "Location ➡️ Points of Interest" },
  { value: "DESTINATIONS_TO_HOME", label: "Location ⬅️ Points of Interest" },
];

export const MAP_ADD_MODES = {
  NONE: "NONE",
  HOME: "HOME",
  DESTINATION: "DESTINATION",
};

export const DEFAULT_CENTER = { lat: 52.52, lng: 13.405 };

export const GOOGLE_REQUIRED_LIBRARIES = ["maps", "marker", "places", "routes", "geocoding"];

export const HOME_COLOR_PALETTE = [
  { fill: "#cfe1f2", border: "#4e79a7", ink: "#274c73", bar: "#4e79a7" },
  { fill: "#f6d9cf", border: "#e15759", ink: "#8d3436", bar: "#e15759" },
  { fill: "#d7ead4", border: "#59a14f", ink: "#2f6128", bar: "#59a14f" },
  { fill: "#f7e4c8", border: "#f28e2b", ink: "#8d5319", bar: "#f28e2b" },
  { fill: "#e0d9f1", border: "#b07aa1", ink: "#68455f", bar: "#b07aa1" },
  { fill: "#d1ecef", border: "#76b7b2", ink: "#336c67", bar: "#76b7b2" },
  { fill: "#f6dbbf", border: "#edc948", ink: "#7a6318", bar: "#edc948" },
  { fill: "#ecd7d1", border: "#9c755f", ink: "#5c4235", bar: "#9c755f" },
  { fill: "#f0d7dd", border: "#ff9da7", ink: "#8b4c54", bar: "#ff9da7" },
  { fill: "#e1e1e1", border: "#bab0ab", ink: "#5f5854", bar: "#bab0ab" },
];

export const SUPPORTED_DYNAMIC_PRIMARY_TYPES = [
  "supermarket",
  "restaurant",
  "primary_school",
  "secondary_school",
  "train_station",
  "subway_station",
  "park",
  "pharmacy",
  "gym",
];

export const DYNAMIC_PRIMARY_TYPE_ALIASES = {
  supermarkt: "supermarket",
  supermarkte: "supermarket",
  supermarkets: "supermarket",
  grocery: "supermarket",
  groceries: "supermarket",
  lebensmittel: "supermarket",
  lebensmittelladen: "supermarket",
  restauranten: "restaurant",
  restaurants: "restaurant",
  cafe: "restaurant",
  cafes: "restaurant",
  bahnhof: "train_station",
  train: "train_station",
  trainstation: "train_station",
  ubahn: "subway_station",
  u_bahn: "subway_station",
  subway: "subway_station",
  metro: "subway_station",
  apotheke: "pharmacy",
  apotheken: "pharmacy",
  pharmacys: "pharmacy",
  fitnessstudio: "gym",
  fitnessstudios: "gym",
  gyms: "gym",
  parks: "park",
};
