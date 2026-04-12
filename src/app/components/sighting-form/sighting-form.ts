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
import { ActivatedRoute, Router } from '@angular/router';
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
  private readonly route = inject(ActivatedRoute);

  private map: Map | null = null;
  private marker: Marker | null = null;
  private selectedFile: File | null = null;

  protected readonly imagePreview = signal<string | null>(null);
  protected readonly existingImageUrl = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly loadingExisting = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly locating = signal(false);
  protected readonly locationError = signal<string | null>(null);
  protected readonly editId = signal<number | null>(null);
  protected readonly selectedCoords = signal<{ lat: number; lng: number } | null>(null);
  protected readonly geolocationSupported =
    typeof navigator !== 'undefined' && 'geolocation' in navigator;
  protected readonly isEditMode = computed(() => this.editId() !== null);
  protected readonly pageTitle = computed(() =>
    this.isEditMode() ? 'Edit Bird Sighting' : 'Log a Bird Sighting',
  );
  protected readonly submitLabel = computed(() =>
    this.isEditMode() ? 'Save Changes' : 'Save Sighting',
  );

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
    this.initializeEditMode();

    afterNextRender(() => {
      this.initMap();
      if (!this.isEditMode()) {
        this.prefillLocationFromQueryParams();
      }
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

  private initializeEditMode(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (!idParam) {
      return;
    }

    const parsedId = Number.parseInt(idParam, 10);
    if (Number.isNaN(parsedId)) {
      return;
    }

    this.editId.set(parsedId);
    this.loadExistingSighting(parsedId);
  }

  private loadExistingSighting(id: number): void {
    this.loadingExisting.set(true);
    this.loadError.set(null);

    this.sightingService.getById(id).subscribe({
      next: (sighting) => {
        const unknownDate = !sighting.sighting_date;
        this.form.patchValue({
          species: sighting.species,
          description: sighting.description ?? '',
          sighting_date: sighting.sighting_date,
          unknown_date: unknownDate,
          latitude: sighting.latitude,
          longitude: sighting.longitude,
        });
        this.applyUnknownDateValidation(unknownDate);
        this.selectedCoords.set({ lat: sighting.latitude, lng: sighting.longitude });
        this.updateMarker(sighting.longitude, sighting.latitude);
        this.map?.jumpTo({ center: [sighting.longitude, sighting.latitude], zoom: 14 });

        if (sighting.image_filename) {
          this.existingImageUrl.set(this.sightingService.getImageUrl(sighting.image_filename));
        }

        this.loadingExisting.set(false);
      },
      error: () => {
        this.loadError.set('Unable to load this sighting for editing.');
        this.loadingExisting.set(false);
      },
    });
  }

  private applyUnknownDateValidation(unknownDate: boolean): void {
    const sightingDateControl = this.form.controls.sighting_date;
    if (unknownDate) {
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

  private prefillLocationFromQueryParams(): void {
    const latQuery = this.route.snapshot.queryParamMap.get('lat');
    const lngQuery = this.route.snapshot.queryParamMap.get('lng');
    if (!latQuery || !lngQuery) {
      return;
    }

    const lat = Number.parseFloat(latQuery);
    const lng = Number.parseFloat(lngQuery);
    const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
    const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;

    if (!validLat || !validLng) {
      return;
    }

    this.form.patchValue({ latitude: lat, longitude: lng });
    this.selectedCoords.set({ lat, lng });
    this.updateMarker(lng, lat);
    this.map?.jumpTo({ center: [lng, lat], zoom: 14 });
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
        this.map?.jumpTo({ center: [lng, lat], zoom: 14 });

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
    this.form.controls.unknown_date.setValue(checked);
    this.applyUnknownDateValidation(checked);
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

    const editId = this.editId();
    const request$ =
      editId !== null ? this.sightingService.update(editId, formData) : this.sightingService.create(formData);

    request$.subscribe({
      next: (sighting) => this.router.navigate(['/sightings', sighting.id]),
      error: () => this.submitting.set(false),
    });
  }
}
