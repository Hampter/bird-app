import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Sighting } from '../models/sighting.model';

@Injectable({ providedIn: 'root' })
export class SightingService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/sightings';

  getAll(): Observable<Sighting[]> {
    return this.http.get<Sighting[]>(this.apiUrl);
  }

  getById(id: number): Observable<Sighting> {
    return this.http.get<Sighting>(`${this.apiUrl}/${id}`);
  }

  create(formData: FormData): Observable<Sighting> {
    return this.http.post<Sighting>(this.apiUrl, formData);
  }

  update(id: number, formData: FormData): Observable<Sighting> {
    return this.http.put<Sighting>(`${this.apiUrl}/${id}`, formData);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  getImageUrl(filename: string): string {
    return `/api/uploads/${filename}`;
  }
}
