export type Coordinate = { latitude: number; longitude: number };
export type Receipt = {
  id: string;
  store: string;
  date: string;
  category: string;
  currency: string;
  rate: number;
  // name은 영수증 원어 그대로, nameKo는 한국어 번역(이전 기록에는 없을 수 있음)
  items: {
    name: string;
    nameKo?: string;
    quantity: number;
    unitMinor: number;
  }[];
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
// 1 외화당 원화(한국수출입은행 매매기준율). date는 고시일입니다.
export type ExchangeRate = {
  currency: string;
  rate: number;
  date: string;
  source: string;
};
// PAGE 2 서버 조회(GET /prices) 결과: 매장·상품별 최근 구매가격과 구매수입니다.
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
  category: string | null;
  count: number;
  distance: number;
};
