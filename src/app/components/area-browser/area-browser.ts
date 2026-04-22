import {
  Component,
  ChangeDetectionStrategy,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
  OnDestroy,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Map, Marker } from 'maplibre-gl';
import {
  DEFAULT_CENTER,
  DEFAULT_MAP_STYLE,
  DEFAULT_ZOOM,
  MAP_STYLES,
} from '../../shared/map.config';

@Component({
  selector: 'app-area-browser',
  templateUrl: './area-browser.html',
  styleUrl: './area-browser.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AreaBrowserComponent implements OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private map: Map | null = null;
  private selectedMarker: Marker | null = null;

  protected readonly selectedPoint = signal<{ lat: number; lng: number } | null>(null);
  protected readonly browseRadiusKm = signal(25);

  protected readonly selectedPointLabel = computed(() => {
    const point = this.selectedPoint();
    if (!point) {
      return 'Click anywhere on the map to choose an area.';
    }

    return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
  });

  readonly mapContainer = viewChild.required<ElementRef>('mapContainer');

  constructor() {
    this.initializeFromQuery();
    afterNextRender(() => this.initMap());
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  protected onBrowseRadiusChange(event: Event): void {
    const value = Number.parseInt((event.target as HTMLSelectElement).value, 10);
    if (!Number.isNaN(value)) {
      this.browseRadiusKm.set(value);
    }
  }

  protected continueToBirds(): void {
    const point = this.selectedPoint();
    if (!point) {
      return;
    }

    this.router.navigate(['/explore/birds'], {
      queryParams: {
        lat: point.lat.toFixed(6),
        lng: point.lng.toFixed(6),
        dist: this.browseRadiusKm(),
      },
    });
  }

  private initializeFromQuery(): void {
    const latParam = this.route.snapshot.queryParamMap.get('lat');
    const lngParam = this.route.snapshot.queryParamMap.get('lng');
    const distParam = this.route.snapshot.queryParamMap.get('dist');

    const lat = latParam ? Number.parseFloat(latParam) : Number.NaN;
    const lng = lngParam ? Number.parseFloat(lngParam) : Number.NaN;
    const dist = distParam ? Number.parseInt(distParam, 10) : Number.NaN;

    const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
    const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;

    if (validLat && validLng) {
      this.selectedPoint.set({ lat, lng });
    }

    if (Number.isFinite(dist)) {
      this.browseRadiusKm.set(Math.min(Math.max(dist, 1), 50));
    }
  }

  private initMap(): void {
    this.map = new Map({
      container: this.mapContainer().nativeElement,
      style: MAP_STYLES[DEFAULT_MAP_STYLE],
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    const selectedPoint = this.selectedPoint();
    if (selectedPoint) {
      this.setSelectedPoint(selectedPoint.lat, selectedPoint.lng);
      this.map.jumpTo({ center: [selectedPoint.lng, selectedPoint.lat], zoom: 10 });
    }

    this.map.on('click', (event: { lngLat: { lng: number; lat: number } }) => {
      const { lng, lat } = event.lngLat;
      this.setSelectedPoint(lat, lng);
    });
  }

  private setSelectedPoint(lat: number, lng: number): void {
    this.selectedPoint.set({ lat, lng });

    if (this.selectedMarker) {
      this.selectedMarker.setLngLat([lng, lat]);
      return;
    }

    if (!this.map) {
      return;
    }

    this.selectedMarker = new Marker({ color: '#4dd1a8' }).setLngLat([lng, lat]).addTo(this.map);
  }
}
