export type Coordinate = { latitude: number; longitude: number };
export type Receipt = {
  id: string;
  // store는 영수증 원문 매장명, storeKo는 한국어 매장명(이전 기록에는 없을 수 있음)
  store: string;
  storeKo?: string;
  // PAGE 2 카테고리 둘러보기 분류(식당·명소 등). 없으면 상품 검색에만 나옵니다.
  browseCategory?: string | null;
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
  storeKo: string | null;
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
  // 추천순일 때만: 추천 이유와, 그 순서·이유를 AI가 정했는지
  reason?: string | null;
  ai?: boolean;
};
// PAGE 1 소비 인사이트(POST /insight). facts는 서버가 계산한 근거 숫자, basis는 비교 기준(없으면 null),
// ai는 문장을 AI가 썼는지입니다.
export type Insight = {
  headline: string;
  body: string;
  tip: string | null;
  facts: string[];
  basis: string | null;
  // 비교 기준 여행자들의 카테고리별 평균 비중(%). 5명 미만이면 null
  peerShares?: Record<string, number> | null;
  sampleData: boolean;
  ai: boolean;
};
