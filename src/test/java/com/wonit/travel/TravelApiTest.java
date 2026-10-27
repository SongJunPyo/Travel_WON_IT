package com.wonit.travel;

import com.wonit.travel.ocr.ReceiptAiGateway;
import com.wonit.travel.ocr.ReceiptDraft;
import com.wonit.travel.ledger.DeviceRepository;
import com.wonit.travel.ledger.ReceiptRepository;
import com.wonit.travel.ledger.TripRepository;
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
import org.springframework.web.context.WebApplicationContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
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
    ReceiptAiGateway gateway = mock(ReceiptAiGateway.class);
    ConfigurableApplicationContext context;
    private final String tokenA = "Bearer " + "a".repeat(64), tokenB = "Bearer " + "b".repeat(64);
    @BeforeAll void start() {
        context = new SpringApplicationBuilder(TravelWonhaeApplication.class)
                .initializers(ctx -> ((GenericApplicationContext)ctx).registerBean("testReceiptGateway", ReceiptAiGateway.class, () -> gateway, bd -> bd.setPrimary(true)))
                .run("--server.port=0", "--spring.datasource.url=jdbc:h2:mem:wonhae-tests", "--spring.jpa.hibernate.ddl-auto=create-drop", "--app.openai-api-key=test-only");
        mvc = MockMvcBuilders.webAppContextSetup((WebApplicationContext) context)
                .addFilters(context.getBean(com.wonit.travel.api.RequestLimitFilter.class)).build();
        mapper = context.getBean(JsonMapper.class);
        devices = context.getBean(DeviceRepository.class);
        trips = context.getBean(TripRepository.class);
        receipts = context.getBean(ReceiptRepository.class);
    }
    @AfterAll void stop() { if (context != null) context.close(); }
    @BeforeEach void clean() { receipts.deleteAll(); trips.deleteAll(); devices.deleteAll(); reset(gateway); }
    // 도쿄 신주쿠역 근처 시연 위치입니다.
    private static final double LAT = 35.6896, LNG = 139.7006;
    private Map<String, Object> receipt(String store, double latitude, double longitude, String date, long unitMinor, boolean share) {
        return new HashMap<>(Map.ofEntries(
                Map.entry("store", store), Map.entry("address", store + " 주소"),
                Map.entry("location", Map.of("latitude", latitude, "longitude", longitude)),
                Map.entry("category", "음식"), Map.entry("browseCategory", "식당"), Map.entry("date", date),
                Map.entry("currency", "JPY"), Map.entry("rate", 9.24), Map.entry("totalMinor", unitMinor), Map.entry("shareConsent", share),
                Map.entry("items", List.of(Map.of("name", "DORITOS NACHO 150G", "nameKo", "도리토스 나초 150g", "quantity", 1, "unitMinor", unitMinor)))));
    }
    private Map<String, Object> receipt() { return receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-27", 330, true); }
    private Map<String, Object> trip() {
        return new HashMap<>(Map.of("city", "도쿄", "country", "일본", "start", "2026-10-24", "end", "2026-10-30",
                "budget", 1_000_000, "currency", "JPY", "rate", 9.24));
    }
    private ResultActions create(String token, Map<String, Object> body) throws Exception {
        return mvc.perform(post("/receipts").header("Authorization", token).contentType("application/json").content(mapper.writeValueAsString(body)));
    }
    private long createId(String token, Map<String, Object> body) throws Exception {
        String json = create(token, body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return mapper.readTree(json).get("receipt").get("id").asLong();
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
    @Test void 영수증을_저장하면_내_가계부에만_보인다() throws Exception {
        create(tokenA, receipt()).andExpect(status().isCreated()).andExpect(jsonPath("$.receipt.id").isNumber())
                .andExpect(jsonPath("$.receipt.items[0].nameKo").value("도리토스 나초 150g"))
                .andExpect(jsonPath("$.receipt.recordedAt").isString());
        mvc.perform(get("/ledger").header("Authorization", tokenA)).andExpect(status().isOk())
                .andExpect(jsonPath("$.receipts.length()").value(1)).andExpect(jsonPath("$.receipts[0].store").value("테스트 매장 A"));
        mvc.perform(get("/ledger").header("Authorization", tokenB)).andExpect(status().isOk())
                .andExpect(jsonPath("$.receipts.length()").value(0)).andExpect(jsonPath("$.trip").isEmpty());
        assertThat(devices.count()).isEqualTo(1);
    }
    @Test void 여행_설정을_저장하고_소수_환율을_그대로_돌려준다() throws Exception {
        for (int i = 0; i < 2; i++)
            mvc.perform(put("/trip").header("Authorization", tokenA).contentType("application/json").content(mapper.writeValueAsString(trip())))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.trip.rate").value(9.24));
        mvc.perform(get("/ledger").header("Authorization", tokenA)).andExpect(jsonPath("$.trip.city").value("도쿄"))
                .andExpect(jsonPath("$.trip.budget").value(1_000_000));
        assertThat(trips.count()).isEqualTo(1);
    }
    @Test void 내_영수증은_고치고_지울_수_있고_다른_기기의_영수증은_404로_막는다() throws Exception {
        long id = createId(tokenA, receipt());
        createId(tokenB, receipt());
        var changed = receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-27", 300, true);
        mvc.perform(put("/receipts/" + id).header("Authorization", tokenB).contentType("application/json").content(mapper.writeValueAsString(changed)))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/receipts/" + id).header("Authorization", tokenB)).andExpect(status().isNotFound());
        mvc.perform(put("/receipts/" + id).header("Authorization", tokenA).contentType("application/json").content(mapper.writeValueAsString(changed)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.receipt.totalMinor").value(300)).andExpect(jsonPath("$.receipt.items.length()").value(1));
        mvc.perform(delete("/receipts/" + id).header("Authorization", tokenA)).andExpect(status().isOk());
        assertThat(receipts.count()).isEqualTo(1);
    }
    @Test void 기기토큰이_없는_요청은_거부한다() throws Exception {
        mvc.perform(post("/receipts").contentType("application/json").content(mapper.writeValueAsString(receipt()))).andExpect(status().isUnauthorized());
        mvc.perform(get("/ledger").header("Authorization", "Bearer short")).andExpect(status().isUnauthorized());
    }
    @Test void 잘못된_영수증은_거부한다() throws Exception {
        var item = Map.of("name", "X", "quantity", 0, "unitMinor", 330);
        for (var override : List.<Map<String, Object>>of(Map.of("category", "카페"), Map.of("browseCategory", "카페"), Map.of("date", "2026-02-30"),
                Map.of("currency", "XXX"), Map.of("totalMinor", 331), Map.of("rate", 0), Map.of("rate", 9.12345),
                Map.of("items", List.of(item)), Map.of("location", Map.of("latitude", 100, "longitude", 0)), Map.of("store", " "))) {
            var body = receipt(); body.putAll(override);
            create(tokenA, body).andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").exists());
        }
        var noLocation = receipt(); noLocation.remove("location");
        create(tokenA, noLocation).andExpect(status().isBadRequest());
        noLocation.put("shareConsent", false);
        create(tokenA, noLocation).andExpect(status().isCreated());
        assertThat(receipts.count()).isEqualTo(1);
    }
    @Test void 소수_단가를_조용히_절사하지_않는다() throws Exception {
        var body = receipt(); body.put("items", List.of(Map.of("name", "X", "quantity", 1, "unitMinor", 330.5)));
        create(tokenA, body).andExpect(status().isBadRequest());
    }
    @Test void PAGE2_카테고리_조회는_반경_안의_공유_영수증을_매장별_최근가격과_구매수로_묶는다() throws Exception {
        createId(tokenB, receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-26", 300, true));
        createId(tokenA, receipt("테스트 매장 A", 35.6905, 139.7010, "2026-10-27", 330, true));
        createId(tokenB, receipt("테스트 매장 B", 35.6930, 139.7040, "2026-10-25", 280, true));
        createId(tokenB, receipt("오사카 매장", 34.7025, 135.4959, "2026-10-27", 100, true));
        createId(tokenB, receipt("비공개 매장", 35.6900, 139.7000, "2026-10-27", 90, false));
        prices("&category=식당").andExpect(status().isOk()).andExpect(jsonPath("$.records.length()").value(2))
                .andExpect(jsonPath("$.records[0].store").value("테스트 매장 B")).andExpect(jsonPath("$.records[0].count").value(1))
                .andExpect(jsonPath("$.records[1].unitMinor").value(330)).andExpect(jsonPath("$.records[1].count").value(2))
                .andExpect(jsonPath("$.records[1].date").value("2026-10-27")).andExpect(jsonPath("$.records[1].product").value("도리토스 나초 150g"))
                .andExpect(jsonPath("$.records[1].distance").isNumber());
        prices("&category=식당&sort=구매수").andExpect(jsonPath("$.records[0].store").value("테스트 매장 A"));
        prices("&category=식당&sort=최신순").andExpect(jsonPath("$.records[0].date").value("2026-10-27"));
        prices("&category=숙박").andExpect(jsonPath("$.records.length()").value(0));
    }
    @Test void 상품_검색은_대소문자와_한국어_이름으로_찾는다() throws Exception {
        createId(tokenA, receipt());
        prices("&q=doritos").andExpect(jsonPath("$.records.length()").value(1));
        prices("&q=도리토스").andExpect(jsonPath("$.records.length()").value(1));
        prices("&q=도리토스나초").andExpect(jsonPath("$.records.length()").value(1));
        prices("&q=콜라").andExpect(jsonPath("$.records.length()").value(0));
    }
    @Test void 공개_조회는_기기_정보와_추가필드를_저장하거나_노출하지_않는다() throws Exception {
        var body = receipt(); body.put("image", "test-private-photo"); body.put("cardNumber", "test-private-value");
        createId(tokenA, body);
        var response = prices("").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(response).contains("테스트 매장 A").doesNotContain("test-private", "cardNumber", "image", "device", "token", "a".repeat(64));
    }
    @Test void 잘못된_조회_조건은_거부한다() throws Exception {
        mvc.perform(get("/prices")).andExpect(status().isBadRequest());
        prices("&category=카페").andExpect(status().isBadRequest());
        prices("&sort=거리순").andExpect(status().isBadRequest());
        prices("&radius=50000").andExpect(status().isBadRequest());
        prices("&q=--").andExpect(status().isBadRequest());
        mvc.perform(get("/prices?currency=JPY&latitude=abc&longitude=" + LNG)).andExpect(status().isBadRequest());
    }
    @Test void 허용된_origin만_접근한다() throws Exception {
        String url = "/prices?currency=JPY&latitude=" + LAT + "&longitude=" + LNG;
        mvc.perform(get(url).header("Origin", "https://example.invalid")).andExpect(status().isForbidden());
        mvc.perform(get(url).header("Origin", "http://localhost:8081")).andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8081"));
        mvc.perform(options("/receipts/1").header("Origin", "http://localhost:8081").header("Access-Control-Request-Method", "DELETE"))
                .andExpect(status().isOk());
    }
    @Test void OCR은_상품별_수량과_단가를_반환한다() throws Exception {
        when(gateway.extract(anyString())).thenReturn(new ReceiptDraft("테스트 매장", "2026-10-27", "EUR", "음식", 360, List.of(new ReceiptDraft.Item("코카콜라 500ml", 2, 180))));
        mvc.perform(post("/ocr").contentType("application/json").content("{\"image\":\"data:image/png;base64,aGVsbG8=\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.receipt.items[0].unitMinor").value(180)).andExpect(jsonPath("$.receipt.items[0].quantity").value(2));
    }
    @Test void 읽지못한_영수증은_성공으로_반환하지_않는다() throws Exception {
        when(gateway.extract(anyString())).thenReturn(new ReceiptDraft("", "", "EUR", "기타", 0, List.of()));
        mvc.perform(post("/ocr").contentType("application/json").content("{\"image\":\"data:image/png;base64,aGVsbG8=\"}"))
                .andExpect(status().isUnprocessableEntity());
    }
    @Test void 지원하지_않는_사진은_외부에_보내지_않는다() throws Exception {
        mvc.perform(post("/ocr").contentType("application/json").content("{\"image\":\"test\"}"))
                .andExpect(status().isBadRequest());
    }
}
