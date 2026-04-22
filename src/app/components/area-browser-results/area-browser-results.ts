import {
  Component,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EbirdObservation, EbirdService } from '../../services/ebird.service';
import { BirdInfoService } from '../../services/bird-info.service';
import { catchError, forkJoin, map, of, switchMap } from 'rxjs';

type SpeciesImageInfo = {
  thumbnail: string | null;
  sourceUrl: string | null;
};

type SpeciesResult = {
  commonName: string;
  scientificName: string;
  speciesCode: string;
};

type SpeciesRarityLevel = 'high' | 'medium' | 'normal';

type SpeciesGroup = {
  type: string;
  birds: SpeciesResult[];
};

const TYPE_RULES: Array<{ type: string; keywords: string[] }> = [
  {
    type: 'Raptors',
    keywords: ['eagle', 'hawk', 'falcon', 'owl', 'osprey', 'kite', 'harrier', 'vulture'],
  },
  {
    type: 'Shorebirds',
    keywords: [
      'plover',
      'sandpiper',
      'avocet',
      'stilt',
      'godwit',
      'curlew',
      'yellowlegs',
      'dowitcher',
      'snipe',
      'turnstone',
      'phalarope',
      'willet',
      'oystercatcher',
    ],
  },
  {
    type: 'Waterfowl',
    keywords: ['duck', 'goose', 'swan', 'merganser', 'teal', 'scoter', 'eider'],
  },
  {
    type: 'Wading Birds',
    keywords: ['heron', 'egret', 'ibis', 'spoonbill', 'stork', 'crane', 'rail', 'gallinule', 'coot'],
  },
  {
    type: 'Seabirds',
    keywords: ['gull', 'tern', 'jaeger', 'puffin', 'auk', 'murre', 'guillemot', 'petrel', 'shearwater'],
  },
  {
    type: 'Woodpeckers',
    keywords: ['woodpecker', 'flicker', 'sapsucker'],
  },
  {
    type: 'Pigeons and Doves',
    keywords: ['dove', 'pigeon'],
  },
  {
    type: 'Hummingbirds and Swifts',
    keywords: ['hummingbird', 'swift'],
  },
  {
    type: 'Songbirds',
    keywords: [
      'warbler',
      'sparrow',
      'finch',
      'vireo',
      'flycatcher',
      'wren',
      'thrush',
      'robin',
      'oriole',
      'blackbird',
      'chickadee',
      'nuthatch',
      'waxwing',
      'kinglet',
      'swallow',
      'bluebird',
      'lark',
      'bunting',
      'grosbeak',
      'tanager',
      'towhee',
      'pipit',
      'catbird',
      'gnatcatcher',
      'junco',
      'starling',
      'mockingbird',
    ],
  },
];

@Component({
  selector: 'app-area-browser-results',
  imports: [RouterLink],
  templateUrl: './area-browser-results.html',
  styleUrl: './area-browser-results.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AreaBrowserResultsComponent {
  private readonly ebirdService = inject(EbirdService);
  private readonly birdInfoService = inject(BirdInfoService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly selectedPoint = signal<{ lat: number; lng: number } | null>(null);
  protected readonly browseRadiusKm = signal(25);
  protected readonly loading = signal(false);
  protected readonly loaded = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly speciesResults = signal<SpeciesResult[]>([]);
  protected readonly imageInfoBySpecies = signal<Record<string, SpeciesImageInfo>>({});
  protected readonly imageLoadingBySpecies = signal<Record<string, boolean>>({});
  protected readonly rarityBySpeciesCode = signal<Record<string, SpeciesRarityLevel>>({});
  protected readonly notableBySpeciesCode = signal<Record<string, boolean>>({});
  protected readonly notableFeedUnavailable = signal(false);

  protected readonly selectedPointLabel = computed(() => {
    const point = this.selectedPoint();
    if (!point) {
      return null;
    }

    return `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`;
  });

  protected readonly groupedSpecies = computed<SpeciesGroup[]>(() => {
    const groups: Record<string, SpeciesResult[]> = {};

    for (const species of this.speciesResults()) {
      const type = this.classifyBirdType(species);
      if (!groups[type]) {
        groups[type] = [];
      }

      groups[type].push(species);
    }

    const orderedTypes = [...TYPE_RULES.map((rule) => rule.type), 'Other Birds'];

    return orderedTypes
      .filter((type) => groups[type]?.length)
      .map((type) => ({
        type,
        birds: groups[type],
      }));
  });

  constructor() {
    this.initializeFromQuery();
  }

  protected logSpecies(species: SpeciesResult): void {
    const point = this.selectedPoint();

    this.router.navigate(['/add'], {
      queryParams: {
        species: species.commonName,
        lat: point?.lat.toFixed(6),
        lng: point?.lng.toFixed(6),
      },
    });
  }

  protected speciesImage(species: SpeciesResult): string | null {
    return this.imageInfoBySpecies()[species.commonName]?.thumbnail ?? null;
  }

  protected speciesImageLink(species: SpeciesResult): string | null {
    return this.imageInfoBySpecies()[species.commonName]?.sourceUrl ?? null;
  }

  protected speciesImageLoading(species: SpeciesResult): boolean {
    return this.imageLoadingBySpecies()[species.commonName] ?? false;
  }

  protected rarityLevel(species: SpeciesResult): SpeciesRarityLevel {
    return this.rarityBySpeciesCode()[species.speciesCode] ?? 'normal';
  }

  protected isNotable(species: SpeciesResult): boolean {
    return this.notableBySpeciesCode()[species.speciesCode] ?? false;
  }

  protected rarityLabel(species: SpeciesResult): string {
    const level = this.rarityLevel(species);
    if (level === 'high') {
      return 'Rare';
    }

    if (level === 'medium') {
      return 'Uncommon';
    }

    return '';
  }

  protected trackSpecies(_index: number, species: SpeciesResult): string {
    return species.speciesCode;
  }

  protected trackSpeciesGroup(_index: number, group: SpeciesGroup): string {
    return group.type;
  }

  protected speciesName(species: SpeciesResult): string {
    return species.commonName;
  }

  protected retry(): void {
    this.loadBirdsForArea();
  }

  private initializeFromQuery(): void {
    const latParam = this.route.snapshot.queryParamMap.get('lat');
    const lngParam = this.route.snapshot.queryParamMap.get('lng');
    const distParam = this.route.snapshot.queryParamMap.get('dist');

    const lat = latParam ? Number.parseFloat(latParam) : Number.NaN;
    const lng = lngParam ? Number.parseFloat(lngParam) : Number.NaN;
    const dist = distParam ? Number.parseInt(distParam, 10) : 25;

    const validLat = Number.isFinite(lat) && lat >= -90 && lat <= 90;
    const validLng = Number.isFinite(lng) && lng >= -180 && lng <= 180;

    if (!validLat || !validLng) {
      this.error.set('Missing or invalid area coordinates. Select an area on the Explore map first.');
      this.loaded.set(true);
      return;
    }

    this.selectedPoint.set({ lat, lng });
    this.browseRadiusKm.set(Number.isFinite(dist) ? Math.min(Math.max(dist, 1), 50) : 25);
    this.loadBirdsForArea();
  }

  private loadBirdsForArea(): void {
    const point = this.selectedPoint();
    if (!point) {
      return;
    }

    this.loading.set(true);
    this.loaded.set(false);
    this.error.set(null);
    this.notableFeedUnavailable.set(false);

    forkJoin({
      nearby: this.ebirdService
        .getNearbyObservations(point.lat, point.lng, this.browseRadiusKm())
        .pipe(catchError(() => of([] as EbirdObservation[]))),
      notable: this.ebirdService
        .getNearbyNotableObservations(point.lat, point.lng, this.browseRadiusKm())
        .pipe(
          catchError(() => {
            this.notableFeedUnavailable.set(true);
            return of([] as EbirdObservation[]);
          }),
        ),
    }).subscribe({
      next: ({ nearby, notable }) => {
        const species = this.buildSpeciesResults(nearby);
        this.speciesResults.set(species);
        this.prefetchSpeciesImages(species);
        this.setRaritySignals(species, notable);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: () => {
        this.speciesResults.set([]);
        this.loading.set(false);
        this.loaded.set(true);
        this.error.set('Unable to load birds for this area.');
      },
    });
  }

  private classifyBirdType(species: SpeciesResult): string {
    const name = species.commonName.toLowerCase();

    for (const rule of TYPE_RULES) {
      if (rule.keywords.some((keyword) => name.includes(keyword))) {
        return rule.type;
      }
    }

    return 'Other Birds';
  }

  private buildSpeciesResults(nearbyObservations: EbirdObservation[]): SpeciesResult[] {
    const speciesByCode: Record<string, SpeciesResult> = {};

    for (const observation of nearbyObservations) {
      if (!speciesByCode[observation.speciesCode]) {
        speciesByCode[observation.speciesCode] = {
          commonName: observation.comName,
          scientificName: observation.sciName,
          speciesCode: observation.speciesCode,
        };
      }
    }

    return Object.values(speciesByCode).sort((left, right) =>
      left.commonName.localeCompare(right.commonName),
    );
  }

  private prefetchSpeciesImages(speciesList: SpeciesResult[]): void {
    const existingImages = this.imageInfoBySpecies();
    const loadingState = this.imageLoadingBySpecies();

    for (const species of speciesList) {
      const commonName = species.commonName;
      const scientificName = species.scientificName;

      if (existingImages[commonName] || loadingState[commonName]) {
        continue;
      }

      this.imageLoadingBySpecies.update((state) => ({
        ...state,
        [commonName]: true,
      }));

      this.birdInfoService
        .getBySpecies(commonName)
        .pipe(
          switchMap((birdInfo) => {
            if (
              birdInfo.thumbnail ||
              !scientificName ||
              scientificName.trim().length === 0 ||
              scientificName === commonName
            ) {
              return of(birdInfo);
            }

            return this.birdInfoService.getBySpecies(scientificName).pipe(
              map((scientificInfo) => ({
                ...birdInfo,
                thumbnail: scientificInfo.thumbnail ?? birdInfo.thumbnail,
                sourceUrl: scientificInfo.sourceUrl ?? birdInfo.sourceUrl,
              })),
              catchError(() => of(birdInfo)),
            );
          }),
          catchError(() => {
            if (
              !scientificName ||
              scientificName.trim().length === 0 ||
              scientificName === commonName
            ) {
              return of(null);
            }

            return this.birdInfoService.getBySpecies(scientificName).pipe(
              catchError(() => of(null)),
            );
          }),
        )
        .subscribe((birdInfo) => {
          this.imageInfoBySpecies.update((state) => ({
            ...state,
            [commonName]: {
              thumbnail: birdInfo?.thumbnail ?? null,
              sourceUrl: birdInfo?.sourceUrl ?? null,
            },
          }));
          this.imageLoadingBySpecies.update((state) => ({
            ...state,
            [commonName]: false,
          }));
        });
    }
  }

  private setRaritySignals(
    speciesList: SpeciesResult[],
    notableObservations: EbirdObservation[],
  ): void {
    const notableSpeciesCodes = new Set(
      notableObservations.map((observation) => observation.speciesCode),
    );
    const reviewedNotableSpeciesCodes = new Set(
      notableObservations
        .filter((observation) => observation.obsReviewed === true)
        .map((observation) => observation.speciesCode),
    );

    const rarityBySpeciesCode: Record<string, SpeciesRarityLevel> = {};
    const notableBySpeciesCode: Record<string, boolean> = {};

    for (const species of speciesList) {
      const isNotableSpecies = notableSpeciesCodes.has(species.speciesCode);
      notableBySpeciesCode[species.speciesCode] = isNotableSpecies;

      if (reviewedNotableSpeciesCodes.has(species.speciesCode)) {
        rarityBySpeciesCode[species.speciesCode] = 'high';
      } else if (isNotableSpecies) {
        rarityBySpeciesCode[species.speciesCode] = 'medium';
      } else {
        rarityBySpeciesCode[species.speciesCode] = 'normal';
      }
    }

    this.rarityBySpeciesCode.set(rarityBySpeciesCode);
    this.notableBySpeciesCode.set(notableBySpeciesCode);
  }
}
