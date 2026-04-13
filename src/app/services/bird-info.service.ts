import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface BirdInfo {
  title: string;
  summary: string;
  description: string | null;
  thumbnail: string | null;
  sourceUrl: string | null;
  rangeMapUrl: string | null;
  rangeMapFileName: string | null;
}

@Injectable({ providedIn: 'root' })
export class BirdInfoService {
  private readonly http = inject(HttpClient);

  getBySpecies(species: string): Observable<BirdInfo> {
    return this.http.get<BirdInfo>('/api/birds/info', {
      params: { species },
    });
  }
}
