export type WishlistPriority = 'low' | 'medium' | 'high';

export interface WishlistItem {
  id: number;
  species: string;
  notes: string | null;
  priority: WishlistPriority;
  created_at: string;
  updated_at: string;
}
