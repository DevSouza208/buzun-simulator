/**
 * Visual-only vehicle scaling: OSM street coordinates and driving physics
 * remain in world metres. The low-poly hatchback's box+mirror dimensions
 * before scaling are approximately 2.38 m wide x 4.56 m long.
 */
export const PASSENGER_CAR_VISUAL_SCALE = 0.78;
export const BASE_CAR_WIDTH_METRES = 2.38;
export const BASE_CAR_LENGTH_METRES = 4.56;
export function displayedCarDimensions(scale=PASSENGER_CAR_VISUAL_SCALE) {
  return {width:BASE_CAR_WIDTH_METRES*scale,
    length:BASE_CAR_LENGTH_METRES*scale};
}
