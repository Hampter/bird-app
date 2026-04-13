import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

interface EbirdObservation {
  comName: string;
  sciName: string;
  speciesCode: string;
}

@Injectable({ providedIn: 'root' })
export class EbirdService {
  private readonly http = inject(HttpClient);

  /** Returns a deduplicated, sorted list of common species names seen near the given coordinates. */
  getNearbySpecies(lat: number, lng: number, distKm = 50): Observable<string[]> {
    return this.http
      .get<EbirdObservation[]>('/api/ebird/nearby', {
        params: { lat: lat.toString(), lng: lng.toString(), dist: distKm.toString() },
      })
      .pipe(
        map((obs) => [...new Set(obs.map((o) => o.comName))].sort()),
        catchError(() => of([])),
      );
  }
}
