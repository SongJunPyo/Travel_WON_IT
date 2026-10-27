package com.wonit.travel;

import com.wonit.travel.ledger.ProductRepository;
import com.wonit.travel.ledger.ReceiptRepository;
import com.wonit.travel.ledger.StoreProductRepository;
import com.wonit.travel.ledger.LedgerDtos;
import com.wonit.travel.ledger.StoreGeocoder;
import com.wonit.travel.ledger.StoreRepository;
import com.wonit.travel.ledger.TripRepository;
import com.wonit.travel.ocr.OcrHistoryRepository;
import com.wonit.travel.ocr.ReceiptReader;
import com.wonit.travel.ocr.RecognizedReceipt;
import com.wonit.travel.rate.RateSource;
import com.wonit.travel.api.DomainException;
import com.wonit.travel.api.ErrorCode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Spring 7의 SpringExtension은 JUnit 6 전용입니다. 프로젝트 기준인 JUnit 5에서
// 실제 컨텍스트의 생명주기를 직접 관리하고 동일한 MockMvc API를 검증합니다.
// DB는 src/test/resources/config의 H2(MySQL 모드)를 씁니다.
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class TravelApiTest {
    MockMvc mvc;
    JsonMapper mapper;
    ReceiptReader reader = mock(ReceiptReader.class);
    // 외부 지오코딩 API 대신 쓰는 가짜 구현. 기본은 좌표를 못 찾음(빈 값).
    StoreGeocoder geocoder = mock(StoreGeocoder.class);
    // 한국수출입은행 API 대신 쓰는 가짜 구현. 테스트에서는 .env의 실제 키로 외부를 부르지 않습니다.
    RateSource rateSource = mock(RateSource.class);
    ConfigurableApplicationContext context;
    private final String tokenA = "Bearer " + "a".repeat(64), tokenB = "Bearer " + "b".repeat(64);

    @BeforeAll void start() {
        context = new SpringApplicationBuilder(TravelWonhaeApplication.class)
                .initializers(ctx -> {
                    ((GenericApplicationContext) ctx).registerBean("testReceiptReader", ReceiptReader.class, () -> reader, bd -> bd.setPrimary(true));
                    ((GenericApplicationContext) ctx).registerBean("testStoreGeocoder", StoreGeocoder.class, () -> geocoder, bd -> bd.setPrimary(true));
                    ((GenericApplicationContext) ctx).registerBean("testRateSource", RateSource.class, () -> rateSource, bd -> bd.setPrimary(true));
                })
                .run("--server.port=0");
        mvc = MockMvcBuilders.webAppContextSetup((WebApplicationContext) context)
                .addFilters(context.getBean(com.wonit.travel.api.RequestLimitFilter.class)).build();
        mapper = context.getBean(JsonMapper.class);
    }
    @AfterAll void stop() { if (context != null) context.close(); }
    @BeforeEach void clean() {
        context.getBean(StoreProductRepository.class).deleteAllInBatch();
        context.getBean(ReceiptRepository.class).deleteAll();
        context.getBean(TripRepository.class).deleteAll();
        context.getBean(ProductRepository.class).deleteAll();
        context.getBean(StoreRepository.class).deleteAll();
        context.getBean(OcrHistoryRepository.class).deleteAll();
        reset(reader, geocoder, rateSource);
        when(geocoder.locate(any())).thenReturn(java.util.Optional.empty());
    }

    private Map<String, Object> receipt(String id, boolean share) {
        return new HashMap<>(Map.ofEntries(
                Map.entry("id", id), Map.entry("store", "테스트 매장"), Map.entry("date", "2026-10-27"),
                Map.entry("category", "음식"), Map.entry("currency", "EUR"), Map.entry("rate", 1600),
                Map.entry("items", List.of(Map.of("name", "COKE 0.5L", "nameKo", "코카콜라 500ml", "quantity", 2, "unitMinor", 180))),
                Map.entry("totalMinor", 360), Map.entry("shareConsent", share), Map.entry("demo", false),
                Map.entry("location", Map.of("latitude", 48.8584, "longitude", 2.347)),
                Map.entry("address", "테스트 매장 주소"), Map.entry("recordedAt", "2026-10-27T10:00:00Z")));
    }
    private Map<String, Object> state(List<Map<String, Object>> receipts) {
        return Map.of("version", 1,
                "trip", Map.of("city", "파리", "country", "프랑스", "start", "2026-10-24", "end", "2026-10-30",
                        "budget", 1000000, "currency", "EUR", "rate", 1600),
                "receipts", receipts);
    }
    private void save(String token, List<Map<String, Object>> receipts) throws Exception {
        mvc.perform(put("/ledger").header("Authorization", token).contentType("application/json")
                .content(mapper.writeValueAsString(state(receipts)))).andExpect(status().isOk());
    }
    private void rejected(Map<String, Object> receipt) throws Exception {
        mvc.perform(put("/ledger").header("Authorization", tokenA).contentType("application/json")
                .content(mapper.writeValueAsString(state(List.of(receipt))))).andExpect(status().isBadRequest());
    }

    @Test void 서버_상태() throws Exception {
        mvc.perform(get("/health")).andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
    }
    @Test void 가계부를_DB에_저장하고_그대로_다시_읽는다() throws Exception {
        var demo = receipt("demo-cafe", false);
        demo.put("demo", true); demo.put("location", null); demo.put("address", "");
        save(tokenA, List.of(receipt("r-1", true), demo));
        mvc.perform(get("/ledger").header("Authorization", tokenA)).andExpect(status().isOk())
                .andExpect(jsonPath("$.state.trip.city").value("파리"))
                .andExpect(jsonPath("$.state.trip.budget").value(1000000))
                .andExpect(jsonPath("$.state.receipts.length()").value(2))
                .andExpect(jsonPath("$.state.receipts[0].id").value("r-1"))
                .andExpect(jsonPath("$.state.receipts[0].items[0].name").value("COKE 0.5L"))
                .andExpect(jsonPath("$.state.receipts[0].items[0].nameKo").value("코카콜라 500ml"))
                .andExpect(jsonPath("$.state.receipts[0].items[0].unitMinor").value(180))
                .andExpect(jsonPath("$.state.receipts[0].location.latitude").value(48.8584))
                .andExpect(jsonPath("$.state.receipts[1].demo").value(true))
                .andExpect(jsonPath("$.state.receipts[1].location").value(nullValue()));
    }
    @Test void 저장한적_없는_기기는_빈_가계부다() throws Exception {
        mvc.perform(get("/ledger").header("Authorization", tokenB)).andExpect(status().isOk())
                .andExpect(jsonPath("$.state").value(nullValue()));
    }
    @Test void 기기토큰이_없으면_거부한다() throws Exception {
        mvc.perform(put("/ledger").contentType("application/json").content(mapper.writeValueAsString(state(List.of()))))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/ledger")).andExpect(status().isUnauthorized());
    }
    @Test void 재저장은_중복을_만들지_않는다() throws Exception {
        save(tokenA, List.of(receipt("r-1", true)));
        save(tokenA, List.of(receipt("r-1", true)));
        assertThat(context.getBean(ReceiptRepository.class).count()).isEqualTo(1);
        assertThat(context.getBean(TripRepository.class).count()).isEqualTo(1);
    }
    @Test void 동의_절차없이_시연이_아닌_품목은_모두_정규화된_이름으로_가격비교에_나온다() throws Exception {
        // 앱이 shareConsent=false를 보내도(이전 버전 기록) 서버는 공유합니다.
        save(tokenA, List.of(receipt("r-1", true), receipt("r-2", false)));
        var body = mvc.perform(get("/prices")).andExpect(status().isOk())
                .andExpect(jsonPath("$.records.length()").value(2))
                .andExpect(jsonPath("$.records[0].unitMinor").value(180))
                .andExpect(jsonPath("$.records[0].normalized").value("코카콜라500ml"))
                .andExpect(jsonPath("$.records[0].product").value("코카콜라 500ml"))
                .andExpect(jsonPath("$.records[0].original").value("COKE 0.5L"))
                .andExpect(jsonPath("$.records[0].receiptId").value("r-1"))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("a".repeat(64), "tokenHash", "ownerHash");
    }
    @Test void 시연기록과_위치없는_기록은_공유하지_않는다() throws Exception {
        var demo = receipt("demo-1", true); demo.put("demo", true);
        var noLocation = receipt("r-2", true); noLocation.put("location", null);
        // 다른 영수증이 이미 좌표를 등록한 매장이면 그 좌표를 쓰므로, 처음 보는 매장 주소로 확인합니다.
        noLocation.put("address", "좌표를 찾지 못하는 주소");
        save(tokenA, List.of(demo, noLocation));
        mvc.perform(get("/prices")).andExpect(jsonPath("$.records.length()").value(0));
    }
    @Test void 영수증을_지우면_해당_기기_기록만_가격비교에서_빠진다() throws Exception {
        save(tokenA, List.of(receipt("r-1", true)));
        save(tokenB, List.of(receipt("r-1", true)));
        save(tokenA, List.of());
        mvc.perform(get("/prices")).andExpect(jsonPath("$.records.length()").value(1));
    }
    @Test void 같은_매장은_한_행이고_매장별_최근가격을_계산한다() throws Exception {
        save(tokenA, List.of(receipt("r-1", true)));
        var newer = receipt("r-1", true);
        newer.put("date", "2026-10-28"); newer.put("totalMinor", 400);
        // 원어가 달라도(일본어) 한국어 번역이 같으면 같은 상품으로 묶입니다.
        newer.put("items", List.of(Map.of("name", "コカ・コーラ 500ml", "nameKo", "코카콜라 500ml", "quantity", 2, "unitMinor", 200)));
        save(tokenB, List.of(newer));
        assertThat(context.getBean(StoreRepository.class).findAll()).hasSize(1);
        var rows = context.getBean(StoreProductRepository.class).findAll();
        assertThat(rows).hasSize(1);
        assertThat(rows.getFirst().getLatestUnitMinor()).isEqualTo(200);
        assertThat(rows.getFirst().getPurchaseCount()).isEqualTo(2);
    }
    @Test void 위치없이_주소만_있으면_주소로_매장좌표를_찾아_가격비교에_나온다() throws Exception {
        when(geocoder.locate("1 Rue de Test, 75001 Paris")).thenReturn(java.util.Optional.of(new LedgerDtos.Coordinate(48.86, 2.34)));
        var r = receipt("r-1", true);
        r.put("location", null);
        r.put("address", "1 Rue de Test, 75001 Paris");
        save(tokenA, List.of(r));
        mvc.perform(get("/prices")).andExpect(jsonPath("$.records.length()").value(1))
                .andExpect(jsonPath("$.records[0].latitude").value(48.86))
                .andExpect(jsonPath("$.records[0].longitude").value(2.34));
        assertThat(context.getBean(StoreRepository.class).findAll().getFirst().getLatitude()).isEqualTo(48.86);
    }
    @Test void 주소로_좌표를_못찾으면_가격비교에_나오지_않는다() throws Exception {
        var r = receipt("r-1", true);
        r.put("location", null);
        save(tokenA, List.of(r));
        mvc.perform(get("/prices")).andExpect(jsonPath("$.records.length()").value(0));
    }
    @Test void 잘못된_합계_날짜_통화_카테고리_위치는_거부한다() throws Exception {
        List<Map<String, Object>> overrides = List.of(Map.of("totalMinor", 999), Map.of("date", "2026-02-30"),
                Map.of("currency", "XXX"), Map.of("category", "없음"), Map.of("rate", 0), Map.of("rate", -1),
                Map.of("rate", 8.39831), Map.of("rate", 1_000_001),
                Map.of("location", Map.of("latitude", 100, "longitude", 2.3)), Map.of("items", List.of()));
        for (var override : overrides) {
            var r = receipt("r-1", true); r.putAll(override);
            rejected(r);
        }
        assertThat(context.getBean(ReceiptRepository.class).count()).isZero();
    }
    @Test void 소수_환율을_그대로_저장하고_원화는_끝까지_계산한_뒤_반올림한다() throws Exception {
        var r = receipt("r-1", true);
        r.put("currency", "JPY"); r.put("rate", 8.3983); r.put("totalMinor", 1000);
        r.put("items", List.of(Map.of("name", "おにぎり", "quantity", 2, "unitMinor", 500)));
        save(tokenA, List.of(r));
        mvc.perform(get("/ledger").header("Authorization", tokenA)).andExpect(status().isOk())
                .andExpect(jsonPath("$.state.trip.rate").value(1600))
                .andExpect(jsonPath("$.state.receipts[0].rate").value(8.3983));
        // 1000엔 × 8.3983 = 8398.3원 → 8398원 (정수 환율 8이면 8000원)
        assertThat(context.getBean(JdbcTemplate.class).queryForObject("select total_krw from receipts", Long.class))
                .isEqualTo(8398);
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
    @Test void 같은_영수증id가_두번이면_거부한다() throws Exception {
        mvc.perform(put("/ledger").header("Authorization", tokenA).contentType("application/json")
                .content(mapper.writeValueAsString(state(List.of(receipt("r-1", true), receipt("r-1", true))))))
                .andExpect(status().isBadRequest());
    }
    @Test void 소수_단가를_조용히_절사하지_않는다() throws Exception {
        var r = receipt("r-1", true);
        r.put("items", List.of(Map.of("name", "COKE", "quantity", 2, "unitMinor", 180.5)));
        rejected(r);
    }
    @Test void 허용된_origin만_접근한다() throws Exception {
        mvc.perform(get("/prices").header("Origin", "https://example.invalid")).andExpect(status().isForbidden());
        mvc.perform(get("/prices").header("Origin", "http://localhost:8081")).andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8081"));
    }

    private static MockMultipartFile png() {
        return new MockMultipartFile("file", "receipt.png", "image/png", new byte[] {1, 2, 3});
    }
    @Test void OCR은_상품별_수량과_단가를_최소단위로_돌려주고_이력을_남긴다() throws Exception {
        when(reader.read(any(), eq("image/png"))).thenReturn(new RecognizedReceipt("테스트 매장", "99 Rue de Rivoli\n75001 Paris", "2026-10-27", "eur", "음식",
                "3.60", List.of(new RecognizedReceipt.Item("COCA COLA 50CL", "코카콜라 500ml", 2, "1.80"))));
        mvc.perform(multipart("/api/receipts/ocr").file(png())).andExpect(status().isOk())
                .andExpect(jsonPath("$.receipt.currency").value("EUR"))
                .andExpect(jsonPath("$.receipt.address").value("99 Rue de Rivoli, 75001 Paris"))
                .andExpect(jsonPath("$.receipt.totalMinor").value(360))
                .andExpect(jsonPath("$.receipt.items[0].name").value("COCA COLA 50CL"))
                .andExpect(jsonPath("$.receipt.items[0].nameKo").value("코카콜라 500ml"))
                .andExpect(jsonPath("$.receipt.items[0].unitMinor").value(180))
                .andExpect(jsonPath("$.receipt.items[0].quantity").value(2));
        var history = context.getBean(OcrHistoryRepository.class).findAll();
        assertThat(history).hasSize(1);
        assertThat(history.getFirst().getResult()).isEqualTo("OK");
        assertThat(history.getFirst().getTotalMinor()).isEqualTo(360);
        assertThat(history.getFirst().getStoreAddress()).isEqualTo("99 Rue de Rivoli, 75001 Paris");
    }
    @Test void 상품을_읽지못한_영수증은_502_OCR_FAILED다() throws Exception {
        when(reader.read(any(), any())).thenReturn(new RecognizedReceipt(null, null, null, "EUR", null, "3.60", new ArrayList<>()));
        mvc.perform(multipart("/api/receipts/ocr").file(png())).andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.errors[0].code").value("OCR_FAILED"));
        assertThat(context.getBean(OcrHistoryRepository.class).findAll().getFirst().getResult()).isEqualTo("OCR_FAILED");
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
