export const STORAGE_KEYS = {
  boardState: "jwd.boardState.v1",
  runtimeConfig: "jwd.runtimeConfig.v1",
  routeCache: "jwd.routeCache.v1",
  nearbyCache: "jwd.nearbyCache.v1",
};

export const SHARE_LENGTH_WARNING = 6000;
export const SHARE_LENGTH_LIMIT = 8000;

export const TRAVEL_MODES = [
  { value: "DRIVING", label: "Car" },
  { value: "TRANSIT", label: "Public Transit" },
  { value: "BICYCLING", label: "Bike" },
  { value: "WALKING", label: "Walk" },
];

export const DAY_TYPES = [
  { value: "WEEKDAY", label: "Weekday" },
  { value: "SATURDAY", label: "Saturday" },
  { value: "SUNDAY", label: "Sunday" },
];

export const ROUTE_DIRECTIONS = [
  { value: "HOME_TO_DESTINATIONS", label: "Place -> destinations" },
  { value: "DESTINATIONS_TO_HOME", label: "Destinations -> place" },
];

export const MAP_ADD_MODES = {
  NONE: "NONE",
  HOME: "HOME",
  DESTINATION: "DESTINATION",
};

export const DEFAULT_CENTER = { lat: 52.52, lng: 13.405 };

export const GOOGLE_REQUIRED_LIBRARIES = ["maps", "marker", "places", "routes", "geocoding"];

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
