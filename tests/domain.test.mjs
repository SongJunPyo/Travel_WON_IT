import test from "node:test";
import assert from "node:assert/strict";
import {
  createDemo,
  createInitialState,
  EMPTY_TRIP,
  tripReady,
  tripWithReceipt,
  withoutDefaults,
  parseMoney,
  rateUnits,
  toWon,
  validateReceipt,
  normalizeProduct,
  summarize,
  distanceMeters,
  DEMO_LOCATION,
  demoStoreLocation,
  storeLabel,
  storeOriginal,
  fingerprint,
  validDate,
  spendingInsight,
  recommendProfile,
  insightRequest,
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
  assert.equal(sum.total, 702388);
  assert.equal(sum.remaining, 297612);
  assert.equal(
    sum.categories.reduce((s, c) => s + c.amount, 0),
    sum.total,
  );
  assert.ok(
    Math.abs(sum.categories.reduce((s, c) => s + c.ratio, 0) - 100) < 0.00001,
  );
  assert.equal(summarize(state.receipts, 600000).remaining, -102388);
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
test("달력에서 유효하지 않은 날짜를 거부한다", () => {
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(validDate("2028-02-29"), true);
  assert.equal(validDate("2026-13-01"), false);
  assert.equal(validDate("2026-10-27"), true);
});
test("원어와 한국어 상품명을 함께 저장하고 한국어 이름 길이를 검사한다", () => {
  const r = receipt({
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
  assert.equal(validateReceipt(r).items[0].nameKo, "코카콜라 500ml");
  assert.throws(() =>
    validateReceipt({
      ...r,
      items: [{ ...r.items[0], nameKo: "가".repeat(161) }],
    }),
  );
});
test("원문·한국어 매장명과 PAGE 2 카테고리를 검사하고 화면에는 한국어 매장명을 먼저 보여 준다", () => {
  const r = receipt({
    store: "すし酒場さしす",
    storeKo: "스시 사카바 사시스",
    browseCategory: "식당",
  });
  assert.equal(validateReceipt(r).browseCategory, "식당");
  assert.equal(storeLabel(r), "스시 사카바 사시스");
  assert.equal(storeOriginal(r), "すし酒場さしす");
  assert.equal(storeLabel({ store: "카페 모쿠" }), "카페 모쿠");
  assert.equal(storeOriginal({ store: "카페 모쿠", storeKo: "카페 모쿠" }), "");
  assert.equal(
    validateReceipt(receipt({ browseCategory: null })).browseCategory,
    null,
  );
  assert.throws(
    () => validateReceipt(receipt({ browseCategory: "카페" })),
    /카테고리/,
  );
  assert.throws(
    () => validateReceipt(receipt({ storeKo: "가".repeat(121) })),
    /한국어 매장명/,
  );
});
test("시연 가계부는 도쿄·JPY이고 시연 위치는 신주쿠역이다", () => {
  const state = createDemo();
  assert.equal(state.trip.currency, "JPY");
  assert.ok(state.receipts.every((r) => r.currency === "JPY" && r.demo));
  assert.deepEqual(DEMO_LOCATION, { latitude: 35.6896, longitude: 139.7006 });
  assert.equal(distanceMeters(DEMO_LOCATION, DEMO_LOCATION), 0);
});
test("시연용 매장 좌표는 같은 매장이면 같고, 신주쿠역 300m~1.5km 안에 있다", () => {
  const a = demoStoreLocation("테스트 매장", "도쿄 신주쿠구");
  assert.deepEqual(a, demoStoreLocation(" 테스트  매장", "도쿄 신주쿠구"));
  assert.notDeepEqual(a, demoStoreLocation("다른 매장", "도쿄 신주쿠구"));
  for (const name of [
    "가",
    "나",
    "다",
    "라",
    "마",
    "DAILY MART",
    "카페 모쿠",
  ]) {
    const d = distanceMeters(DEMO_LOCATION, demoStoreLocation(name));
    assert.ok(d >= 290 && d <= 1510, `${name}: ${d}m`);
  }
});
test("추천순 개인화 요약은 남은 예산 비율과 가장 많이 쓴 카테고리를 돌려준다", () => {
  const state = createDemo();
  const sum = summarize(state.receipts, state.trip.budget);
  assert.deepEqual(recommendProfile(sum, state.trip.budget), {
    budgetLeft: 30,
    favorite: "숙박",
  });
  // 예산을 크게 넘으면 -100%로 자르고, 기록이 없으면 카테고리는 null입니다.
  assert.equal(
    recommendProfile(summarize(state.receipts, 100000), 100000).budgetLeft,
    -100,
  );
  assert.deepEqual(recommendProfile(summarize([], 1000000), 1000000), {
    budgetLeft: 100,
    favorite: null,
  });
});
test("소비 인사이트 요청은 여행 설정과 카테고리별 원화 합계만 담는다", () => {
  const state = createDemo();
  const body = insightRequest(state);
  assert.deepEqual(Object.keys(body), ["trip", "categories"]);
  assert.equal(body.trip, state.trip);
  assert.deepEqual(Object.keys(body.categories), [
    "음식",
    "쇼핑",
    "숙박",
    "교통",
    "관광",
    "기타",
  ]);
  assert.equal(
    Object.values(body.categories).reduce((s, v) => s + v, 0),
    702388,
  );
  // 매장·상품·영수증 원문은 보내지 않습니다.
  assert.ok(!JSON.stringify(body).includes("데일리마트"));
});
test("처음 실행하면 여행과 영수증이 모두 빈 가계부로 시작한다", () => {
  const state = createInitialState();
  assert.deepEqual(state.receipts, []);
  assert.deepEqual(state.trip, { ...EMPTY_TRIP });
  assert.equal(tripReady(state.trip), false);
  const summary = summarize(state.receipts, state.trip.budget);
  assert.equal(summary.total, 0);
  assert.equal(summary.percent, 0);
});
test("여행은 도시·국가·기간이 모두 있어야 설정된 것으로 본다", () => {
  const trip = {
    ...EMPTY_TRIP,
    city: "도쿄",
    country: "일본",
    start: "2026-10-24",
    end: "2026-10-30",
    budget: 600000,
  };
  assert.equal(tripReady(trip), true);
  for (const override of [
    { city: " " },
    { country: "" },
    { start: "2026-02-30" },
    { end: "" },
    { start: "2026-11-01" },
  ])
    assert.equal(tripReady({ ...trip, ...override }), false, JSON.stringify(override));
});
test("저장된 가계부에서 예전 기본 영수증과 바꾸지 않은 기본 여행(파리·도쿄)만 비운다", () => {
  const parisTrip = {
    city: "파리",
    country: "프랑스",
    start: "2026-10-24",
    end: "2026-10-30",
    budget: 1000000,
    currency: "EUR",
    rate: 1600,
  };
  const saved = {
    version: 1,
    trip: parisTrip,
    receipts: [
      // 예전 파리 시연 데이터와 같은 id
      { ...createDemo().receipts[0], id: "demo-hotel", store: "메종 블루 호텔", currency: "EUR" },
      { ...createDemo().receipts[4], id: "demo-metro", store: "파리 메트로", currency: "EUR" },
      receipt({ id: "real-1" }),
      receipt({ id: "receipt-sample", demo: true }),
      // id가 같아도 직접 등록한 영수증(demo 아님)은 지우지 않습니다.
      receipt({ id: "demo-cafe", demo: false }),
    ],
  };
  const cleaned = withoutDefaults(saved);
  assert.deepEqual(
    cleaned.receipts.map((r) => r.id),
    ["real-1", "receipt-sample", "demo-cafe"],
  );
  assert.deepEqual(cleaned.trip, { ...EMPTY_TRIP });
  assert.deepEqual(withoutDefaults({ ...saved, trip: createDemo().trip }).trip, { ...EMPTY_TRIP });
  // 예산을 바꾼 여행은 사용자가 고친 것이므로 그대로 둡니다.
  const edited = { ...parisTrip, budget: 600000 };
  assert.equal(withoutDefaults({ ...saved, trip: edited }).trip, edited);
  assert.equal(saved.receipts.length, 5);
});
test("여행을 정하지 않았으면 첫 실제 영수증의 통화·구매일·환율로 여행을 채운다", () => {
  const first = tripWithReceipt(
    { ...EMPTY_TRIP },
    receipt({ currency: "JPY", date: "2026-10-27", rate: 9.24 }),
  );
  assert.deepEqual(first, {
    ...EMPTY_TRIP,
    city: "일본",
    country: "일본",
    start: "2026-10-27",
    end: "2026-10-27",
    currency: "JPY",
    rate: 9.24,
  });
  assert.equal(tripReady(first), true);
  // 유로는 쓰는 나라가 여럿이라 유럽으로 둡니다.
  assert.equal(
    tripWithReceipt({ ...EMPTY_TRIP }, receipt({ currency: "EUR", rate: 1600 }))
      .city,
    "유럽",
  );
  // 사용자가 먼저 적은 도시는 그대로 둡니다.
  assert.equal(
    tripWithReceipt(
      { ...EMPTY_TRIP, city: "오사카" },
      receipt({ currency: "JPY" }),
    ).city,
    "오사카",
  );
  // 시연 영수증은 여행을 바꾸지 않습니다.
  const empty = { ...EMPTY_TRIP };
  assert.equal(tripWithReceipt(empty, receipt({ demo: true })), empty);
});
test("정한 여행은 영수증 구매일이 들어가도록 기간만 넓히고 줄이지 않는다", () => {
  const trip = {
    city: "도쿄",
    country: "일본",
    start: "2026-10-24",
    end: "2026-10-30",
    budget: 600000,
    currency: "JPY",
    rate: 9.24,
  };
  assert.equal(tripWithReceipt(trip, receipt({ date: "2026-10-27" })), trip);
  assert.deepEqual(
    tripWithReceipt(trip, receipt({ date: "2026-11-01", currency: "USD" })),
    {
      ...trip,
      end: "2026-11-01",
    },
  );
  assert.deepEqual(tripWithReceipt(trip, receipt({ date: "2026-10-22" })), {
    ...trip,
    start: "2026-10-22",
  });
  // 여러 영수증을 차례로 넣으면 가장 이른 날부터 가장 늦은 날까지가 됩니다.
  const filled = [
    receipt({ date: "2026-10-26", currency: "THB", rate: 40 }),
    receipt({ date: "2026-10-24" }),
    receipt({ date: "2026-10-29" }),
  ].reduce(tripWithReceipt, { ...EMPTY_TRIP });
  assert.equal(filled.city, "태국");
  assert.equal(filled.start, "2026-10-24");
  assert.equal(filled.end, "2026-10-29");
});
test("카테고리 둘러보기 거리순 정렬을 쓸 수 있다", async () => {
  const { BROWSE_SORTS } = await import("../src/domain.mjs");
  assert.equal(BROWSE_SORTS.find((s) => s.name === "거리순").ready, true);
});
