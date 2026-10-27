import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemo,
  parseMoney,
  rateUnits,
  toWon,
  validateReceipt,
  normalizeProduct,
  summarize,
  comparePrices,
  publicPrices,
  distanceMeters,
  DEMO_LOCATION,
  DEMO_PRICES,
  fingerprint,
  validDate,
  spendingInsight,
  browseCategory,
  BROWSE_CATEGORIES,
  BROWSE_SORTS,
  DEMO_PURCHASES,
} from "../src/domain.mjs";

const receipt = (overrides = {}) => ({
  ...createDemo().receipts[3],
  id: "real-1",
  demo: false,
  ...overrides,
});
test("EUR 소수 금액을 부동소수점 누적 없이 센트 정수로 파싱한다", () => {
  assert.equal(parseMoney("1.80"), 180);
  assert.equal(parseMoney("0.29"), 29);
  assert.equal(parseMoney("1234", "JPY"), 1234);
  for (const value of [
    "-1",
    "1.001",
    "1e3",
    "",
    "NaN",
    "0",
    "1,000",
    "Infinity",
  ])
    assert.throws(() => parseMoney(value));
  assert.throws(() => parseMoney("1.5", "JPY"));
});
test("원화 환산은 정수 연산 후 원 단위 사사오입한다", () => {
  assert.equal(toWon(180, "EUR", 1600), 2880);
  assert.equal(toWon(1, "EUR", 1550), 16);
  assert.equal(toWon(2, "EUR", 1525), 31);
  assert.equal(toWon(180, "JPY", 9), 1620);
  assert.throws(() => toWon(10, "EUR", 0));
  assert.throws(() => toWon(10.1, "EUR", 1600));
});
test("소수 환율은 반올림 없이 끝까지 계산한 뒤 원 단위로 사사오입한다", () => {
  // 1000엔 × 8.3983 = 8398.3원 → 8398원 (정수 환율 8이면 8000원)
  assert.equal(toWon(1000, "JPY", 8.3983), 8398);
  assert.equal(toWon(1000, "JPY", "8.3983"), 8398);
  // 3.60유로 × 1477.87 = 5320.332원 → 5320원
  assert.equal(toWon(360, "EUR", 1477.87), 5320);
  // 0.5원 경계는 올림: 1엔 × 8.5 = 8.5원 → 9원
  assert.equal(toWon(1, "JPY", 8.5), 9);
  assert.equal(toWon(3, "KRW", 1), 3);
});
test("적용 환율은 0 초과 1,000,000 이하, 소수 4자리까지만 받는다", () => {
  assert.equal(rateUnits("8.3983"), 83983n);
  assert.equal(rateUnits(1600), 16_000_000n);
  assert.equal(rateUnits("0.0001"), 1n);
  assert.equal(rateUnits("1000000"), 10_000_000_000n);
  for (const value of [
    "0",
    "0.00001",
    "8.39831",
    "-1",
    "1,477.87",
    "1e3",
    "",
    "1000000.0001",
    null,
    Number.NaN,
  ])
    assert.equal(rateUnits(value), null, String(value));
  assert.throws(() => toWon(100, "JPY", "8.39831"), /환율/);
});
test("시연 영수증에서 예산, 소비 비중, 초과 금액을 계산한다", () => {
  const state = createDemo();
  const sum = summarize(state.receipts, state.trip.budget);
  assert.equal(sum.total, 665120);
  assert.equal(sum.remaining, 334880);
  assert.equal(
    sum.categories.reduce((s, c) => s + c.amount, 0),
    sum.total,
  );
  assert.ok(
    Math.abs(sum.categories.reduce((s, c) => s + c.ratio, 0) - 100) < 0.00001,
  );
  assert.equal(summarize(state.receipts, 600000).remaining, -65120);
  assert.match(spendingInsight(sum), /시연 평균/);
});
test("지출이 없으면 0 비율과 빈 상태 요약을 반환한다", () => {
  const summary = summarize([], 1000000);
  assert.equal(summary.total, 0);
  assert.ok(summary.categories.every((c) => c.ratio === 0));
  assert.match(spendingInsight(summary), /첫 영수증/);
});
test("유효한 상품별 내역을 등록하고 합계 불일치·잘못된 수량을 거부한다", () => {
  assert.equal(validateReceipt(receipt()).items.length, 3);
  assert.throws(() => validateReceipt(receipt({ totalMinor: 100 })), /합계/);
  assert.throws(
    () =>
      validateReceipt(
        receipt({ items: [{ name: "콜라", quantity: 1.5, unitMinor: 100 }] }),
      ),
    /수량/,
  );
  assert.throws(
    () => validateReceipt(receipt({ date: "2026-02-30" })),
    /구매일/,
  );
  assert.throws(() => validateReceipt(receipt({ items: [] })), /1개/);
  // 기존 정수 환율과 새 소수 환율을 모두 받고, 소수 5자리 환율은 거부한다.
  assert.equal(validateReceipt(receipt({ rate: 1477.87 })).rate, 1477.87);
  assert.throws(() => validateReceipt(receipt({ rate: 1477.87123 })), /환율/);
});
test("매장명·날짜·통화·금액을 기준으로 중복을 판별한다", () => {
  const a = receipt({ store: "  MARKET A  " }),
    b = receipt({ id: "different-id", store: "market a" });
  assert.equal(fingerprint(a), fingerprint(b));
  assert.notEqual(fingerprint(a), fingerprint({ ...b, currency: "USD" }));
});
test("동일 상품의 약어와 용량을 정규화하되 다른 용량은 구분한다", () => {
  assert.equal(
    normalizeProduct("COCA-COLA 0.5 L"),
    normalizeProduct("코카콜라 500ml"),
  );
  assert.equal(
    normalizeProduct("COKE 500 ML"),
    normalizeProduct("코카 콜라 500ml"),
  );
  assert.notEqual(
    normalizeProduct("코카콜라 500ml"),
    normalizeProduct("코카콜라 1L"),
  );
  assert.notEqual(
    normalizeProduct("코카콜라 zero 500ml"),
    normalizeProduct("코카콜라 500ml"),
  );
});
test("좌표로 거리를 계산하고 반경 밖의 기록과 다른 통화는 제외한다", () => {
  assert.equal(distanceMeters(DEMO_LOCATION, DEMO_LOCATION), 0);
  const distant = {
    ...DEMO_PRICES[0],
    id: "far",
    latitude: 37.5665,
    longitude: 126.978,
    unitMinor: 1,
  };
  const rows = comparePrices(
    [...DEMO_PRICES, distant],
    "Coca Cola 500ml",
    DEMO_LOCATION,
    "EUR",
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.map((r) => r.unitMinor),
    [180, 210, 250],
  );
  assert.equal(
    comparePrices(DEMO_PRICES, "코카콜라", DEMO_LOCATION, "JPY").length,
    0,
  );
  assert.equal(comparePrices(DEMO_PRICES, "", DEMO_LOCATION, "EUR").length, 0);
});
test("같은 매장의 과거 최저가 대신 최신 구매가격을 사용한다", () => {
  const old = { ...DEMO_PRICES[0], date: "2026-10-20", unitMinor: 100 };
  const fresh = { ...DEMO_PRICES[0], date: "2026-10-27", unitMinor: 220 };
  assert.equal(
    comparePrices([fresh, old], "코카콜라 500ml", DEMO_LOCATION, "EUR")[0]
      .unitMinor,
    220,
  );
});
test("다른 용량·다른 매장 주소를 하나의 상품 기록으로 덮어쓰지 않는다", () => {
  const a = DEMO_PRICES[0];
  const otherSize = { ...a, product: "코카콜라 1L", unitMinor: 300 };
  const otherBranch = {
    ...a,
    address: "같은 브랜드의 다른 지점 주소",
    latitude: a.latitude + 0.001,
  };
  assert.equal(
    comparePrices([a, otherSize, otherBranch], "코카콜라", DEMO_LOCATION, "EUR")
      .length,
    3,
  );
});
test("같은 매장 주소의 GPS 오차는 서로 다른 매장으로 만들지 않는다", () => {
  const a = { ...DEMO_PRICES[0], date: "2026-10-20" };
  const fresh = {
    ...a,
    date: "2026-10-27",
    latitude: a.latitude + 0.0001,
    unitMinor: 210,
  };
  const rows = comparePrices(
    [a, fresh],
    "코카콜라 500ml",
    DEMO_LOCATION,
    "EUR",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].unitMinor, 210);
});
test("명시적 공유 동의·주소·좌표가 있을 때만 공개 상품을 만든다", () => {
  assert.deepEqual(publicPrices(receipt()), []);
  const r = receipt({
    shareConsent: true,
    location: DEMO_LOCATION,
    address: "파리 시연 주소",
  });
  assert.equal(publicPrices(r).length, 3);
  assert.deepEqual(publicPrices({ ...r, demo: true }), []);
  // 동의 절차 없이 시연이 아닌 영수증은 모두 공유합니다.
  assert.equal(publicPrices({ ...r, shareConsent: false }).length, 3);
  assert.deepEqual(publicPrices({ ...r, location: null }), []);
  assert.deepEqual(publicPrices({ ...r, address: "" }), []);
});
test("공개 가격 데이터에서 사진·원화 지출·개인 정보를 제외한다", () => {
  const r = receipt({
    shareConsent: true,
    location: DEMO_LOCATION,
    address: "주소",
    cardNumber: "test-private",
    image: "test-image",
  });
  const rows = publicPrices(r);
  assert.equal(rows[0].unitMinor, 180);
  for (const key of [
    "image",
    "cardNumber",
    "rate",
    "totalMinor",
    "shareConsent",
    "quantity",
  ])
    assert.equal(key in rows[0], false);
});
test("달력에서 유효하지 않은 날짜를 거부한다", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validDate("2026-13-01"), false);
  assert.equal(validDate("2026-10-27"), true);
});
const purchase = (overrides = {}) => ({
  id: "purchase-test",
  store: "테스트 식당",
  address: "테스트 주소",
  latitude: DEMO_LOCATION.latitude,
  longitude: DEMO_LOCATION.longitude,
  product: "오늘의 메뉴",
  category: "식당",
  currency: "EUR",
  date: "2026-10-27",
  unitMinor: 1800,
  demo: true,
  ...overrides,
});
test("카테고리 거래 기록을 매장·상품별로 묶어 구매수와 최신 가격을 계산한다", () => {
  const rows = browseCategory(
    [
      purchase({ id: "a1", date: "2026-10-20", unitMinor: 1500 }),
      purchase({ id: "a2", date: "2026-10-26", unitMinor: 1800 }),
      purchase({ id: "a3", date: "2026-10-23", unitMinor: 1600 }),
      purchase({ id: "b1", product: "와인 1잔", unitMinor: 700 }),
      purchase({ id: "c1", category: "숙박", unitMinor: 9000 }),
    ],
    "식당",
    DEMO_LOCATION,
    "EUR",
  );
  assert.equal(rows.length, 2);
  const menu = rows.find((r) => r.product === "오늘의 메뉴");
  assert.equal(menu.count, 3);
  assert.equal(menu.unitMinor, 1800);
  assert.equal(menu.date, "2026-10-26");
});
test("카테고리 목록을 가격순·구매수·최신순으로 정렬하고 거리순은 비활성으로 둔다", () => {
  const records = [
    purchase({ id: "a", store: "A", date: "2026-10-20", unitMinor: 500 }),
    purchase({ id: "b1", store: "B", date: "2026-10-21", unitMinor: 900 }),
    purchase({ id: "b2", store: "B", date: "2026-10-22", unitMinor: 900 }),
    purchase({ id: "c", store: "C", date: "2026-10-27", unitMinor: 700 }),
  ];
  const order = (sort) =>
    browseCategory(records, "식당", DEMO_LOCATION, "EUR", sort).map(
      (r) => r.store,
    );
  assert.deepEqual(order("가격순"), ["A", "C", "B"]);
  assert.deepEqual(order("구매수"), ["B", "A", "C"]);
  assert.deepEqual(order("최신순"), ["C", "B", "A"]);
  assert.equal(BROWSE_SORTS.find((s) => s.name === "거리순").ready, false);
});
test("카테고리 조회는 다른 통화와 반경 3km 밖의 기록을 제외한다", () => {
  const rows = browseCategory(
    [
      purchase(),
      purchase({ id: "jpy", store: "엔화 매장", currency: "JPY" }),
      purchase({
        id: "far",
        store: "먼 매장",
        latitude: 37.5665,
        longitude: 126.978,
      }),
    ],
    "식당",
    DEMO_LOCATION,
    "EUR",
  );
  assert.deepEqual(
    rows.map((r) => r.store),
    ["테스트 식당"],
  );
});
test("시연 거래 기록은 모든 카테고리를 포함하고 시연 위치 반경 3km 안에 있다", () => {
  for (const c of BROWSE_CATEGORIES)
    assert.ok(
      browseCategory(DEMO_PURCHASES, c.name, DEMO_LOCATION, "EUR").length >= 2,
      c.name,
    );
  assert.ok(
    DEMO_PURCHASES.every(
      (r) => r.demo === true && distanceMeters(DEMO_LOCATION, r) <= 3000,
    ),
  );
});
test("원어와 한국어 상품명이 있으면 가격 비교는 한국어로 묶고 원어를 함께 남긴다", () => {
  const r = receipt({
    shareConsent: true,
    location: DEMO_LOCATION,
    address: "주소",
    totalMinor: 360,
    items: [
      {
        name: "COCA COLA 50CL",
        nameKo: "코카콜라 500ml",
        quantity: 2,
        unitMinor: 180,
      },
    ],
  });
  validateReceipt(r);
  const [row] = publicPrices(r);
  assert.equal(row.product, "코카콜라 500ml");
  assert.equal(row.original, "COCA COLA 50CL");
  assert.equal(row.normalized, "코카콜라500ml");
  assert.throws(() =>
    validateReceipt({
      ...r,
      items: [{ ...r.items[0], nameKo: "가".repeat(161) }],
    }),
  );
});
