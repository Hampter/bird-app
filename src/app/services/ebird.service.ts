import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface EbirdObservation {
  comName: string;
  sciName: string;
  speciesCode: string;
  obsReviewed?: boolean;
  obsValid?: boolean;
  locName?: string;
  obsDt?: string;
  howMany?: number;
  lat: number;
  lng: number;
}

@Injectable({ providedIn: 'root' })
export class EbirdService {
  private readonly http = inject(HttpClient);

  getNearbyObservations(lat: number, lng: number, distKm = 50): Observable<EbirdObservation[]> {
    return this.http.get<EbirdObservation[]>('/api/ebird/nearby', {
      params: { lat: lat.toString(), lng: lng.toString(), dist: distKm.toString() },
    });
  }

  getNearbyNotableObservations(lat: number, lng: number, distKm = 50): Observable<EbirdObservation[]> {
    return this.http.get<EbirdObservation[]>('/api/ebird/notable', {
      params: { lat: lat.toString(), lng: lng.toString(), dist: distKm.toString() },
    });
  }

  /** Returns a deduplicated, sorted list of common species names seen near the given coordinates. */
  getNearbySpecies(lat: number, lng: number, distKm = 50): Observable<string[]> {
    return this.getNearbyObservations(lat, lng, distKm).pipe(
        map((obs) => [...new Set(obs.map((o) => o.comName))].sort()),
        catchError(() => of([])),
      );
  }
}

