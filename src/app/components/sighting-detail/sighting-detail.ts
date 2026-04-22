import {
  Component,
  ChangeDetectionStrategy,
  signal,
  inject,
  input,
  effect,
  untracked,
  ElementRef,
  viewChild,
  OnDestroy,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Map, Marker } from 'maplibre-gl';
import { HttpErrorResponse } from '@angular/common/http';
import { SightingService } from '../../services/sighting.service';
import { BirdInfo, BirdInfoService } from '../../services/bird-info.service';
import { Sighting } from '../../models/sighting.model';
import { MAP_STYLES, DEFAULT_MAP_STYLE } from '../../shared/map.config';
import { WishlistService } from '../../services/wishlist.service';
import type { WishlistItem } from '../../models/wishlist-item.model';

@Component({
  selector: 'app-sighting-detail',
  imports: [RouterLink],
  templateUrl: './sighting-detail.html',
  styleUrl: './sighting-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SightingDetailComponent implements OnDestroy {
  private readonly sightingService = inject(SightingService);
  private readonly birdInfoService = inject(BirdInfoService);
  private readonly wishlistService = inject(WishlistService);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  protected readonly sighting = signal<Sighting | null>(null);
  protected readonly loading = signal(true);
  protected readonly birdInfo = signal<BirdInfo | null>(null);
  protected readonly birdInfoLoading = signal(false);
  protected readonly birdInfoError = signal<string | null>(null);
  protected readonly wishlistSubmitting = signal(false);
  protected readonly wishlistStatus = signal<string | null>(null);

  private map: Map | null = null;
  readonly mapContainer = viewChild<ElementRef>('detailMap');

  constructor() {
    effect(() => {
      const id = parseInt(this.id(), 10);
      untracked(() => {
        if (!isNaN(id)) {
          this.loadSighting(id);
        }
      });
    });
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private loadSighting(id: number): void {
    this.sightingService.getById(id).subscribe({
      next: (s) => {
        this.sighting.set(s);
        this.loadBirdInfo(s.species);
        this.loading.set(false);
        // Wait for Angular to render the @if block before initializing the map
        setTimeout(() => this.initMap(s));
      },
      error: () => this.loading.set(false),
    });
  }

  private loadBirdInfo(species: string): void {
    this.birdInfo.set(null);
    this.birdInfoError.set(null);
    this.birdInfoLoading.set(true);

    this.birdInfoService.getBySpecies(species).subscribe({
      next: (info) => {
        this.birdInfo.set(info);
        this.birdInfoLoading.set(false);
      },
      error: () => {
        this.birdInfoError.set('No additional bird info is available right now.');
        this.birdInfoLoading.set(false);
      },
    });
  }

  private initMap(sighting: Sighting): void {
    const container = this.mapContainer()?.nativeElement;
    if (!container) return;

    this.map = new Map({
      container,
      style: MAP_STYLES[DEFAULT_MAP_STYLE],
      center: [sighting.longitude, sighting.latitude],
      zoom: 12,
      interactive: false,
    });

    new Marker({ color: '#4a7c59' })
      .setLngLat([sighting.longitude, sighting.latitude])
      .addTo(this.map);
  }

  protected getImageUrl(filename: string): string {
    return this.sightingService.getImageUrl(filename);
  }

  protected deleteSighting(): void {
    const sighting = this.sighting();
    if (!sighting || !confirm('Are you sure you want to delete this sighting?')) return;

    this.sightingService.delete(sighting.id).subscribe(() => {
      this.router.navigate(['/']);
    });
  }

  protected addToWishlist(): void {
    const sighting = this.sighting();
    if (!sighting || this.wishlistSubmitting()) {
      return;
    }

    this.wishlistSubmitting.set(true);
    this.wishlistStatus.set(null);

    this.wishlistService
      .create({
        species: sighting.species,
        notes: sighting.description ?? '',
        priority: 'medium',
      })
      .subscribe({
        next: (_wishlistItem: WishlistItem) => {
          this.wishlistSubmitting.set(false);
          this.wishlistStatus.set(`${sighting.species} added to your wishlist.`);
        },
        error: (error: unknown) => {
          this.wishlistSubmitting.set(false);
          this.wishlistStatus.set(this.getWishlistErrorMessage(error));
        },
      });
  }

  private getWishlistErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.error === 'string') {
      return error.error.error;
    }

    return 'Unable to add this bird to your wishlist right now.';
  }
}
