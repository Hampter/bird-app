export type SightingSex = 'male' | 'female' | 'both' | null;

export interface Sighting {
  id: number;
  species: string;
  description: string | null;
  sex: SightingSex;
  life_lister: number;
  photo_only: number;
  latitude: number;
  longitude: number;
  image_filename: string | null;
  sighting_date: string | null;
  created_at: string;
}
