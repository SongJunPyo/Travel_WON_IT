export const CATEGORIES = [
  { name: "음식", color: "#67C7C1", icon: "food", average: 18 },
  { name: "쇼핑", color: "#6A9FE8", icon: "bag", average: 15 },
  { name: "숙박", color: "#0067AC", icon: "bed", average: 42 },
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
const RATE_SCALE = 10_000n;
// 적용 환율(1 외화당 원화, 0 초과 1,000,000 이하, 소수 4자리까지)을 ×10,000 정수로 바꿉니다. 형식이 틀리면 null.
export function rateUnits(rate) {
  const str = String(rate ?? "").trim();
  if (!/^\d+(\.\d{1,4})?$/.test(str)) return null;
  const [whole, fraction = ""] = str.split(".");
  const units = BigInt(whole) * RATE_SCALE + BigInt(fraction.padEnd(4, "0"));
  return units > 0n && units <= 1_000_000n * RATE_SCALE ? units : null;
}
export function toWon(minor, currency, rate) {
  const units = rateUnits(rate);
  if (!Number.isSafeInteger(minor) || minor < 0 || units === null)
    throw new Error("금액 또는 적용 환율을 확인해 주세요.");
  // 금액 × 환율을 끝까지 정수로 계산한 뒤 원 단위로 사사오입합니다 (JPY 8.4174도 그대로 계산).
  const scale = BigInt(CURRENCIES[currency].scale) * RATE_SCALE;
  return Number((BigInt(minor) * units + scale / 2n) / scale);
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
// 화면에는 한국어 매장명을 먼저 보여 주고, 원문이 다르면 함께 보여 줍니다.
export const storeLabel = (r) => r.storeKo?.trim() || r.store;
export const storeOriginal = (r) =>
  r.storeKo?.trim() && r.storeKo.trim() !== r.store ? r.store : "";
export function validateReceipt(receipt) {
  if (!receipt.store?.trim() || receipt.store.length > 120)
    throw new Error("매장명을 입력해 주세요.");
  if (receipt.storeKo != null && String(receipt.storeKo).length > 120)
    throw new Error("한국어 매장명은 120자 이하로 입력해 주세요.");
  if (
    receipt.browseCategory != null &&
    !BROWSE_CATEGORIES.some((c) => c.name === receipt.browseCategory)
  )
    throw new Error("주변 가격 비교 카테고리를 확인해 주세요.");
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
      (item.nameKo != null && String(item.nameKo).length > 160) ||
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
// 추천순 개인화에 쓰는 가계부 요약: 남은 예산 비율(%, -100~100)과 가장 많이 쓴 카테고리(기록이 없으면 null)
export function recommendProfile(summary, budget) {
  const top = [...summary.categories].sort((a, b) => b.ratio - a.ratio)[0];
  return {
    budgetLeft: budget
      ? Math.max(
          -100,
          Math.min(100, Math.round((summary.remaining / budget) * 100)),
        )
      : null,
    favorite: summary.total ? top.name : null,
  };
}
// 소비 인사이트 요청: 여행 설정과 카테고리별 원화 지출 합계만 보냅니다. 영수증·매장·상품은 보내지 않습니다.
export function insightRequest(state) {
  const summary = summarize(state.receipts, state.trip.budget);
  return {
    trip: state.trip,
    categories: Object.fromEntries(
      summary.categories.map((c) => [c.name, c.amount]),
    ),
  };
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
// 거리순은 현재 위치 연동 후 제공합니다. 추천순은 서버가 가격·인기·최근성·거리와 내 가계부 요약으로 정합니다.
export const BROWSE_SORTS = [
  { name: "추천순", ready: true },
  { name: "가격순", ready: true },
  { name: "구매수", ready: true },
  { name: "최신순", ready: true },
  { name: "거리순", ready: false },
];
// 시연 위치: 도쿄 신주쿠역. PAGE 2는 이 위치 반경 3km의 공유 영수증을 서버에서 조회합니다.
export const DEMO_LOCATION = { latitude: 35.6896, longitude: 139.7006 };
// 시연용 가짜 매장 좌표. 실제 GPS 대신, 매장명·주소로 정한 신주쿠역 300m~1.5km 지점을 씁니다.
// 같은 매장은 항상 같은 좌표가 나와 PAGE 2에서 한 매장으로 묶입니다.
export function demoStoreLocation(store, address = "") {
  let hash = 0x811c9dc5;
  for (const ch of `${store}|${address}`
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, ""))
    hash = Math.imul(hash ^ ch.codePointAt(0), 0x01000193) >>> 0;
  const angle = ((hash & 0xffff) / 0x10000) * 2 * Math.PI,
    meters = 300 + ((hash >>> 16) % 1200);
  const lat = DEMO_LOCATION.latitude + (meters * Math.sin(angle)) / 111320;
  const lng =
    DEMO_LOCATION.longitude +
    (meters * Math.cos(angle)) /
      (111320 * Math.cos((DEMO_LOCATION.latitude * Math.PI) / 180));
  return { latitude: +lat.toFixed(6), longitude: +lng.toFixed(6) };
}
export function createDemo() {
  const make = (id, store, date, category, totalMinor, items) => ({
    id,
    store,
    date,
    category,
    totalMinor,
    items: items || [{ name: store, quantity: 1, unitMinor: totalMinor }],
    currency: "JPY",
    rate: 9.24,
    shareConsent: false,
    demo: true,
    address: "",
    location: null,
    recordedAt: "2026-10-27T00:00:00Z",
  });
  return {
    version: 1,
    trip: {
      city: "도쿄",
      country: "일본",
      start: "2026-10-24",
      end: "2026-10-30",
      budget: 1000000,
      currency: "JPY",
      rate: 9.24,
    },
    receipts: [
      make("demo-hotel", "호텔 하루 신주쿠", "2026-10-24", "숙박", 59400),
      make("demo-shop", "베이직웨어 신주쿠점", "2026-10-25", "쇼핑", 8980),
      make("demo-cafe", "카페 모쿠", "2026-10-27", "음식", 1240),
      make("demo-market", "데일리마트 · 시연 매장", "2026-10-27", "음식", 996, [
        {
          name: "DORITOS ナチョチーズ 60G",
          nameKo: "도리토스 나초치즈 60g",
          quantity: 2,
          unitMinor: 158,
        },
        {
          name: "コカ・コーラ 500ML",
          nameKo: "코카콜라 500ml",
          quantity: 2,
          unitMinor: 160,
        },
        {
          name: "おにぎり 鮭",
          nameKo: "주먹밥 연어",
          quantity: 2,
          unitMinor: 180,
        },
      ]),
      make("demo-metro", "교통카드 충전", "2026-10-26", "교통", 3000),
      make(
        "demo-museum",
        "니시신주쿠 스카이 전망대",
        "2026-10-26",
        "관광",
        2400,
      ),
    ],
  };
}
