package com.wonit.travel;

import com.wonit.travel.api.DomainException;
import com.wonit.travel.api.ErrorCode;
import com.wonit.travel.ocr.ReceiptReader;
import com.wonit.travel.ocr.RecognizedReceipt;
import com.wonit.travel.price.PriceRanker;
import com.wonit.travel.insight.SpendingAdvisor;
import java.time.LocalDate;
import java.time.ZoneId;
import com.wonit.travel.rate.RateSource;
import com.wonit.travel.ledger.DeviceRepository;
import com.wonit.travel.ledger.ReceiptRepository;
import com.wonit.travel.ledger.TripRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Spring 7의 SpringExtension은 JUnit 6 전용입니다. 프로젝트 기준인 JUnit 5에서
// 실제 컨텍스트의 생명주기를 직접 관리하고 동일한 MockMvc API를 검증합니다.
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TravelApiTest {
    MockMvc mvc;
    JsonMapper mapper;
    DeviceRepository devices;
    TripRepository trips;
    ReceiptRepository receipts;
    // Claude 영수증 리더와 한국수출입은행 API 대신 쓰는 가짜 구현. 테스트에서는 외부를 부르지 않습니다.
    ReceiptReader reader = mock(ReceiptReader.class);
    RateSource rateSource = mock(RateSource.class);
    // 추천순 AI 재정렬 대신 쓰는 가짜 구현. 기본은 '키 없음'(configured=false)이라 점수 순서만 씁니다.
    PriceRanker ranker = mock(PriceRanker.class);
    // 소비 인사이트 AI 대신 쓰는 가짜 구현. 기본은 '키 없음'이라 규칙 기반 문장만 씁니다.
    SpendingAdvisor advisor = mock(SpendingAdvisor.class);
    ConfigurableApplicationContext context;
    private final String tokenA = "Bearer " + "a".repeat(64), tokenB = "Bearer " + "b".repeat(64);
    @BeforeAll void start() {
        context = new SpringApplicationBuilder(TravelWonhaeApplication.class)
                .initializers(ctx -> {
                    ((GenericApplicationContext) ctx).registerBean("testReceiptReader", ReceiptReader.class, () -> reader, bd -> bd.setPrimary(true));
                    ((GenericApplicationContext) ctx).registerBean("testRateSource", RateSource.class, () -> rateSource, bd -> bd.setPrimary(true));
                    ((GenericApplicationContext) ctx).registerBean("testPriceRanker", PriceRanker.class, () -> ranker, bd -> bd.setPrimary(true));
                    ((GenericApplicationContext) ctx).registerBean("testSpendingAdvisor", SpendingAdvisor.class, () -> advisor, bd -> bd.setPrimary(true));
                })
                .run("--server.port=0", "--spring.datasource.url=jdbc:h2:mem:wonhae-tests", "--spring.jpa.hibernate.ddl-auto=create-drop");
        mvc = MockMvcBuilders.webAppContextSetup((WebApplicationContext) context)
                .addFilters(context.getBean(com.wonit.travel.api.RequestLimitFilter.class)).build();
        mapper = context.getBean(JsonMapper.class);
        devices = context.getBean(DeviceRepository.class);
        trips = context.getBean(TripRepository.class);
        receipts = context.getBean(ReceiptRepository.class);
    }
    @AfterAll void stop() { if (context != null) context.close(); }
    @BeforeEach void clean() { receipts.deleteAll(); trips.deleteAll(); devices.deleteAll(); reset(reader, rateSource, ranker, advisor); }
    // 도쿄 신주쿠역 근처 시연 위치입니다.
    private static final double LAT = 35.6896, LNG = 139.7006;
    private int nextId = 0;
    private Map<String, Object> receipt(String store, double latitude, double longitude, String date, long unitMinor, boolean share) {
        return new HashMap<>(Map.ofEntries(
                Map.entry("id", "receipt-" + (++nextId)), Map.entry("store", store), Map.entry("address", store + " 주소"),
                Map.entry("location", Map.of("latitude", latitude, "longitude", longitude)),
                Map.entry("category", "음식"), Map.entry("browseCategory", "식당"), Map.entry("date", date),
                Map.entry("currency", "JPY"), Map.entry("rate", 9.24), Map.entry("totalMinor", unitMinor), Map.entry("shareConsent", share),
                Map.entry("demo", false), Map.entry("recordedAt", date + "T10:00:00Z"),
                Map.entry("items", List.of(Map.of("name", "DORITOS NACHO 150G", "nameKo", "도리토스 나초 150g", "quantity", 1, "unitMinor", unitMinor)))));
    }
    private Map<String, Object> receipt() { return receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-27", 330, true); }
    private Map<String, Object> trip() {
        return new HashMap<>(Map.of("city", "도쿄", "country", "일본", "start", "2026-10-24", "end", "2026-10-30",
                "budget", 1_000_000, "currency", "JPY", "rate", 9.24));
    }
    // 앱처럼 이 기기의 가계부(여행 + 영수증)를 통째로 저장합니다.
    private ResultActions save(String token, List<?> rows) throws Exception {
        var state = Map.of("version", 1, "trip", trip(), "receipts", rows);
        return mvc.perform(put("/ledger").header("Authorization", token).contentType("application/json").content(mapper.writeValueAsString(state)));
    }
    private ResultActions ledger(String token) throws Exception {
        return mvc.perform(get("/ledger").header("Authorization", token));
    }
    private ResultActions prices(String query) throws Exception {
        return mvc.perform(get("/prices?currency=JPY&latitude=" + LAT + "&longitude=" + LNG + query));
    }
    @Test void 서버_상태() throws Exception {
        mvc.perform(get("/health")).andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
    }
    @Test void 없는_주소는_서버_오류가_아닌_404로_응답한다() throws Exception {
        mvc.perform(get("/")).andExpect(status().isNotFound()).andExpect(jsonPath("$.error").exists());
    }
    @Test void 저장한_적_없는_기기는_빈_가계부를_받는다() throws Exception {
        ledger(tokenA).andExpect(status().isOk()).andExpect(jsonPath("$.state").isEmpty());
        assertThat(devices.count()).isZero();
    }
    @Test void 가계부를_통째로_저장하고_앱_형식으로_다시_읽는다() throws Exception {
        save(tokenA, List.of(receipt())).andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        ledger(tokenA).andExpect(status().isOk()).andExpect(jsonPath("$.state.version").value(1))
                .andExpect(jsonPath("$.state.trip.city").value("도쿄")).andExpect(jsonPath("$.state.trip.rate").value(9.24))
                .andExpect(jsonPath("$.state.trip.budget").value(1_000_000))
                .andExpect(jsonPath("$.state.receipts.length()").value(1)).andExpect(jsonPath("$.state.receipts[0].id").isString())
                .andExpect(jsonPath("$.state.receipts[0].store").value("테스트 매장 A"))
                .andExpect(jsonPath("$.state.receipts[0].items[0].nameKo").value("도리토스 나초 150g"))
                .andExpect(jsonPath("$.state.receipts[0].shareConsent").value(true)).andExpect(jsonPath("$.state.receipts[0].demo").value(false))
                .andExpect(jsonPath("$.state.receipts[0].recordedAt").value("2026-10-27T10:00:00Z"));
        ledger(tokenB).andExpect(jsonPath("$.state").isEmpty());
        assertThat(devices.count()).isEqualTo(1);
    }
    @Test void 다시_저장하면_빠진_영수증은_지우고_다른_기기의_가계부는_그대로다() throws Exception {
        var kept = receipt();
        save(tokenA, List.of(kept, receipt("테스트 매장 B", 35.6930, 139.7040, "2026-10-26", 280, true))).andExpect(status().isOk());
        save(tokenB, List.of(receipt())).andExpect(status().isOk());
        save(tokenA, List.of(kept)).andExpect(status().isOk());
        ledger(tokenA).andExpect(jsonPath("$.state.receipts.length()").value(1)).andExpect(jsonPath("$.state.receipts[0].store").value("테스트 매장 A"));
        ledger(tokenB).andExpect(jsonPath("$.state.receipts.length()").value(1));
        assertThat(receipts.count()).isEqualTo(2);
        assertThat(trips.count()).isEqualTo(2);
    }
    @Test void 시연_영수증은_서버에_저장하지_않는다() throws Exception {
        var demo = receipt(); demo.put("demo", true);
        save(tokenA, List.of(demo, receipt())).andExpect(status().isOk());
        assertThat(receipts.count()).isEqualTo(1);
    }
    @Test void 매장_위치가_없는_영수증은_저장하되_공유하지_않는다() throws Exception {
        var noLocation = receipt(); noLocation.remove("location");
        save(tokenA, List.of(noLocation)).andExpect(status().isOk());
        ledger(tokenA).andExpect(jsonPath("$.state.receipts[0].shareConsent").value(false))
                .andExpect(jsonPath("$.state.receipts[0].location").isEmpty());
        prices("").andExpect(jsonPath("$.records.length()").value(0));
    }
    @Test void 기기토큰이_없는_요청은_거부한다() throws Exception {
        mvc.perform(put("/ledger").contentType("application/json").content(mapper.writeValueAsString(Map.of("version", 1, "trip", trip(), "receipts", List.of()))))
                .andExpect(status().isUnauthorized());
        ledger("Bearer short").andExpect(status().isUnauthorized());
    }
    @Test void 잘못된_가계부는_거부하고_저장된_기록을_바꾸지_않는다() throws Exception {
        save(tokenA, List.of(receipt())).andExpect(status().isOk());
        var item = Map.of("name", "X", "quantity", 0, "unitMinor", 330);
        for (var override : List.<Map<String, Object>>of(Map.of("category", "카페"), Map.of("browseCategory", "카페"), Map.of("date", "2026-02-30"),
                Map.of("currency", "XXX"), Map.of("totalMinor", 331), Map.of("rate", 0), Map.of("rate", 9.12345),
                Map.of("items", List.of(item)), Map.of("location", Map.of("latitude", 100, "longitude", 0)), Map.of("store", " "), Map.of("id", ""))) {
            var body = receipt(); body.putAll(override);
            save(tokenA, List.of(body)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").exists());
        }
        var badTrip = new HashMap<>(Map.of("version", 1, "trip", Map.of("city", "도쿄"), "receipts", List.of()));
        mvc.perform(put("/ledger").header("Authorization", tokenA).contentType("application/json").content(mapper.writeValueAsString(badTrip)))
                .andExpect(status().isBadRequest());
        ledger(tokenA).andExpect(jsonPath("$.state.receipts.length()").value(1)).andExpect(jsonPath("$.state.receipts[0].totalMinor").value(330));
    }
    @Test void 소수_단가를_조용히_절사하지_않는다() throws Exception {
        var body = receipt(); body.put("items", List.of(Map.of("name", "X", "quantity", 1, "unitMinor", 330.5)));
        save(tokenA, List.of(body)).andExpect(status().isBadRequest());
    }
    @Test void PAGE2_카테고리_조회는_반경_안의_공유_영수증을_매장별_최근가격과_구매수로_묶는다() throws Exception {
        save(tokenB, List.of(receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-26", 300, true),
                receipt("테스트 매장 B", 35.6930, 139.7040, "2026-10-25", 280, true),
                receipt("오사카 매장", 34.7025, 135.4959, "2026-10-27", 100, true),
                receipt("비공개 매장", 35.6900, 139.7000, "2026-10-27", 90, false))).andExpect(status().isOk());
        save(tokenA, List.of(receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-27", 330, true))).andExpect(status().isOk());
        prices("&category=음식").andExpect(status().isOk()).andExpect(jsonPath("$.records.length()").value(2))
                .andExpect(jsonPath("$.records[0].store").value("테스트 매장 B")).andExpect(jsonPath("$.records[0].count").value(1))
                .andExpect(jsonPath("$.records[1].unitMinor").value(330)).andExpect(jsonPath("$.records[1].count").value(2))
                .andExpect(jsonPath("$.records[1].date").value("2026-10-27")).andExpect(jsonPath("$.records[1].product").value("도리토스 나초 150g"))
                .andExpect(jsonPath("$.records[1].distance").isNumber());
        prices("&category=음식&sort=구매수").andExpect(jsonPath("$.records[0].store").value("테스트 매장 A"));
        prices("&category=음식&sort=최신순").andExpect(jsonPath("$.records[0].date").value("2026-10-27"));
        // 거리순: 조회 위치(신주쿠역)에서 가까운 매장 A가 먼저입니다.
        prices("&category=음식&sort=거리순").andExpect(status().isOk())
                .andExpect(jsonPath("$.records[0].store").value("테스트 매장 A"))
                .andExpect(jsonPath("$.records[1].store").value("테스트 매장 B"));
        prices("&category=숙박").andExpect(jsonPath("$.records.length()").value(0));
    }
    @Test void 추천순은_가격_인기_최근성_거리를_합친_점수로_정렬하고_이유를_붙인다() throws Exception {
        save(tokenB, List.of(receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-26", 300, true),
                receipt("테스트 매장 B", 35.6930, 139.7040, "2026-10-25", 280, true),
                receipt("테스트 매장 C", 35.7100, 139.7006, "2026-10-27", 250, true))).andExpect(status().isOk());
        save(tokenA, List.of(receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-27", 330, true))).andExpect(status().isOk());
        // A: 가장 비싸지만 구매 2회·가장 가까움, C: 주변 최저가지만 2km 넘게 떨어짐
        for (String budget : List.of("", "&budgetLeft=10&favorite=음식"))
            prices("&q=doritos&sort=추천순" + budget)
                    .andExpect(status().isOk()).andExpect(jsonPath("$.records.length()").value(3))
                    .andExpect(jsonPath("$.records[0].store").value("테스트 매장 A"))
                    .andExpect(jsonPath("$.records[0].reason").value("구매 2회로 가장 많음"))
                    .andExpect(jsonPath("$.records[1].store").value("테스트 매장 B"))
                    .andExpect(jsonPath("$.records[2].store").value("테스트 매장 C"))
                    .andExpect(jsonPath("$.records[2].reason").value("주변 최저가"))
                    .andExpect(jsonPath("$.records[0].ai").value(false));
        // 다른 정렬에는 추천 이유를 붙이지 않습니다.
        prices("&q=doritos").andExpect(jsonPath("$.records[0].store").value("테스트 매장 C"))
                .andExpect(jsonPath("$.records[0].reason").isEmpty());
        prices("&q=doritos&budgetLeft=500").andExpect(status().isBadRequest());
        prices("&q=doritos&favorite=카페").andExpect(status().isBadRequest());
    }
    @Test void 추천순_AI는_후보_안에서_3개만_골라_맨_위에_두고_실패하면_점수_순서를_쓴다() throws Exception {
        // D는 다른 상품(쿨랜치)이고 멀리 있어 점수가 가장 낮습니다.
        var ranch = receipt("테스트 매장 D", 35.7150, 139.7006, "2026-10-20", 400, true);
        ranch.put("items", List.of(Map.of("name", "DORITOS COOL RANCH 150G", "quantity", 1, "unitMinor", 400)));
        save(tokenB, List.of(receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-26", 300, true),
                receipt("테스트 매장 B", 35.6930, 139.7040, "2026-10-25", 280, true),
                receipt("테스트 매장 C", 35.7100, 139.7006, "2026-10-27", 250, true), ranch)).andExpect(status().isOk());
        save(tokenA, List.of(receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-27", 330, true))).andExpect(status().isOk());
        var byScore = mvc.perform(get("/prices?currency=JPY&latitude=" + LAT + "&longitude=" + LNG + "&q=doritos")).andReturn().getResponse().getContentAsString();
        var ids = mapper.readTree(byScore).get("records");
        String a = null, b = null, c = null, d = null;
        for (var r : ids) switch (r.get("store").asString()) {
            case "테스트 매장 A" -> a = r.get("id").asString();
            case "테스트 매장 B" -> b = r.get("id").asString();
            case "테스트 매장 C" -> c = r.get("id").asString();
            default -> d = r.get("id").asString();
        }
        when(ranker.configured()).thenReturn(true);
        // C를 맨 앞으로, 없는 id와 중복 id, 너무 긴 이유를 섞고, 3개를 넘겨(D 다음 B) 돌려줍니다.
        when(ranker.rank(any(), any())).thenReturn(List.of(new PriceRanker.Pick(c, "주변보다 11% 저렴해요\n"),
                new PriceRanker.Pick("없는-id", "무시"), new PriceRanker.Pick(c, "중복"), new PriceRanker.Pick(a, "가".repeat(60)),
                new PriceRanker.Pick(d, "다른 맛도 있어요"), new PriceRanker.Pick(b, "네 번째는 버림")));
        // 'AI 추천'은 유효한 앞의 3개(C, A, D)뿐이고, 나머지 B는 점수 순서·규칙 이유로 뒤에 붙습니다.
        for (int i = 0; i < 2; i++)
            prices("&q=doritos&sort=추천순").andExpect(status().isOk()).andExpect(jsonPath("$.records.length()").value(4))
                    .andExpect(jsonPath("$.records[0].store").value("테스트 매장 C"))
                    .andExpect(jsonPath("$.records[0].reason").value("주변보다 11% 저렴해요"))
                    .andExpect(jsonPath("$.records[0].ai").value(true))
                    .andExpect(jsonPath("$.records[1].store").value("테스트 매장 A"))
                    .andExpect(jsonPath("$.records[1].reason").value("가".repeat(40)))
                    .andExpect(jsonPath("$.records[2].store").value("테스트 매장 D"))
                    .andExpect(jsonPath("$.records[2].ai").value(true))
                    .andExpect(jsonPath("$.records[3].store").value("테스트 매장 B"))
                    .andExpect(jsonPath("$.records[3].reason").value("도보 약 7분"))
                    .andExpect(jsonPath("$.records[3].ai").value(false));
        // 같은 조건·같은 후보는 캐시를 써서 AI를 한 번만 부릅니다.
        verify(ranker, times(1)).rank(any(), any());
        // AI가 실패하면(시간 초과 등) 1단계 점수 순서와 규칙 이유를 그대로 씁니다.
        when(ranker.rank(any(), any())).thenThrow(new IllegalStateException("추천 AI 시간 초과"));
        prices("&q=doritos&sort=추천순&budgetLeft=10").andExpect(status().isOk())
                .andExpect(jsonPath("$.records[0].store").value("테스트 매장 A"))
                .andExpect(jsonPath("$.records[0].reason").value("구매 2회로 가장 많음"))
                .andExpect(jsonPath("$.records[0].ai").value(false));
        // 추천순이 아닌 정렬은 AI를 부르지 않습니다.
        prices("&q=doritos&sort=구매수").andExpect(status().isOk());
        verify(ranker, times(2)).rank(any(), any());
    }
    // 소비 인사이트: 최근 1달 안에 여행을 마친 일본 여행자 5명(각 5일, 예산 500,000원, 음식 200,000원 + 숙박 300,000원)을 저장합니다.
    // 도시가 달라도(도쿄·오사카) 같은 나라면 비교 기준에 들어가고, 1달보다 전에 끝난 여행과 다른 나라 여행은 빠집니다.
    private final LocalDate today = LocalDate.now(ZoneId.of("Asia/Seoul"));
    private String peerToken(int i) { return "Bearer " + ("peer" + i).repeat(12); }
    private void savePeers() throws Exception {
        for (int i = 1; i <= 5; i++) savePeer(i, i % 2 == 0 ? "오사카" : "도쿄", "일본", today.minusDays(20));
        savePeer(6, "도쿄", "일본", today.minusMonths(1).minusDays(5));
        savePeer(7, "타이베이", "대만", today.minusDays(20));
    }
    private void savePeer(int i, String city, String country, LocalDate start) throws Exception {
        var food = receipt("피어 식당 " + i, 35.69, 139.70, start.plusDays(2).toString(), 20000, true);
        food.put("rate", 10);
        var hotel = receipt("피어 호텔 " + i, 35.69, 139.70, start.toString(), 30000, true);
        hotel.put("rate", 10); hotel.put("category", "숙박");
        var trip = trip();
        trip.put("city", city); trip.put("country", country);
        trip.put("start", start.toString()); trip.put("end", start.plusDays(4).toString());
        trip.put("budget", 500_000); trip.put("rate", 10);
        mvc.perform(put("/ledger").header("Authorization", peerToken(i)).contentType("application/json")
                .content(mapper.writeValueAsString(Map.of("version", 1, "trip", trip, "receipts", List.of(food, hotel)))))
                .andExpect(status().isOk());
    }
    // 내 여행: 7일 중 5일째(오늘 포함), 예산 1,000,000원, 음식 450,000원 + 숙박 250,000원
    private ResultActions insight(String token, long food, long hotel) throws Exception {
        var trip = trip();
        trip.put("start", today.minusDays(4).toString()); trip.put("end", today.plusDays(2).toString());
        var body = Map.of("trip", trip, "categories", Map.of("음식", food, "숙박", hotel));
        var request = post("/insight").contentType("application/json").content(mapper.writeValueAsString(body));
        return mvc.perform(token == null ? request : request.header("Authorization", token));
    }
    @Test void 소비_인사이트는_최근_1달_안에_여행을_마친_같은_나라_여행자와_비교한_숫자로_규칙_문장을_만든다() throws Exception {
        savePeers();
        insight(null, 450_000, 250_000).andExpect(status().isOk())
                .andExpect(jsonPath("$.ai").value(false))
                .andExpect(jsonPath("$.headline").value("예산 안에서 잘 쓰고 있어요"))
                .andExpect(jsonPath("$.body").value("예산의 70%를 썼고, 여행은 71% 지났어요. 음식 비중은 64%로, 최근 1달 안에 여행을 마친 일본 여행자 5명 평균보다 24%p 높아요."))
                .andExpect(jsonPath("$.tip").value("남은 2일은 하루 150,000원 안에서 쓰면 예산을 지킬 수 있어요."))
                .andExpect(jsonPath("$.facts[0]").value("예산 70% 사용 · 여행 71% 경과"))
                .andExpect(jsonPath("$.facts[1]").value("하루 평균 140,000원 · 여행자 중앙값 100,000원"))
                .andExpect(jsonPath("$.facts[2]").value("이 속도면 총 980,000원"))
                .andExpect(jsonPath("$.basis").value("최근 1달 안에 여행을 마친 일본 여행자 5명"))
                .andExpect(jsonPath("$.sampleData").value(false))
                // 일차별 평균 누적 지출: 여행자마다 1일차 호텔 300,000원, 3일차 식당 200,000원 (5일 여행)
                .andExpect(jsonPath("$.peerCumulative.length()").value(6))
                .andExpect(jsonPath("$.peerCumulative[0]").value(0))
                .andExpect(jsonPath("$.peerCumulative[1]").value(300000))
                .andExpect(jsonPath("$.peerCumulative[2]").value(300000))
                .andExpect(jsonPath("$.peerCumulative[3]").value(500000))
                .andExpect(jsonPath("$.peerCumulative[5]").value(500000));
        // 요청한 기기 자신은 비교 기준에서 빠져 4명이 되고, 5명 미만이면 다른 여행자와 비교하지 않습니다.
        insight(peerToken(1), 450_000, 250_000).andExpect(status().isOk())
                .andExpect(jsonPath("$.basis").isEmpty())
                .andExpect(jsonPath("$.peerCumulative").isEmpty())
                .andExpect(jsonPath("$.body").value("예산의 70%를 썼고, 여행은 71% 지났어요. 음식 비중이 64%로 가장 커요."))
                .andExpect(jsonPath("$.facts[1]").value("하루 평균 140,000원"));
        // 지출이 없으면 안내만 합니다.
        insight(null, 0, 0).andExpect(jsonPath("$.headline").value("첫 영수증을 기록해 보세요")).andExpect(jsonPath("$.facts.length()").value(0));
        verify(advisor, never()).advise(any());
    }
    @Test void 구매일은_출발_전_0일차_첫날_1일차_종료일_뒤는_마지막_일차다() {
        var start = java.time.LocalDate.of(2026, 10, 24);
        assertThat(com.wonit.travel.insight.InsightService.dayIndex(start, 5, start.minusDays(30))).isZero();
        assertThat(com.wonit.travel.insight.InsightService.dayIndex(start, 5, start)).isEqualTo(1);
        assertThat(com.wonit.travel.insight.InsightService.dayIndex(start, 5, start.plusDays(2))).isEqualTo(3);
        assertThat(com.wonit.travel.insight.InsightService.dayIndex(start, 5, start.plusDays(10))).isEqualTo(5);
    }
    @Test void 소비_인사이트_AI_문장은_계산한_숫자만_쓸_때_보여주고_아니면_규칙_문장을_쓴다() throws Exception {
        savePeers();
        when(advisor.configured()).thenReturn(true);
        when(advisor.advise(any())).thenReturn(new SpendingAdvisor.Advice("음식에 24%p 더 쓰고 있어요",
                "예산의 70%를 썼어요.\n이 속도면 980,000원이에요.", "남은 2일은 하루 150,000원이면 충분해요"));
        for (int i = 0; i < 2; i++)
            insight(null, 450_000, 250_000).andExpect(status().isOk()).andExpect(jsonPath("$.ai").value(true))
                    .andExpect(jsonPath("$.headline").value("음식에 24%p 더 쓰고 있어요"))
                    .andExpect(jsonPath("$.body").value("예산의 70%를 썼어요. 이 속도면 980,000원이에요."))
                    .andExpect(jsonPath("$.facts[0]").value("예산 70% 사용 · 여행 71% 경과"))
                    .andExpect(jsonPath("$.basis").value("최근 1달 안에 여행을 마친 일본 여행자 5명"));
        // 같은 숫자면 캐시를 써서 AI를 한 번만 부릅니다. AI에는 서버가 계산한 숫자만 보냅니다.
        verify(advisor, times(1)).advise(any());
        // 계산하지 않은 숫자(85%)를 쓰면 AI 문장을 버리고 규칙 기반 문장을 씁니다.
        when(advisor.advise(any())).thenReturn(new SpendingAdvisor.Advice("예산의 85%를 썼어요", "음식이 많아요.", null));
        insight(null, 460_000, 250_000).andExpect(status().isOk()).andExpect(jsonPath("$.ai").value(false))
                .andExpect(jsonPath("$.headline").value("예산 안에서 잘 쓰고 있어요"));
        // AI가 실패해도(시간 초과 등) 규칙 기반 문장을 씁니다.
        when(advisor.advise(any())).thenThrow(new IllegalStateException("spending-advisor: 시간 초과"));
        insight(null, 470_000, 250_000).andExpect(status().isOk()).andExpect(jsonPath("$.ai").value(false))
                .andExpect(jsonPath("$.tip").isNotEmpty());
    }
    @Test void 소비_인사이트는_잘못된_요약을_거부한다() throws Exception {
        var trip = trip();
        for (var body : List.<Map<String, Object>>of(Map.of("trip", trip, "categories", Map.of("카페", 1000)),
                Map.of("trip", trip, "categories", Map.of("음식", -1)), Map.of("categories", Map.of("음식", 1000)), Map.of("trip", trip)))
            mvc.perform(post("/insight").contentType("application/json").content(mapper.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
    }
    @Test void 상품_검색은_대소문자와_한국어_이름으로_찾는다() throws Exception {
        save(tokenA, List.of(receipt())).andExpect(status().isOk());
        prices("&q=doritos").andExpect(jsonPath("$.records.length()").value(1));
        prices("&q=도리토스").andExpect(jsonPath("$.records.length()").value(1));
        prices("&q=도리토스나초").andExpect(jsonPath("$.records.length()").value(1));
        prices("&q=콜라").andExpect(jsonPath("$.records.length()").value(0));
    }
    @Test void 원문_매장명과_한국어_매장명을_저장하고_둘_다로_검색한다() throws Exception {
        var sushi = receipt("すし酒場さしす", 35.6905, 139.7010, "2026-10-27", 220, true);
        sushi.put("storeKo", "스시 사카바 사시스");
        sushi.put("items", List.of(Map.of("name", "生ビール", "nameKo", "생맥주", "quantity", 1, "unitMinor", 220)));
        save(tokenA, List.of(sushi, receipt())).andExpect(status().isOk());
        ledger(tokenA).andExpect(jsonPath("$.state.receipts[0].store").value("すし酒場さしす"))
                .andExpect(jsonPath("$.state.receipts[0].storeKo").value("스시 사카바 사시스"))
                .andExpect(jsonPath("$.state.receipts[1].storeKo").isEmpty());
        for (String q : List.of("스시", "사카바사시스", "さしす", "生ビール", "생맥주"))
            prices("&q=" + q).andExpect(jsonPath("$.records.length()").value(1))
                    .andExpect(jsonPath("$.records[0].store").value("すし酒場さしす"))
                    .andExpect(jsonPath("$.records[0].storeKo").value("스시 사카바 사시스"));
        var tooLong = receipt(); tooLong.put("storeKo", "가".repeat(121));
        save(tokenA, List.of(tooLong)).andExpect(status().isBadRequest());
    }
    @Test void 공개_조회는_기기_정보와_추가필드를_저장하거나_노출하지_않는다() throws Exception {
        var body = receipt(); body.put("image", "test-private-photo"); body.put("cardNumber", "test-private-value");
        save(tokenA, List.of(body)).andExpect(status().isOk());
        var response = prices("").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(response).contains("테스트 매장 A").doesNotContain("test-private", "cardNumber", "image", "device", "token", "a".repeat(64));
        assertThat(ledger(tokenA).andReturn().getResponse().getContentAsString()).doesNotContain("test-private", "cardNumber");
    }
    @Test void 잘못된_조회_조건은_거부한다() throws Exception {
        mvc.perform(get("/prices")).andExpect(status().isBadRequest());
        prices("&category=카페").andExpect(status().isBadRequest());
        prices("&sort=멀리순").andExpect(status().isBadRequest());
        prices("&radius=50000").andExpect(status().isBadRequest());
        prices("&q=--").andExpect(status().isBadRequest());
        mvc.perform(get("/prices?currency=JPY&latitude=abc&longitude=" + LNG)).andExpect(status().isBadRequest());
    }
    @Test void 허용된_origin만_접근한다() throws Exception {
        String url = "/prices?currency=JPY&latitude=" + LAT + "&longitude=" + LNG;
        mvc.perform(get(url).header("Origin", "https://example.invalid")).andExpect(status().isForbidden());
        mvc.perform(get(url).header("Origin", "http://localhost:8081")).andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8081"));
        mvc.perform(options("/ledger").header("Origin", "http://localhost:8081").header("Access-Control-Request-Method", "PUT"))
                .andExpect(status().isOk());
    }
    @Test void 환율_API는_1외화당_원화와_기준일_출처를_돌려준다() throws Exception {
        when(rateSource.fetch(any())).thenReturn("[{\"result\":1,\"cur_unit\":\"JPY(100)\",\"deal_bas_r\":\"839.83\"}]");
        mvc.perform(get("/api/exchange-rates/JPY")).andExpect(status().isOk())
                .andExpect(jsonPath("$.currency").value("JPY"))
                .andExpect(jsonPath("$.rate").value(8.3983))
                .andExpect(jsonPath("$.date").isString())
                .andExpect(jsonPath("$.source").value("한국수출입은행 매매기준율"));
        mvc.perform(get("/api/exchange-rates/XXX")).andExpect(status().isBadRequest());
    }
    @Test void 환율을_불러오지_못하면_503_RATE_UNAVAILABLE이다() throws Exception {
        when(rateSource.fetch(any())).thenThrow(new DomainException(ErrorCode.RATE_UNAVAILABLE));
        // 다른 테스트가 오늘 응답을 캐시했어도 THB는 그 응답에 없어 같은 오류가 됩니다.
        mvc.perform(get("/api/exchange-rates/THB")).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errors[0].code").value("RATE_UNAVAILABLE"));
    }

    private static MockMultipartFile png() {
        return new MockMultipartFile("file", "receipt.png", "image/png", new byte[] {1, 2, 3});
    }
    @Test void OCR은_상품별_수량과_단가를_최소단위로_돌려준다() throws Exception {
        when(reader.read(any(), eq("image/png"))).thenReturn(new RecognizedReceipt("テスト店", "테스트 매장", "99 Rue de Rivoli\n75001 Paris", "2026-10-27", "eur", "음식",
                "3.60", List.of(new RecognizedReceipt.Item("COCA COLA 50CL", "코카콜라 500ml", 2, "1.80"))));
        mvc.perform(multipart("/api/receipts/ocr").file(png())).andExpect(status().isOk())
                .andExpect(jsonPath("$.receipt.currency").value("EUR"))
                .andExpect(jsonPath("$.receipt.store").value("テスト店")).andExpect(jsonPath("$.receipt.storeKo").value("테스트 매장"))
                .andExpect(jsonPath("$.receipt.address").value("99 Rue de Rivoli, 75001 Paris"))
                .andExpect(jsonPath("$.receipt.totalMinor").value(360))
                .andExpect(jsonPath("$.receipt.items[0].name").value("COCA COLA 50CL"))
                .andExpect(jsonPath("$.receipt.items[0].nameKo").value("코카콜라 500ml"))
                .andExpect(jsonPath("$.receipt.items[0].unitMinor").value(180))
                .andExpect(jsonPath("$.receipt.items[0].quantity").value(2));
    }
    @Test void 상품을_읽지못한_영수증은_502_OCR_FAILED다() throws Exception {
        when(reader.read(any(), any())).thenReturn(new RecognizedReceipt(null, null, null, null, "EUR", null, "3.60", new ArrayList<>()));
        mvc.perform(multipart("/api/receipts/ocr").file(png())).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.errors[0].code").value("OCR_FAILED"));
    }
    @Test void 키가_없으면_503_OCR_UNAVAILABLE다() throws Exception {
        when(reader.read(any(), any())).thenThrow(new DomainException(ErrorCode.OCR_UNAVAILABLE));
        mvc.perform(multipart("/api/receipts/ocr").file(png())).andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errors[0].code").value("OCR_UNAVAILABLE"));
    }
    @Test void 지원하지_않는_사진은_외부에_보내지_않는다() throws Exception {
        var gif = new MockMultipartFile("file", "receipt.gif", "image/gif", new byte[] {1, 2, 3});
        mvc.perform(multipart("/api/receipts/ocr").file(gif)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("file"))
                .andExpect(jsonPath("$.errors[0].code").value("INVALID_FILE"));
        verifyNoInteractions(reader);
    }
}
