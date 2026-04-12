import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  ElementRef,
  viewChild,
  afterNextRender,
  OnDestroy,
} from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { Map, Marker } from 'maplibre-gl';
import { SightingService } from '../../services/sighting.service';
import { MAP_STYLE, DEFAULT_CENTER, DEFAULT_ZOOM } from '../../shared/map.config';

@Component({
  selector: 'app-sighting-form',
  imports: [ReactiveFormsModule],
  templateUrl: './sighting-form.html',
  styleUrl: './sighting-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SightingFormComponent implements OnDestroy {
  private readonly sightingService = inject(SightingService);
  private readonly router = inject(Router);

  private map: Map | null = null;
  private marker: Marker | null = null;
  private selectedFile: File | null = null;

  protected readonly imagePreview = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly locating = signal(false);
  protected readonly locationError = signal<string | null>(null);
  protected readonly selectedCoords = signal<{ lat: number; lng: number } | null>(null);
  protected readonly geolocationSupported =
    typeof navigator !== 'undefined' && 'geolocation' in navigator;

  protected readonly coordsDisplay = computed(() => {
    const coords = this.selectedCoords();
    if (!coords) return null;
    return `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
  });

  readonly mapContainer = viewChild.required<ElementRef>('locationMap');

  protected readonly form = new FormGroup({
    species: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    sighting_date: new FormControl<string | null>(new Date().toISOString().split('T')[0], {
      validators: [Validators.required],
    }),
    unknown_date: new FormControl(false, { nonNullable: true }),
    latitude: new FormControl<number | null>(null, { validators: [Validators.required] }),
    longitude: new FormControl<number | null>(null, { validators: [Validators.required] }),
  });

  constructor() {
    afterNextRender(() => this.initMap());
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

    this.map.on('click', (e: { lngLat: { lng: number; lat: number } }) => {
      const { lng, lat } = e.lngLat;
      this.form.patchValue({ latitude: lat, longitude: lng });
      this.selectedCoords.set({ lat, lng });
      this.updateMarker(lng, lat);
    });
  }

  private updateMarker(lng: number, lat: number): void {
    if (this.marker) {
      this.marker.setLngLat([lng, lat]);
    } else if (this.map) {
      this.marker = new Marker({ color: '#4a7c59' }).setLngLat([lng, lat]).addTo(this.map);
    }
  }

  protected useCurrentLocation(): void {
    this.locationError.set(null);

    if (!this.geolocationSupported) {
      this.locationError.set('GPS is not supported on this device/browser.');
      return;
    }

    this.locating.set(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        this.form.patchValue({ latitude: lat, longitude: lng });
        this.selectedCoords.set({ lat, lng });
        this.updateMarker(lng, lat);
        this.map?.flyTo({ center: [lng, lat], zoom: 14 });

        this.locating.set(false);
      },
      () => {
        this.locationError.set(
          'Unable to read GPS location. Check location permission and try again.',
        );
        this.locating.set(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      this.selectedFile = input.files[0];
      const reader = new FileReader();
      reader.onload = () => this.imagePreview.set(reader.result as string);
      reader.readAsDataURL(this.selectedFile);
    }
  }

  protected onUnknownDateToggle(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const sightingDateControl = this.form.controls.sighting_date;
    this.form.controls.unknown_date.setValue(checked);

    if (checked) {
      sightingDateControl.setValue(null);
      sightingDateControl.clearValidators();
    } else {
      sightingDateControl.setValidators([Validators.required]);
      if (!sightingDateControl.value) {
        sightingDateControl.setValue(new Date().toISOString().split('T')[0]);
      }
    }

    sightingDateControl.updateValueAndValidity();
  }

  protected onSubmit(): void {
    if (this.form.invalid) return;

    this.submitting.set(true);

    const formData = new FormData();
    const { species, description, sighting_date, unknown_date, latitude, longitude } =
      this.form.getRawValue();
    formData.append('species', species);
    formData.append('description', description);
    formData.append('unknown_date', String(unknown_date));
    if (!unknown_date && sighting_date) {
      formData.append('sighting_date', sighting_date);
    }
    formData.append('latitude', latitude!.toString());
    formData.append('longitude', longitude!.toString());

    if (this.selectedFile) {
      formData.append('image', this.selectedFile);
    }

    this.sightingService.create(formData).subscribe({
      next: (sighting) => this.router.navigate(['/sightings', sighting.id]),
      error: () => this.submitting.set(false),
    });
  }
}
