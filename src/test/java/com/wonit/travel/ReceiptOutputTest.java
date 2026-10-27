package com.wonit.travel;

import com.wonit.travel.api.ApiException;
import com.wonit.travel.ocr.OcrService;
import com.wonit.travel.ocr.ReceiptAiGateway;
import com.wonit.travel.ocr.ReceiptDraft;
import org.junit.jupiter.api.Test;
import org.springframework.ai.converter.BeanOutputConverter;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class ReceiptOutputTest {
    @Test void 키가없으면_서버는_명확한_오류를_반환한다() {
        var gateway = mock(ReceiptAiGateway.class);
        assertThatThrownBy(() -> new OcrService(gateway, "").extract("test"))
                .isInstanceOf(ApiException.class).satisfies(e -> assertThat(((ApiException)e).status()).isEqualTo(503));
        verifyNoInteractions(gateway);
    }
    @Test void SpringAI가_상품별_구조를_스키마로_정의하고_응답을_변환한다() {
        var converter = new BeanOutputConverter<>(ReceiptDraft.class);
        assertThat(converter.getJsonSchema()).contains("unitMinor", "quantity", "required", "additionalProperties");
        var r = converter.convert("{\"store\":\"테스트 매장\",\"date\":\"2026-10-27\",\"currency\":\"EUR\",\"category\":\"음식\",\"totalMinor\":360,\"items\":[{\"name\":\"코카콜라 500ml\",\"quantity\":2,\"unitMinor\":180}]}");
        assertThat(r.items().getFirst().unitMinor()).isEqualTo(180);
        assertThat(r.items().getFirst().quantity()).isEqualTo(2);
    }
}
