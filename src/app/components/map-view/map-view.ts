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
import { Map, Marker, Popup, LngLatBounds } from 'maplibre-gl';
import { SightingService } from '../../services/sighting.service';
import { Sighting } from '../../models/sighting.model';
import { MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../shared/map.config';

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
  private readonly mapReady = signal(false);

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

      this.addMarkers(this.filteredSightings());
    });

    afterNextRender(() => {
      this.initMap();
      this.loadSightings();
    });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private initMap(): void {
    this.map = new Map({
      container: this.mapContainer().nativeElement,
      style: MAP_STYLE,
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

    new Popup({
      anchor: 'bottom',
      offset: 0,
      closeOnClick: true,
    })
      .setLngLat([lng, lat])
      .setDOMContent(popupContent)
      .addTo(this.map);
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

      popupContent.appendChild(document.createElement('br'));

      const viewBtn = document.createElement('button');
      viewBtn.textContent = 'View Details →';
      viewBtn.className = 'popup-link';
      viewBtn.addEventListener('click', () => {
        this.router.navigate(['/sightings', sighting.id]);
      });
      popupContent.appendChild(viewBtn);

      const popup = new Popup({ offset: 25 }).setDOMContent(popupContent);

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
