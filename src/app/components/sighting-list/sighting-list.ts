import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SightingService } from '../../services/sighting.service';
import { Sighting } from '../../models/sighting.model';

@Component({
  selector: 'app-sighting-list',
  imports: [RouterLink],
  templateUrl: './sighting-list.html',
  styleUrl: './sighting-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SightingListComponent {
  private readonly sightingService = inject(SightingService);

  protected readonly sightings = signal<Sighting[]>([]);
  protected readonly loading = signal(true);

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
}
