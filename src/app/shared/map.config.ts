import type { StyleSpecification } from 'maplibre-gl';

/**
 * Shared MapLibre configuration used across map components.
 * Uses OpenStreetMap raster tiles – no API key required.
 */
export const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'osm-tiles': {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm-tiles',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283]; // center of US
export const DEFAULT_ZOOM = 4;
