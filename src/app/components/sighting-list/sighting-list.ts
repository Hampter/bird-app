import { Component, ChangeDetectionStrategy, signal, inject, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SightingService } from '../../services/sighting.service';
import { Sighting } from '../../models/sighting.model';

type SightingGroup = {
  id: string;
  title: string;
  emptyText: string;
  showImages: boolean;
  sightings: Sighting[];
};

@Component({
  selector: 'app-sighting-list',
  imports: [RouterLink, DatePipe],
  templateUrl: './sighting-list.html',
  styleUrl: './sighting-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SightingListComponent {
  private readonly sightingService = inject(SightingService);

  protected readonly sightings = signal<Sighting[]>([]);
  protected readonly loading = signal(true);
  protected readonly splitByCategory = signal(true);
  protected readonly sortedSightings = computed(() =>
    [...this.sightings()].sort((a, b) => {
      const dateA = Date.parse(a.sighting_date ?? a.created_at);
      const dateB = Date.parse(b.sighting_date ?? b.created_at);
      if (Number.isFinite(dateA) && Number.isFinite(dateB) && dateA !== dateB) {
        return dateB - dateA;
      }

      return b.id - a.id;
    }),
  );
  protected readonly groupedSightings = computed<SightingGroup[]>(() => {
    const sightings = this.sortedSightings();

    return [
      {
        id: 'photo',
        title: 'Photos',
        emptyText: 'No photo sightings yet.',
        showImages: true,
        sightings: sightings.filter((sighting) => Boolean(sighting.photo_only)),
      },
      {
        id: 'life-lister',
        title: 'Life Listers',
        emptyText: 'No life listers yet.',
        showImages: false,
        sightings: sightings.filter((sighting) => Boolean(sighting.life_lister)),
      },
      {
        id: 'other',
        title: 'Other Sightings',
        emptyText: 'No other sightings yet.',
        showImages: true,
        sightings: sightings.filter(
          (sighting) => !Boolean(sighting.life_lister) && !Boolean(sighting.photo_only),
        ),
      },
    ];
  });

  constructor() {
    this.sightingService.getAll().subscribe({
      next: (s) => {
        this.sightings.set(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  protected getImageUrl(filename: string): string {
    return this.sightingService.getImageUrl(filename);
  }

  protected toggleCategorySplit(): void {
    this.splitByCategory.update((v) => !v);
  }
}
