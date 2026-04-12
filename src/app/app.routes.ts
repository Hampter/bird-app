import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/map-view/map-view').then((m) => m.MapViewComponent),
  },
  {
    path: 'add',
    loadComponent: () =>
      import('./components/sighting-form/sighting-form').then((m) => m.SightingFormComponent),
  },
  {
    path: 'sightings',
    loadComponent: () =>
      import('./components/sighting-list/sighting-list').then((m) => m.SightingListComponent),
  },
  {
    path: 'sightings/:id',
    loadComponent: () =>
      import('./components/sighting-detail/sighting-detail').then((m) => m.SightingDetailComponent),
  },
];
