import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import type { WishlistItem, WishlistPriority } from '../models/wishlist-item.model';

export type WishlistItemPayload = {
  species: string;
  notes: string;
  priority: WishlistPriority;
};

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/wishlist';

  getAll(): Observable<WishlistItem[]> {
    return this.http.get<WishlistItem[]>(this.apiUrl);
  }

  create(payload: WishlistItemPayload): Observable<WishlistItem> {
    return this.http.post<WishlistItem>(this.apiUrl, payload);
  }

  update(id: number, payload: WishlistItemPayload): Observable<WishlistItem> {
    return this.http.put<WishlistItem>(`${this.apiUrl}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}

