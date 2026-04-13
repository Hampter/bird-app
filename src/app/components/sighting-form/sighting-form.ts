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
import { OverlayModule } from '@angular/cdk/overlay';
import { Combobox, ComboboxInput, ComboboxPopupContainer } from '@angular/aria/combobox';
import { Listbox, Option } from '@angular/aria/listbox';
import { toObservable, toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, distinctUntilChanged, of } from 'rxjs';
import { Map, Marker } from 'maplibre-gl';
import { SightingService } from '../../services/sighting.service';
import { EbirdService } from '../../services/ebird.service';
import {
  MAP_STYLES,
  DEFAULT_MAP_STYLE,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from '../../shared/map.config';

@Component({
  selector: 'app-sighting-form',
  imports: [
    ReactiveFormsModule,
    OverlayModule,
    Combobox,
    ComboboxInput,
    ComboboxPopupContainer,
    Listbox,
    Option,
  ],
  templateUrl: './sighting-form.html',
  styleUrl: './sighting-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SightingFormComponent implements OnDestroy {
  private readonly sightingService = inject(SightingService);
  private readonly ebirdService = inject(EbirdService);
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

  protected readonly form = new FormGroup({
    species: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    sex: new FormControl<'male' | 'female' | 'both' | ''>('', { nonNullable: true }),
    life_lister: new FormControl(false, { nonNullable: true }),
    photo_only: new FormControl(false, { nonNullable: true }),
    sighting_date: new FormControl<string | null>(new Date().toISOString().split('T')[0], {
      validators: [Validators.required],
    }),
    unknown_date: new FormControl(false, { nonNullable: true }),
    latitude: new FormControl<number | null>(null, { validators: [Validators.required] }),
    longitude: new FormControl<number | null>(null, { validators: [Validators.required] }),
  });

  readonly mapContainer = viewChild.required<ElementRef>('locationMap');

  // eBird nearby-species autocomplete
  protected readonly allSuggestions = signal<string[]>([]);
  protected readonly ebirdLoading = signal(false);
  protected readonly selectedSuggestionValues = signal<string[]>([]);
  private readonly speciesTyped = toSignal(this.form.controls.species.valueChanges, {
    initialValue: this.form.controls.species.value,
  });
  protected readonly filteredSuggestions = computed(() => {
    const query = this.speciesTyped().trim().toLowerCase();
    const all = this.allSuggestions();
    if (all.length === 0) return [];
    if (!query) return all.slice(0, 8);
    return all.filter((s) => s.toLowerCase().includes(query)).slice(0, 8);
  });
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

  constructor() {
    this.initializeEditMode();

    toObservable(this.selectedCoords)
      .pipe(
        distinctUntilChanged((a, b) => a?.lat === b?.lat && a?.lng === b?.lng),
        switchMap((coords) => {
          if (!coords) return of([]);
          this.ebirdLoading.set(true);
          return this.ebirdService.getNearbySpecies(coords.lat, coords.lng);
        }),
        takeUntilDestroyed(),
      )
      .subscribe((suggestions) => {
        this.allSuggestions.set(suggestions);
        this.ebirdLoading.set(false);
      });

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
      style: MAP_STYLES[DEFAULT_MAP_STYLE],
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
          sex: sighting.sex ?? '',
          life_lister: sighting.life_lister === 1,
          photo_only: sighting.photo_only === 1,
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

  // eBird autocomplete handlers

  protected onSpeciesSelected(values: string[]): void {
    this.selectedSuggestionValues.set(values);
    const selected = values[0];
    if (selected) {
      this.form.controls.species.setValue(selected);
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
    const {
      species,
      description,
      sex,
      life_lister,
      photo_only,
      sighting_date,
      unknown_date,
      latitude,
      longitude,
    } = this.form.getRawValue();
    formData.append('species', species);
    formData.append('description', description);
    formData.append('sex', sex);
    formData.append('life_lister', String(life_lister));
    formData.append('photo_only', String(photo_only));
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
      editId !== null
        ? this.sightingService.update(editId, formData)
        : this.sightingService.create(formData);

    request$.subscribe({
      next: (sighting) => this.router.navigate(['/sightings', sighting.id]),
      error: () => this.submitting.set(false),
    });
  }
}
