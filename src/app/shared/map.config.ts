import type { StyleSpecification } from 'maplibre-gl';

export type MapStyleKey = 'regular' | 'topo' | 'satellite';

/**
 * Shared MapLibre style presets.
 */
export const MAP_STYLES: Record<MapStyleKey, StyleSpecification> = {
  regular: {
    version: 8,
    sources: {
      'regular-tiles': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [
      {
        id: 'regular-tiles',
        type: 'raster',
        source: 'regular-tiles',
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
  topo: {
    version: 8,
    sources: {
      'topo-tiles': {
        type: 'raster',
        tiles: ['https://tile.opentopomap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        attribution:
          'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
      },
    },
    layers: [
      {
        id: 'topo-tiles',
        type: 'raster',
        source: 'topo-tiles',
        minzoom: 0,
        maxzoom: 17,
      },
    ],
  },
  satellite: {
    version: 8,
    sources: {
      'satellite-tiles': {
        type: 'raster',
        tiles: [
          'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        attribution: 'Tiles &copy; Esri',
      },
    },
    layers: [
      {
        id: 'satellite-tiles',
        type: 'raster',
        source: 'satellite-tiles',
        minzoom: 0,
        maxzoom: 19,
      },
    ],
  },
};

export const DEFAULT_MAP_STYLE: MapStyleKey = 'satellite';

export const DEFAULT_CENTER: [number, number] = [-98.5795, 39.8283]; // center of US
export const DEFAULT_ZOOM = 4;