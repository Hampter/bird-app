import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import type { WishlistItem, WishlistPriority } from '../../models/wishlist-item.model';
import { WishlistService } from '../../services/wishlist.service';
import type { WishlistItemPayload } from '../../services/wishlist.service';

type WishlistSort = 'priority' | 'newest' | 'species';

const PRIORITY_ORDER: Record<WishlistPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

@Component({
  selector: 'app-wishlist-list',
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './wishlist-list.html',
  styleUrl: './wishlist-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WishlistListComponent {
  private readonly wishlistService = inject(WishlistService);
  private readonly router = inject(Router);

  protected readonly wishlistItems = signal<WishlistItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly actionBusyId = signal<number | null>(null);
  protected readonly filterQuery = signal('');
  protected readonly sortBy = signal<WishlistSort>('priority');
  protected readonly statusMessage = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly createForm = new FormGroup({
    species: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true }),
    priority: new FormControl<WishlistPriority>('medium', { nonNullable: true }),
  });

  protected readonly editForm = new FormGroup({
    species: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true }),
    priority: new FormControl<WishlistPriority>('medium', { nonNullable: true }),
  });

  protected readonly visibleItems = computed(() => {
    const query = this.filterQuery().trim().toLowerCase();
    const sortBy = this.sortBy();

    const filteredItems = this.wishlistItems().filter((item) => {
      if (!query) {
        return true;
      }

      return (
        item.species.toLowerCase().includes(query) ||
        item.notes?.toLowerCase().includes(query) ||
        item.priority.toLowerCase().includes(query)
      );
    });

    return [...filteredItems].sort((left, right) => {
      if (sortBy === 'species') {
        return left.species.localeCompare(right.species);
      }

      if (sortBy === 'newest') {
        const leftDate = Date.parse(left.created_at);
        const rightDate = Date.parse(right.created_at);

        if (leftDate !== rightDate) {
          return rightDate - leftDate;
        }

        return right.id - left.id;
      }

      const priorityDifference = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
      if (priorityDifference !== 0) {
        return priorityDifference;
      }

      const leftDate = Date.parse(left.created_at);
      const rightDate = Date.parse(right.created_at);
      if (leftDate !== rightDate) {
        return rightDate - leftDate;
      }

      return left.species.localeCompare(right.species);
    });
  });

  constructor() {
    this.loadWishlist();
  }

  protected onFilterInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.filterQuery.set(value);
  }

  protected onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as WishlistSort;
    this.sortBy.set(value);
  }

  protected addItem(): void {
    if (this.createForm.invalid || this.saving()) {
      this.createForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    this.statusMessage.set(null);

    this.wishlistService.create(this.getPayload(this.createForm)).subscribe({
      next: (wishlistItem: WishlistItem) => {
        this.wishlistItems.update((items) => [wishlistItem, ...items]);
        this.createForm.reset({ species: '', notes: '', priority: 'medium' });
        this.saving.set(false);
        this.statusMessage.set(`${wishlistItem.species} added to your wishlist.`);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(this.getErrorMessage(error, 'Unable to add wishlist item.'));
      },
    });
  }

  protected startEditing(item: WishlistItem): void {
    this.editingId.set(item.id);
    this.errorMessage.set(null);
    this.statusMessage.set(null);
    this.editForm.reset({
      species: item.species,
      notes: item.notes ?? '',
      priority: item.priority,
    });
  }

  protected cancelEditing(): void {
    this.editingId.set(null);
    this.editForm.reset({ species: '', notes: '', priority: 'medium' });
  }

  protected saveEdit(itemId: number): void {
    if (this.editForm.invalid || this.actionBusyId() !== null) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.actionBusyId.set(itemId);
    this.errorMessage.set(null);
    this.statusMessage.set(null);

    this.wishlistService.update(itemId, this.getPayload(this.editForm)).subscribe({
      next: (wishlistItem: WishlistItem) => {
        this.wishlistItems.update((items) =>
          items.map((item) => (item.id === wishlistItem.id ? wishlistItem : item)),
        );
        this.actionBusyId.set(null);
        this.editingId.set(null);
        this.statusMessage.set(`${wishlistItem.species} updated.`);
      },
      error: (error: unknown) => {
        this.actionBusyId.set(null);
        this.errorMessage.set(this.getErrorMessage(error, 'Unable to update wishlist item.'));
      },
    });
  }

  protected removeItem(item: WishlistItem): void {
    if (this.actionBusyId() !== null) {
      return;
    }

    if (!confirm(`Remove ${item.species} from your wishlist?`)) {
      return;
    }

    this.actionBusyId.set(item.id);
    this.errorMessage.set(null);
    this.statusMessage.set(null);

    this.wishlistService.delete(item.id).subscribe({
      next: () => {
        this.wishlistItems.update((items) => items.filter((entry) => entry.id !== item.id));
        this.actionBusyId.set(null);
        if (this.editingId() === item.id) {
          this.editingId.set(null);
        }
        this.statusMessage.set(`${item.species} removed from your wishlist.`);
      },
      error: (error: unknown) => {
        this.actionBusyId.set(null);
        this.errorMessage.set(this.getErrorMessage(error, 'Unable to remove wishlist item.'));
      },
    });
  }

  protected markAsSeen(item: WishlistItem): void {
    this.router.navigate(['/add'], {
      queryParams: {
        wishlistId: item.id,
        species: item.species,
        notes: item.notes ?? undefined,
      },
    });
  }

  protected priorityLabel(priority: WishlistPriority): string {
    if (priority === 'high') {
      return 'High priority';
    }

    if (priority === 'low') {
      return 'Low priority';
    }

    return 'Medium priority';
  }

  private loadWishlist(): void {
    this.loading.set(true);
    this.wishlistService.getAll().subscribe({
      next: (items: WishlistItem[]) => {
        this.wishlistItems.set(items);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.getErrorMessage(error, 'Unable to load wishlist.'));
      },
    });
  }

  private getPayload(form: FormGroup): WishlistItemPayload {
    const rawValue = form.getRawValue() as WishlistItemPayload;

    return {
      species: rawValue.species,
      notes: rawValue.notes,
      priority: rawValue.priority,
    };
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && typeof error.error?.error === 'string') {
      return error.error.error;
    }

    return fallback;
  }
}
