export type Coordinate = { latitude: number; longitude: number };
export type Receipt = {
  id: string;
  store: string;
  date: string;
  category: string;
  currency: string;
  rate: number;
  items: { name: string; quantity: number; unitMinor: number }[];
  totalMinor: number;
  shareConsent: boolean;
  demo: boolean;
  location: Coordinate | null;
  address: string;
  recordedAt: string;
};
export type TravelState = {
  version: number;
  trip: {
    city: string;
    country: string;
    start: string;
    end: string;
    budget: number;
    currency: string;
    rate: number;
  };
  receipts: Receipt[];
};
export type Price = {
  id: string;
  store: string;
  address: string;
  latitude: number;
  longitude: number;
  product: string;
  currency: string;
  date: string;
  unitMinor: number;
  demo: boolean;
  receiptId?: string;
  distance?: number;
  category?: string;
  count?: number;
};
