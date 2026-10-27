package com.wonit.travel;

import com.wonit.travel.ocr.ReceiptAiGateway;
import com.wonit.travel.ocr.ReceiptDraft;
import com.wonit.travel.price.PriceRepository;
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
    PriceRepository repository;
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
        repository = context.getBean(PriceRepository.class);
    }
    @AfterAll void stop() { if (context != null) context.close(); }
    @BeforeEach void clean() { repository.deleteAll(); reset(gateway); }
    private Map<String, Object> row() {
        return new java.util.HashMap<>(Map.ofEntries(
                Map.entry("id", "test-product-1"), Map.entry("receiptId", "test-receipt"), Map.entry("store", "테스트 매장"),
                Map.entry("address", "테스트 매장 주소"), Map.entry("latitude", 48.8584), Map.entry("longitude", 2.347),
                Map.entry("product", "COKE 0.5L"), Map.entry("unitMinor", 180), Map.entry("currency", "EUR"),
                Map.entry("date", "2026-10-27"), Map.entry("recordedAt", "2026-10-27T10:00:00Z"), Map.entry("demo", false)));
    }
    private String payload(List<?> rows) { return mapper.writeValueAsString(Map.of("records", rows)); }
    private void save(String token, Map<String, Object> row) throws Exception {
        mvc.perform(put("/prices").header("Authorization", token).contentType("application/json").content(payload(List.of(row)))).andExpect(status().isOk());
    }
    @Test void 서버_상태() throws Exception {
        mvc.perform(get("/health")).andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
    }
    @Test void 없는_주소는_서버_오류가_아닌_404로_응답한다() throws Exception {
        mvc.perform(get("/")).andExpect(status().isNotFound()).andExpect(jsonPath("$.error").exists());
    }
    @Test void 상품_가격을_DB에_저장하고_정규화된_이름으로_조회한다() throws Exception {
        save(tokenA, row());
        mvc.perform(get("/prices")).andExpect(status().isOk()).andExpect(jsonPath("$.records.length()").value(1))
                .andExpect(jsonPath("$.records[0].unitMinor").value(180))
                .andExpect(jsonPath("$.records[0].normalized").value("코카콜라500ml"))
                .andExpect(jsonPath("$.records[0].ownerHash").doesNotExist());
        assertThat(repository.count()).isEqualTo(1);
    }
    @Test void 재동기화는_중복을_만들지_않는다() throws Exception {
        save(tokenA, row()); save(tokenA, row()); assertThat(repository.count()).isEqualTo(1);
    }
    @Test void 공유_철회는_해당_기기_데이터만_삭제한다() throws Exception {
        save(tokenA, row()); save(tokenB, row());
        mvc.perform(put("/prices").header("Authorization", tokenA).contentType("application/json").content(payload(List.of()))).andExpect(status().isOk());
        assertThat(repository.count()).isEqualTo(1);
    }
    @Test void 사진_카드정보_추가필드를_저장하거나_공개하지_않는다() throws Exception {
        var row = row(); row.put("image", "test-private-photo"); row.put("cardNumber", "test-private-value");
        save(tokenA, row);
        var response = mvc.perform(get("/prices")).andReturn().getResponse().getContentAsString();
        assertThat(response).doesNotContain("test-private", "ownerHash", "cardNumber", "image", "a".repeat(64));
        assertThat(repository.findAll().getFirst().publicRecord().unitMinor()).isEqualTo(180);
    }
    @Test void 기기토큰이_없는_수정은_거부한다() throws Exception {
        mvc.perform(put("/prices").contentType("application/json").content(payload(List.of(row())))).andExpect(status().isUnauthorized());
    }
    @Test void 잘못된_가격_위치_날짜와_시연기록은_거부한다() throws Exception {
        for (var override : List.of(Map.of("latitude", 100), Map.of("unitMinor", -1), Map.of("demo", true), Map.of("date", "2026-02-30"), Map.of("currency", "XXX"), Map.of("address", ""))) {
            var row = row(); row.putAll(override);
            mvc.perform(put("/prices").header("Authorization", tokenA).contentType("application/json").content(payload(List.of(row)))).andExpect(status().isBadRequest());
        }
        assertThat(repository.count()).isZero();
    }
    @Test void 소수_단가를_조용히_절사하지_않는다() throws Exception {
        var row = row(); row.put("unitMinor", 180.5);
        mvc.perform(put("/prices").header("Authorization", tokenA).contentType("application/json").content(payload(List.of(row)))).andExpect(status().isBadRequest());
    }
    @Test void 허용된_origin만_접근한다() throws Exception {
        mvc.perform(get("/prices").header("Origin", "https://example.invalid")).andExpect(status().isForbidden());
        mvc.perform(get("/prices").header("Origin", "http://localhost:8081")).andExpect(status().isOk()).andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:8081"));
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
