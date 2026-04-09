export const STORAGE_KEYS = {
  boardState: "jwd.boardState.v1",
  runtimeConfig: "jwd.runtimeConfig.v1",
  routeCache: "jwd.routeCache.v1",
  nearbyCache: "jwd.nearbyCache.v1",
};

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
  { fill: "#c4ddf4", border: "#4e79a7", ink: "#23486f", bar: "#4e79a7" },
  { fill: "#f5cfd0", border: "#e15759", ink: "#8a2f33", bar: "#e15759" },
  { fill: "#d0e8ca", border: "#59a14f", ink: "#2a5d23", bar: "#59a14f" },
  { fill: "#f7ddb6", border: "#f28e2b", ink: "#875016", bar: "#f28e2b" },
  { fill: "#ddd1ef", border: "#b07aa1", ink: "#62405b", bar: "#b07aa1" },
  { fill: "#c8e7e4", border: "#76b7b2", ink: "#2e6661", bar: "#76b7b2" },
  { fill: "#f3e09e", border: "#edc948", ink: "#776012", bar: "#edc948" },
  { fill: "#e6d0c2", border: "#9c755f", ink: "#563d31", bar: "#9c755f" },
  { fill: "#f2cdd8", border: "#ff9da7", ink: "#874853", bar: "#ff9da7" },
  { fill: "#d6d6d6", border: "#bab0ab", ink: "#56504d", bar: "#bab0ab" },
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
