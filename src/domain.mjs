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
// 거리순은 조회 위치(시연은 신주쿠역)에서 가까운 순입니다. 추천순은 서버가 가격·인기·최근성·거리와 내 가계부 요약으로 정합니다.
export const BROWSE_SORTS = [
  { name: "추천순", ready: true },
  { name: "가격순", ready: true },
  { name: "구매수", ready: true },
  { name: "최신순", ready: true },
  { name: "거리순", ready: true },
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
// 아직 정하지 않은 여행입니다. 통화는 환산이 필요 없는 원화로 둡니다.
export const EMPTY_TRIP = Object.freeze({
  city: "",
  country: "",
  start: "",
  end: "",
  budget: 0,
  currency: "KRW",
  rate: 1,
});
// 처음 실행할 때의 가계부입니다. 여행과 영수증을 모두 비워 두고, 첫 영수증이나 여행 설정으로 정합니다.
export function createInitialState() {
  return { version: 1, trip: { ...EMPTY_TRIP }, receipts: [] };
}
// 여행 도시·국가·기간이 모두 정해졌는지 봅니다. 서버는 이 값이 없는 여행을 저장하지 않습니다.
export function tripReady(trip) {
  return (
    !!trip?.city?.trim() &&
    !!trip?.country?.trim() &&
    validDate(trip.start) &&
    validDate(trip.end) &&
    trip.start <= trip.end
  );
}
// 영수증 통화로 여행 지역을 짐작합니다. 유로는 쓰는 나라가 여럿이라 유럽으로 둡니다.
export const CURRENCY_REGIONS = {
  JPY: "일본",
  THB: "태국",
  USD: "미국",
  EUR: "유럽",
  KRW: "한국",
};
// 사용자가 여행을 직접 입력하지 않아도 되도록 영수증으로 여행을 채웁니다.
// 여행을 정하지 않았으면 비어 있는 도시·국가와 기간·통화·환율을 첫 영수증으로 채우고,
// 정했으면 영수증 구매일이 들어가도록 기간만 넓힙니다(줄이지 않음). 시연 영수증은 쓰지 않습니다.
export function tripWithReceipt(trip, receipt) {
  if (receipt.demo || !validDate(receipt.date)) return trip;
  const start =
    validDate(trip.start) && trip.start <= receipt.date
      ? trip.start
      : receipt.date;
  const end =
    validDate(trip.end) && trip.end >= receipt.date ? trip.end : receipt.date;
  if (tripReady(trip))
    return start === trip.start && end === trip.end
      ? trip
      : { ...trip, start, end };
  const region = CURRENCY_REGIONS[receipt.currency] || "";
  return {
    ...trip,
    city: trip.city.trim() || region,
    country: trip.country.trim() || region,
    start,
    end,
    currency: receipt.currency,
    rate: receipt.rate,
  };
}
// 예전 버전이 처음 실행할 때 넣던 기본 시연 영수증(파리·도쿄)의 id입니다.
const DEFAULT_DEMO_IDS = new Set([
  "demo-hotel",
  "demo-shop",
  "demo-cafe",
  "demo-market",
  "demo-metro",
  "demo-museum",
]);
// 예전 버전이 처음 실행할 때 넣던 기본 여행(파리·도쿄)입니다.
const DEFAULT_TRIPS = [
  {
    city: "파리",
    country: "프랑스",
    start: "2026-10-24",
    end: "2026-10-30",
    budget: 1000000,
    currency: "EUR",
    rate: 1600,
  },
  {
    city: "도쿄",
    country: "일본",
    start: "2026-10-24",
    end: "2026-10-30",
    budget: 1000000,
    currency: "JPY",
    rate: 9.24,
  },
];
// 저장된 가계부에서 예전 기본값만 뺍니다. 기본 시연 영수증은 지우고, 사용자가 바꾸지 않은 기본 여행은 비웁니다.
// 직접 등록하거나 체험으로 만든 영수증, 사용자가 고친 여행은 그대로 둡니다.
export function withoutDefaults(state) {
  const defaultTrip = DEFAULT_TRIPS.some((d) =>
    Object.keys(d).every((key) => state.trip?.[key] === d[key]),
  );
  return {
    ...state,
    trip: defaultTrip ? { ...EMPTY_TRIP } : state.trip,
    receipts: state.receipts.filter(
      (r) => !(r.demo && DEFAULT_DEMO_IDS.has(r.id)),
    ),
  };
}
// 가계부 '다른 여행자와 비교': 일차별 누적 지출 (0일차 = 출발 전, 1일차 = 여행 첫날).
const dayNumber = (date) => Math.round(Date.parse(date) / 86400000);
// 구매일 → 일차. 여행 시작 전은 0일차, 종료일 뒤는 마지막 일차로 넣습니다(서버와 같은 규칙).
export function dayIndex(start, days, date) {
  return Math.max(0, Math.min(days, dayNumber(date) - dayNumber(start) + 1));
}
// 내 일차별 누적 지출(원). 0일차부터 오늘(여행이 끝났으면 마지막 날, 시작 전이면 0일차)까지 돌려줍니다.
// 여행을 아직 정하지 않았으면 가장 이른 영수증 날짜를 1일차로 봅니다.
export function myCumulative(state, today) {
  const receipts = state.receipts.filter((r) => validDate(r.date));
  const ready = tripReady(state.trip);
  if (!ready && !receipts.length) return [0];
  const start = ready
    ? state.trip.start
    : receipts.map((r) => r.date).sort()[0];
  const end = ready
    ? state.trip.end
    : receipts
        .map((r) => r.date)
        .sort()
        .at(-1);
  const days = dayNumber(end) - dayNumber(start) + 1;
  const todayIndex = dayIndex(start, days, today);
  const last = Math.max(
    todayIndex,
    ...receipts.map((r) => dayIndex(start, days, r.date)),
  );
  const byDay = Array(last + 1).fill(0);
  for (const r of receipts)
    byDay[dayIndex(start, days, r.date)] += toWon(
      r.totalMinor,
      r.currency,
      r.rate,
    );
  let sum = 0;
  return byDay.map((v) => (sum += v));
}
// 드롭다운 항목: "0일차 · 출발 전", "1일차 · 10.24", 오늘이면 "· 오늘"
export function cumulativeDayLabel(state, day, today) {
  if (day === 0) return "0일차 · 출발 전";
  const start = tripReady(state.trip)
    ? state.trip.start
    : state.receipts.map((r) => r.date).sort()[0];
  if (!start) return `${day}일차`;
  const date = new Date((dayNumber(start) + day - 1) * 86400000)
    .toISOString()
    .slice(0, 10);
  return `${day}일차 · ${date.slice(5).replace("-", ".")}${date === today ? " · 오늘" : ""}`;
}
// 고른 일차의 막대 두 개(나·다른 여행자)와 차이 문구용 값.
// 다른 여행자 값이 없으면(비교 여행자 5명 미만, 또는 그 일차까지 여행한 사람이 5명 미만) average는 null입니다.
// 차이가 평균의 3% 안쪽이면 '비슷함'입니다.
export function cumulativeBars(mine, peers, day) {
  const me = mine[day] ?? mine.at(-1) ?? 0;
  const average = peers && day < peers.length ? peers[day] : null;
  if (average == null)
    return { me, average, diff: 0, percent: 0, tone: "none" };
  const diff = me - average;
  const percent = average ? Math.round((Math.abs(diff) / average) * 100) : 0;
  const tone =
    Math.abs(diff) <= average * 0.03 ? "same" : diff > 0 ? "more" : "less";
  return { me, average, diff, percent, tone };
}
// 가계부 엑셀(.xlsx): 영수증 품목 한 줄씩. 새 라이브러리 없이 시트 XML을 만들어 압축하지 않은 zip으로 묶습니다.
// 구매일은 날짜, 금액·수량·환율은 숫자 셀이라 엑셀에서 바로 합계·정렬할 수 있습니다.
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// [열 제목, 열 너비]
const LEDGER_COLUMNS = [
  ["구매일", 11],
  ["매장명", 20],
  ["매장명(한국어)", 20],
  ["매장 주소", 28],
  ["가계부 카테고리", 10],
  ["상품명(원어)", 26],
  ["상품명(한국어)", 22],
  ["수량", 6],
  ["개당 가격", 11],
  ["품목 합계", 11],
  ["통화", 6],
  ["적용 환율", 9],
  ["품목 원화 환산", 13],
  ["영수증 총액", 11],
  ["영수증 원화 환산", 14],
  ["시연", 5],
];
// 셀 서식 번호(styles.xml의 cellXfs 순서): 0 기본, 1 제목, 2 정수 #,##0, 3 소수 #,##0.00, 4 날짜 yyyy-mm-dd
const STYLE = { header: 1, integer: 2, decimal: 3, date: 4 };
// 엑셀 날짜 번호: 1970-01-01이 25569
const excelDate = (date) => dayNumber(date) + 25569;
function ledgerRows(state) {
  return [...state.receipts]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .flatMap((r) => {
      const scale = CURRENCIES[r.currency].scale;
      const amount = (minor) => ({
        value: minor / scale,
        style: scale === 1 ? STYLE.integer : STYLE.decimal,
      });
      const krw = (minor) => ({
        value: toWon(minor, r.currency, r.rate),
        style: STYLE.integer,
      });
      return r.items.map((i) => [
        { value: excelDate(r.date), style: STYLE.date },
        r.store,
        r.storeKo || "",
        r.address || "",
        r.category,
        i.name,
        i.nameKo || "",
        i.quantity,
        amount(i.unitMinor),
        amount(i.unitMinor * i.quantity),
        r.currency,
        Number(r.rate),
        krw(i.unitMinor * i.quantity),
        amount(r.totalMinor),
        krw(r.totalMinor),
        r.demo ? "Y" : "",
      ]);
    });
}
// XML 글자: 특수문자를 바꾸고, XML에 쓸 수 없는 제어 문자는 뺍니다.
const xmlText = (value) =>
  String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
// 열 번호 → 엑셀 열 이름 (0 → A, 26 → AA)
const columnName = (index) =>
  (index >= 26 ? columnName(Math.floor(index / 26) - 1) : "") +
  String.fromCharCode(65 + (index % 26));
// 셀 하나. 문자열은 공유 문자열 표 없이 셀 안에 넣고(inlineStr), 빈 값은 셀을 만들지 않습니다.
function xlsxCell(cell, ref) {
  const { value, style } =
    cell !== null && typeof cell === "object" ? cell : { value: cell, style: 0 };
  const s = style ? ` s="${style}"` : "";
  if (typeof value === "number")
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : "";
  if (value == null || value === "") return "";
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
function ledgerSheetXml(state) {
  const header = LEDGER_COLUMNS.map(([title]) => ({
    value: title,
    style: STYLE.header,
  }));
  const rows = [header, ...ledgerRows(state)].map(
    (row, r) =>
      `<row r="${r + 1}">${row.map((cell, c) => xlsxCell(cell, columnName(c) + (r + 1))).join("")}</row>`,
  );
  const cols = LEDGER_COLUMNS.map(
    ([, width], c) =>
      `<col min="${c + 1}" max="${c + 1}" width="${width}" customWidth="1"/>`,
  ).join("");
  // 첫 줄(열 제목)은 스크롤해도 보이게 고정합니다.
  return (
    XML_HEAD +
    `<worksheet xmlns="${SHEET_NS}"><sheetViews><sheetView workbookViewId="0">` +
    `<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${cols}</cols><sheetData>${rows.join("")}</sheetData></worksheet>`
  );
}
const XLSX_STYLES =
  XML_HEAD +
  `<styleSheet xmlns="${SHEET_NS}">` +
  `<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>` +
  `<fonts count="2"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font></fonts>` +
  `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFEAF5FF"/></patternFill></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
  `<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
  `<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
export function ledgerXlsx(state) {
  return zip([
    [
      "[Content_Types].xml",
      XML_HEAD +
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      XML_HEAD +
        `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${DOC_REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      XML_HEAD +
        `<workbook xmlns="${SHEET_NS}" xmlns:r="${DOC_REL}"><sheets><sheet name="가계부" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      XML_HEAD +
        `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${DOC_REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${DOC_REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", XLSX_STYLES],
    ["xl/worksheets/sheet1.xml", ledgerSheetXml(state)],
  ]);
}
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
// 압축하지 않은(stored) zip: [파일 이름, 내용 문자열] 목록 → 바이트. 파일 이름은 UTF-8, 시각은 1980-01-01로 고정합니다.
function zip(files) {
  const utf8 = new TextEncoder();
  const entries = files.map(([name, text]) => {
    const data = utf8.encode(text);
    return { path: utf8.encode(name), data, crc: crc32(data) };
  });
  const size = entries.reduce(
    (n, e) => n + 30 + 46 + e.path.length * 2 + e.data.length,
    22,
  );
  const out = new Uint8Array(size),
    view = new DataView(out.buffer);
  let pos = 0;
  const u16 = (v) => {
    view.setUint16(pos, v, true);
    pos += 2;
  };
  const u32 = (v) => {
    view.setUint32(pos, v, true);
    pos += 4;
  };
  const bytes = (b) => {
    out.set(b, pos);
    pos += b.length;
  };
  // 로컬 헤더와 중앙 디렉터리가 함께 쓰는 26바이트: 버전, 플래그(UTF-8 이름), 저장 방식 0, 시각·날짜, CRC, 크기 2번, 이름 길이, 추가 필드 0
  const common = (e) => {
    u16(20);
    u16(0x0800);
    u16(0);
    u16(0);
    u16(0x21);
    u32(e.crc);
    u32(e.data.length);
    u32(e.data.length);
    u16(e.path.length);
    u16(0);
  };
  const offsets = entries.map((e) => {
    const at = pos;
    u32(0x04034b50);
    common(e);
    bytes(e.path);
    bytes(e.data);
    return at;
  });
  const directory = pos;
  entries.forEach((e, i) => {
    u32(0x02014b50);
    u16(20);
    common(e);
    u16(0); // 주석 길이
    u16(0); // 디스크 번호
    u16(0); // 내부 속성
    u32(0); // 외부 속성
    u32(offsets[i]);
    bytes(e.path);
  });
  const directorySize = pos - directory;
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(entries.length);
  u16(entries.length);
  u32(directorySize);
  u32(directory);
  u16(0);
  return out;
}
export const ledgerXlsxName = (trip, today) =>
  `여행WON해_가계부_${(trip.city || "여행").replace(/[\\/:*?"<>|\s]+/g, "_")}_${today}.xlsx`;
