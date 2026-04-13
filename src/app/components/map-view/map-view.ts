import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  effect,
  inject,
  ElementRef,
  viewChild,
  afterNextRender,
  OnDestroy,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Map, Marker, Popup, LngLatBounds, GeoJSONSource } from 'maplibre-gl';
import { SightingService } from '../../services/sighting.service';
import { Sighting } from '../../models/sighting.model';
import {
  MAP_STYLES,
  DEFAULT_MAP_STYLE,
  type MapStyleKey,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from '../../shared/map.config';

@Component({
  selector: 'app-map-view',
  imports: [RouterLink],
  templateUrl: './map-view.html',
  styleUrl: './map-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapViewComponent implements OnDestroy {
  private readonly sightingService = inject(SightingService);
  private readonly router = inject(Router);

  private map: Map | null = null;
  private markers: Marker[] = [];
  private activePopup: Popup | null = null;
  private readonly mapReady = signal(false);

  private readonly HEATMAP_SOURCE = 'sightings-heatmap';
  private readonly HEATMAP_LAYER = 'sightings-heat';

  protected readonly heatmapMode = signal(false);
  protected readonly mapStyle = signal<MapStyleKey>(DEFAULT_MAP_STYLE);

  protected readonly loading = signal(true);
  protected readonly searchTerm = signal('');
  protected readonly sightings = signal<Sighting[]>([]);
  protected readonly filteredSightings = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const allSightings = this.sightings();

    if (!query) {
      return allSightings;
    }

    return allSightings.filter((sighting) => {
      const species = sighting.species.toLowerCase();
      const description = sighting.description?.toLowerCase() ?? '';
      const date = (sighting.sighting_date ?? '').toLowerCase();
      return species.includes(query) || description.includes(query) || date.includes(query);
    });
  });
  protected readonly resultCount = computed(() => this.filteredSightings().length);

  readonly mapContainer = viewChild.required<ElementRef>('mapContainer');

  constructor() {
    effect(() => {
      if (!this.mapReady()) {
        return;
      }

      const sightings = this.filteredSightings();
      if (this.heatmapMode()) {
        this.markers.forEach((m) => m.remove());
        this.markers = [];
        this.updateHeatmap(sightings);
      } else {
        this.removeHeatmap();
        this.addMarkers(sightings);
      }
    });

    effect(() => {
      if (!this.mapReady() || !this.map) {
        return;
      }

      const style = MAP_STYLES[this.mapStyle()];
      this.map.setStyle(style);

      this.map.once('style.load', () => {
        if (this.heatmapMode()) {
          this.updateHeatmap(this.filteredSightings());
        } else {
          this.addMarkers(this.filteredSightings());
        }
      });
    });

    afterNextRender(() => {
      this.initMap();
      this.loadSightings();
    });
  }

  ngOnDestroy(): void {
    this.activePopup?.remove();
    this.map?.remove();
  }

  private registerPopup(popup: Popup): Popup {
    popup.on('open', () => {
      if (this.activePopup && this.activePopup !== popup) {
        this.activePopup.remove();
      }

      this.activePopup = popup;
    });

    popup.on('close', () => {
      if (this.activePopup === popup) {
        this.activePopup = null;
      }
    });

    return popup;
  }

  private initMap(): void {
    this.map = new Map({
      container: this.mapContainer().nativeElement,
      style: MAP_STYLES[this.mapStyle()],
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    this.map.on('click', (event: { lngLat: { lng: number; lat: number } }) => {
      const { lng, lat } = event.lngLat;
      this.showAddSightingPopup(lng, lat);
    });

    this.mapReady.set(true);
  }

  private showAddSightingPopup(lng: number, lat: number): void {
    if (!this.map) return;

    const popupContent = document.createElement('div');
    popupContent.className = 'sighting-popup';

    const title = document.createElement('strong');
    title.textContent = 'Add a sighting here?';
    popupContent.appendChild(title);

    popupContent.appendChild(document.createElement('br'));

    const coords = document.createElement('small');
    coords.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    popupContent.appendChild(coords);

    popupContent.appendChild(document.createElement('br'));

    const addBtn = document.createElement('button');
    addBtn.textContent = 'Add sighting at this spot';
    addBtn.className = 'popup-link';
    addBtn.addEventListener('click', () => {
      this.router.navigate(['/add'], {
        queryParams: { lat: lat.toFixed(6), lng: lng.toFixed(6) },
      });
    });
    popupContent.appendChild(addBtn);

    if (this.activePopup) {
      this.activePopup.remove();
    }

    const popup = this.registerPopup(
      new Popup({
        anchor: 'bottom',
        offset: 0,
        closeOnClick: true,
      }),
    );

    popup.setLngLat([lng, lat]).setDOMContent(popupContent).addTo(this.map);
  }

  private loadSightings(): void {
    this.sightingService.getAll().subscribe({
      next: (sightings) => {
        this.sightings.set(sightings);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected onSearchInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
  }

  protected clearSearch(): void {
    this.searchTerm.set('');
  }

  protected toggleHeatmap(): void {
    this.heatmapMode.update((v) => !v);
  }

  protected setMapStyle(style: MapStyleKey): void {
    this.mapStyle.set(style);
  }

  private updateHeatmap(sightings: Sighting[]): void {
    if (!this.map) return;

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: sightings.map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.longitude, s.latitude] },
        properties: {},
      })),
    };

    const doUpdate = () => {
      if (!this.map) return;
      const source = this.map.getSource(this.HEATMAP_SOURCE);
      if (source) {
        (source as GeoJSONSource).setData(geojson);
      } else {
        this.map.addSource(this.HEATMAP_SOURCE, { type: 'geojson', data: geojson });
        this.map.addLayer({
          id: this.HEATMAP_LAYER,
          type: 'heatmap',
          source: this.HEATMAP_SOURCE,
          paint: {
            'heatmap-weight': 1,
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
            'heatmap-color': [
              'interpolate',
              ['linear'],
              ['heatmap-density'],
              0,
              'rgba(0,0,0,0)',
              0.2,
              'rgba(0,128,255,0.65)',
              0.4,
              'rgba(0,200,100,0.75)',
              0.6,
              'rgba(255,220,0,0.85)',
              0.8,
              'rgba(255,130,0,0.9)',
              1,
              'rgba(220,30,30,1)',
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 6, 9, 24],
            'heatmap-opacity': 0.85,
          },
        });
      }
    };

    if (this.map.isStyleLoaded()) {
      doUpdate();
    } else {
      this.map.once('load', doUpdate);
    }
  }

  private removeHeatmap(): void {
    if (!this.map || !this.map.isStyleLoaded()) return;
    if (this.map.getLayer(this.HEATMAP_LAYER)) {
      this.map.removeLayer(this.HEATMAP_LAYER);
    }
    if (this.map.getSource(this.HEATMAP_SOURCE)) {
      this.map.removeSource(this.HEATMAP_SOURCE);
    }
  }

  private addMarkers(sightings: Sighting[]): void {
    if (!this.map) return;

    this.markers.forEach((m) => m.remove());
    this.markers = [];

    const bounds = new LngLatBounds();

    for (const sighting of sightings) {
      const popupContent = document.createElement('div');
      popupContent.className = 'sighting-popup';

      const title = document.createElement('strong');
      title.textContent = sighting.species;
      popupContent.appendChild(title);

      popupContent.appendChild(document.createElement('br'));

      const date = document.createElement('small');
      date.textContent = sighting.sighting_date ?? 'Unknown date';
      popupContent.appendChild(date);

      if (sighting.life_lister || sighting.photo_only) {
        popupContent.appendChild(document.createElement('br'));
        const categories = document.createElement('small');
        const labels: string[] = [];
        if (sighting.life_lister) labels.push('Life lister');
        if (sighting.photo_only) labels.push('Photo');
        categories.textContent = labels.join(' • ');
        popupContent.appendChild(categories);
      }

      popupContent.appendChild(document.createElement('br'));

      const viewBtn = document.createElement('button');
      viewBtn.textContent = 'View Details →';
      viewBtn.className = 'popup-link';
      viewBtn.addEventListener('click', () => {
        this.router.navigate(['/sightings', sighting.id]);
      });
      popupContent.appendChild(viewBtn);

      const popup = this.registerPopup(
        new Popup({
          offset: 25,
          closeOnClick: true,
        }).setDOMContent(popupContent),
      );

      const marker = new Marker({ color: '#4a7c59' })
        .setLngLat([sighting.longitude, sighting.latitude])
        .setPopup(popup)
        .addTo(this.map);

      this.markers.push(marker);
      bounds.extend([sighting.longitude, sighting.latitude]);
    }

    if (sightings.length > 0) {
      this.map.fitBounds(bounds, { padding: 60, maxZoom: 14 });
    } else {
      this.map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM });
    }
  }
}
