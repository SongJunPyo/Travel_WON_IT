export const CATEGORIES = [
  { name: "숙박", color: "#0067AC", icon: "bed", average: 42 },
  { name: "쇼핑", color: "#6A9FE8", icon: "bag", average: 15 },
  { name: "음식", color: "#67C7C1", icon: "food", average: 18 },
  { name: "교통", color: "#A8CBE9", icon: "train", average: 12 },
  { name: "관광", color: "#FFC778", icon: "ticket", average: 10 },
  { name: "기타", color: "#CBD5E1", icon: "more", average: 3 },
];
export const CURRENCIES = {
  EUR: { scale: 100, symbol: "€" },
  USD: { scale: 100, symbol: "$" },
  JPY: { scale: 1, symbol: "¥" },
  KRW: { scale: 1, symbol: "₩" },
  THB: { scale: 100, symbol: "฿" },
};
export const won = (value) => Math.round(value).toLocaleString("ko-KR") + "원";
export const money = (minor, currency = "EUR") => {
  const c = CURRENCIES[currency];
  return (
    c.symbol +
    (minor / c.scale).toLocaleString("en-US", {
      minimumFractionDigits: c.scale === 1 ? 0 : 2,
      maximumFractionDigits: c.scale === 1 ? 0 : 2,
    })
  );
};
export const minorText = (minor, currency = "EUR") =>
  (minor / CURRENCIES[currency].scale).toFixed(
    CURRENCIES[currency].scale === 1 ? 0 : 2,
  );
export function parseMoney(value, currency = "EUR") {
  const scale = CURRENCIES[currency]?.scale;
  const str = String(value).trim();
  if (!scale || !(scale === 1 ? /^\d+$/ : /^\d+(\.\d{1,2})?$/).test(str))
    throw new Error("금액을 올바르게 입력해 주세요.");
  const [whole, fraction = ""] = str.split(".");
  const minor =
    Number(whole) * scale +
    (scale === 100 ? Number(fraction.padEnd(2, "0")) : 0);
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > 1_000_000_000)
    throw new Error("금액은 0보다 큰 값으로 입력해 주세요.");
  return minor;
}
export function toWon(minor, currency, rate) {
  if (
    !Number.isSafeInteger(minor) ||
    minor < 0 ||
    !Number.isSafeInteger(rate) ||
    rate < 1 ||
    rate > 1_000_000
  )
    throw new Error("금액 또는 적용 환율을 확인해 주세요.");
  const scale = BigInt(CURRENCIES[currency].scale);
  return Number((BigInt(minor) * BigInt(rate) + scale / 2n) / scale);
}
export function normalizeProduct(name) {
  return String(name)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/코카\s*콜라|coca[\s-]*cola|coke/g, "코카콜라")
    .replace(/에비앙|evian/g, "에비앙")
    .replace(/(\d+(?:\.\d+)?)\s*l\b/g, (_, n) => `${Number(n) * 1000}ml`)
    .replace(/[\s._-]+/g, "")
    .replace(/밀리리터/g, "ml");
}
export function validDate(value) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function validateReceipt(receipt) {
  if (!receipt.store?.trim() || receipt.store.length > 120)
    throw new Error("매장명을 입력해 주세요.");
  if (!validDate(receipt.date))
    throw new Error("구매일을 YYYY-MM-DD 형식으로 입력해 주세요.");
  if (
    !CURRENCIES[receipt.currency] ||
    !CATEGORIES.some((c) => c.name === receipt.category)
  )
    throw new Error("통화와 카테고리를 확인해 주세요.");
  if (
    !Array.isArray(receipt.items) ||
    receipt.items.length < 1 ||
    receipt.items.length > 100
  )
    throw new Error("상품을 1개 이상 입력해 주세요.");
  for (const item of receipt.items) {
    if (
      !item.name?.trim() ||
      item.name.length > 160 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 999 ||
      !Number.isSafeInteger(item.unitMinor) ||
      item.unitMinor < 1 ||
      item.unitMinor > 1_000_000_000
    )
      throw new Error("상품명, 수량, 개당 가격을 확인해 주세요.");
  }
  if (
    !Number.isSafeInteger(receipt.totalMinor) ||
    receipt.totalMinor < 1 ||
    receipt.totalMinor > 1_000_000_000
  )
    throw new Error("총 결제금액을 확인해 주세요.");
  if (
    receipt.items.reduce((sum, i) => sum + i.unitMinor * i.quantity, 0) !==
    receipt.totalMinor
  )
    throw new Error(
      "상품 합계와 총 결제금액이 달라요. 할인·세금은 상품 가격에 반영해 주세요.",
    );
  toWon(receipt.totalMinor, receipt.currency, receipt.rate);
  return receipt;
}
export const fingerprint = (r) =>
  [
    r.store.normalize("NFKC").trim().toLowerCase(),
    r.date,
    r.currency,
    r.totalMinor,
  ].join("|");
export function summarize(receipts, budget) {
  const total = receipts.reduce(
    (sum, r) => sum + toWon(r.totalMinor, r.currency, r.rate),
    0,
  );
  const categories = CATEGORIES.map((c) => {
    const amount = receipts
      .filter((r) => r.category === c.name)
      .reduce((sum, r) => sum + toWon(r.totalMinor, r.currency, r.rate), 0);
    const ratio = total ? (amount / total) * 100 : 0;
    return { ...c, amount, ratio, delta: ratio - c.average };
  });
  return {
    total,
    categories,
    remaining: budget - total,
    percent: budget ? (total / budget) * 100 : 0,
  };
}
export function spendingInsight(summary) {
  if (!summary.total)
    return "첫 영수증을 기록하면 카테고리별 소비 비중을 살펴볼 수 있어요.";
  const top = [...summary.categories].sort((a, b) => b.ratio - a.ratio)[0];
  const diff = Math.abs(Math.round(top.delta));
  return `이번 여행은 ${top.name}에 가장 많이 사용했어요. ${top.name} 비중은 ${Math.round(top.ratio)}%로, 시연 평균${diff ? `보다 ${diff}%p ${top.delta > 0 ? "높아요" : "낮아요"}` : "과 같아요"}.`;
}
export function distanceMeters(a, b) {
  const rad = (n) => (n * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude),
    dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
// 같은 매장명·주소·상품·통화를 하나의 구매 대상으로 봅니다.
const purchaseKey = (row) =>
  [
    row.store.normalize("NFKC").toLowerCase().replace(/\s+/g, ""),
    String(row.address || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, ""),
    normalizeProduct(row.product),
    row.currency,
  ].join("|");
const isNewer = (row, prev) =>
  row.date > prev.date ||
  (row.date === prev.date && (row.recordedAt || "") > (prev.recordedAt || ""));
export function comparePrices(
  records,
  query,
  location,
  currency,
  radius = 3000,
) {
  const key = normalizeProduct(query);
  if (!key) return [];
  const latest = new Map();
  for (const row of records) {
    if (
      row.currency !== currency ||
      !normalizeProduct(row.product).includes(key)
    )
      continue;
    const distance = distanceMeters(location, row);
    if (distance > radius) continue;
    const id = purchaseKey(row);
    const prev = latest.get(id);
    if (!prev || isNewer(row, prev)) latest.set(id, { ...row, distance });
  }
  return [...latest.values()].sort(
    (a, b) => a.unitMinor - b.unitMinor || a.distance - b.distance,
  );
}
// 가계부 차트와 별개인 PAGE 2 둘러보기 카테고리입니다. 영수증 단위로 분류합니다.
export const BROWSE_CATEGORIES = [
  { name: "식당", icon: "food", color: "#D9653B" },
  { name: "명소", icon: "landmark", color: "#2F6FB5" },
  { name: "화장품", icon: "sparkles", color: "#C8508A" },
  { name: "의류", icon: "shirt", color: "#6B5BC4" },
  { name: "뷰티·웰니스", icon: "leaf", color: "#2E9A93" },
  { name: "숙박", icon: "bed", color: "#0067AC" },
  { name: "액티비티", icon: "mountain", color: "#B7791F" },
  { name: "렌트", icon: "car", color: "#47617A" },
];
// 거리순은 현재 위치 연동 후 제공합니다.
export const BROWSE_SORTS = [
  { name: "가격순", ready: true },
  { name: "구매수", ready: true },
  { name: "최신순", ready: true },
  { name: "거리순", ready: false },
];
const BROWSE_ORDER = {
  가격순: (a, b) => a.unitMinor - b.unitMinor || b.count - a.count,
  구매수: (a, b) => b.count - a.count || a.unitMinor - b.unitMinor,
  최신순: (a, b) => b.date.localeCompare(a.date) || b.count - a.count,
};
export function browseCategory(
  records,
  category,
  location,
  currency,
  sort = "가격순",
  radius = 3000,
) {
  const groups = new Map();
  for (const row of records) {
    if (row.category !== category || row.currency !== currency) continue;
    const distance = distanceMeters(location, row);
    if (distance > radius) continue;
    const id = purchaseKey(row);
    const prev = groups.get(id);
    const latest = !prev || isNewer(row, prev) ? { ...row, distance } : prev;
    groups.set(id, { ...latest, count: (prev?.count || 0) + 1 });
  }
  return [...groups.values()].sort(
    BROWSE_ORDER[sort] || BROWSE_ORDER.가격순,
  );
}
export function publicPrices(receipt) {
  if (
    receipt.shareConsent !== true ||
    receipt.demo ||
    !receipt.location ||
    !receipt.address?.trim()
  )
    return [];
  return receipt.items.map((i, index) => ({
    id: `${receipt.id}-${index}`,
    receiptId: receipt.id,
    store: receipt.store,
    address: receipt.address,
    latitude: receipt.location.latitude,
    longitude: receipt.location.longitude,
    product: i.name,
    normalized: normalizeProduct(i.name),
    unitMinor: i.unitMinor,
    currency: receipt.currency,
    date: receipt.date,
    recordedAt: receipt.recordedAt,
    demo: false,
  }));
}
export const DEMO_LOCATION = { latitude: 48.8584, longitude: 2.347 };
export function createDemo() {
  const make = (id, store, date, category, totalMinor, items) => ({
    id,
    store,
    date,
    category,
    totalMinor,
    items: items || [{ name: store, quantity: 1, unitMinor: totalMinor }],
    currency: "EUR",
    rate: 1600,
    shareConsent: false,
    demo: true,
    address: "",
    location: null,
    recordedAt: "2026-10-27T00:00:00Z",
  });
  return {
    version: 1,
    trip: {
      city: "파리",
      country: "프랑스",
      start: "2026-10-24",
      end: "2026-10-30",
      budget: 1000000,
      currency: "EUR",
      rate: 1600,
    },
    receipts: [
      make("demo-hotel", "메종 블루 호텔", "2026-10-24", "숙박", 23695),
      make("demo-shop", "메르시 편집숍", "2026-10-25", "쇼핑", 8314),
      make("demo-cafe", "카페 드 파리", "2026-10-27", "음식", 2860),
      make("demo-market", "마르셰 A · 시연 매장", "2026-10-27", "음식", 2128, [
        { name: "코카콜라 500ml", quantity: 2, unitMinor: 180 },
        { name: "에비앙 500ml", quantity: 2, unitMinor: 120 },
        { name: "샌드위치", quantity: 2, unitMinor: 764 },
      ]),
      make("demo-metro", "파리 메트로", "2026-10-26", "교통", 2494),
      make("demo-museum", "오르세 미술관", "2026-10-26", "관광", 2079),
    ],
  };
}
export const DEMO_PRICES = [
  {
    id: "price-a",
    store: "마르셰 A",
    address: "파리 중심부 · 가상 매장 A",
    latitude: 48.8598,
    longitude: 2.345,
    unitMinor: 180,
  },
  {
    id: "price-b",
    store: "시티 마켓 B",
    address: "파리 중심부 · 가상 매장 B",
    latitude: 48.8556,
    longitude: 2.351,
    unitMinor: 210,
  },
  {
    id: "price-c",
    store: "에피스리 C",
    address: "파리 중심부 · 가상 매장 C",
    latitude: 48.8628,
    longitude: 2.353,
    unitMinor: 250,
  },
].flatMap((s, i) => [
  {
    ...s,
    product: "코카콜라 500ml",
    currency: "EUR",
    date: `2026-10-${27 - i}`,
    demo: true,
  },
  {
    ...s,
    id: s.id + "-water",
    product: "에비앙 500ml",
    currency: "EUR",
    date: `2026-10-${27 - i}`,
    unitMinor: 120 + i * 35,
    demo: true,
  },
]);
// 카테고리 둘러보기 시연용 가상 거래 기록입니다. 매장·가격·좌표는 모두 가상입니다.
// [카테고리, 매장, 상품, 위도, 경도, 최근 구매부터의 개당 가격(센트)]
const DEMO_BROWSE_STORES = [
  ["식당", "비스트로 A", "오늘의 메뉴", 48.8606, 2.341, [1800, 1750, 1800, 1650]],
  ["식당", "브라스리 B", "크로크 무슈", 48.8541, 2.35, [1250, 1250]],
  ["식당", "카페 C", "카페 크렘", 48.857, 2.3525, [420, 400, 420, 380, 420]],
  ["명소", "미술관 A", "성인 입장권", 48.86, 2.333, [1600, 1600, 1600]],
  ["명소", "성당 B", "탑 전망 입장권", 48.8527, 2.348, [1300, 1300]],
  ["화장품", "드러그스토어 A", "립밤 4g", 48.8622, 2.3445, [690, 690, 720]],
  ["화장품", "코스메틱 B", "핸드크림 30ml", 48.8551, 2.3401, [1150, 1200]],
  ["의류", "편집숍 A", "스트라이프 티셔츠", 48.8593, 2.3622, [4500, 4500]],
  ["의류", "아웃렛 B", "에코백", 48.8642, 2.352, [1500, 1500, 1400]],
  ["뷰티·웰니스", "스파 A", "아로마 마사지 60분", 48.8655, 2.336, [9000, 9500]],
  ["뷰티·웰니스", "네일숍 B", "젤 네일", 48.852, 2.356, [4500]],
  ["숙박", "호텔 A", "더블룸 1박", 48.857, 2.361, [16500, 15900, 16500]],
  ["숙박", "호스텔 B", "도미토리 1박", 48.866, 2.3555, [4200, 4200, 4500, 4200]],
  ["액티비티", "리버 크루즈 A", "1시간 크루즈", 48.859, 2.328, [1700, 1700, 1600]],
  ["액티비티", "자전거 투어 B", "3시간 투어", 48.854, 2.342, [3900, 3900]],
  ["렌트", "렌터카 A", "소형차 1일", 48.8505, 2.346, [6500, 6900]],
  ["렌트", "자전거 대여 B", "전기자전거 1일", 48.861, 2.358, [2500, 2500, 2400]],
];
export const DEMO_PURCHASES = DEMO_BROWSE_STORES.flatMap(
  ([category, store, product, latitude, longitude, prices], s) =>
    prices.map((unitMinor, i) => ({
      id: `purchase-${s}-${i}`,
      store,
      address: "파리 중심부 · 가상 매장",
      latitude,
      longitude,
      product,
      category,
      currency: "EUR",
      date: `2026-10-${String(27 - (s % 4) - i * 2).padStart(2, "0")}`,
      unitMinor,
      demo: true,
    })),
);
