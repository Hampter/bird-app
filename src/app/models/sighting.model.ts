export interface Sighting {
  id: number;
  species: string;
  description: string | null;
  latitude: number;
  longitude: number;
  image_filename: string | null;
  sighting_date: string | null;
  created_at: string;
}
