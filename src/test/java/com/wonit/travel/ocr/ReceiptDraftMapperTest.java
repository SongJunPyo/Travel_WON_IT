package com.wonit.travel.ocr;

import com.wonit.travel.api.DomainException;
import com.wonit.travel.api.ErrorCode;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ReceiptDraftMapperTest {
    private final ReceiptDraftMapper mapper = new ReceiptDraftMapper();

    @Test void 엔화는_소수점_없이_최소단위로_바꾼다() {
        var draft = mapper.toDraft(new RecognizedReceipt("ローソン", "로손", "東京都新宿区新宿3-1", "2026-10-11", "JPY", "음식", "380",
                List.of(new RecognizedReceipt.Item("コカ・コーラ 500ml", "코카콜라 500ml", 2, "190"))));
        assertThat(draft.totalMinor()).isEqualTo(380);
        assertThat(draft.address()).isEqualTo("東京都新宿区新宿3-1");
        assertThat(draft.store()).isEqualTo("ローソン");
        assertThat(draft.storeKo()).isEqualTo("로손");
        assertThat(draft.items().getFirst().unitMinor()).isEqualTo(190);
        assertThat(draft.items().getFirst().name()).isEqualTo("コカ・コーラ 500ml");
        assertThat(draft.items().getFirst().nameKo()).isEqualTo("코카콜라 500ml");
    }
    @Test void 읽지못한_매장명_날짜는_null이고_모르는_카테고리는_기타다() {
        var draft = mapper.toDraft(new RecognizedReceipt(" ", " ", " ", "2026-02-30", "EUR", "식비", "1.80",
                List.of(new RecognizedReceipt.Item("BAGUETTE", " ", null, "1.80"))));
        assertThat(draft.store()).isNull();
        assertThat(draft.storeKo()).isNull();
        assertThat(draft.date()).isNull();
        assertThat(draft.address()).isNull();
        assertThat(draft.category()).isEqualTo("기타");
        assertThat(draft.items().getFirst().quantity()).isEqualTo(1);
        assertThat(draft.items().getFirst().nameKo()).isNull();
    }
    @Test void 통화를_모르면_OCR_FAILED다() {
        assertThatThrownBy(() -> mapper.toDraft(new RecognizedReceipt("G7", null, null, "2026-10-11", null, "음식", "3.60",
                List.of(new RecognizedReceipt.Item("COKE", "콜라", 1, "3.60")))))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.OCR_FAILED));
    }
    @Test void 사진은_JPG_PNG_WEBP_10MB_이하만_받는다() {
        assertThatThrownBy(() -> mapper.validateFile("image/heic", 10)).isInstanceOf(DomainException.class);
        assertThatThrownBy(() -> mapper.validateFile("image/png", 11L * 1024 * 1024)).isInstanceOf(DomainException.class);
        mapper.validateFile("image/webp", 10);
    }
    @Test void API키가_없으면_리더는_OCR_UNAVAILABLE다() {
        var reader = new ClaudeReceiptReader(null, " ");
        assertThat(reader.configured()).isFalse();
        assertThatThrownBy(() -> reader.read(new byte[] {1}, "image/png"))
                .isInstanceOfSatisfying(DomainException.class, e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.OCR_UNAVAILABLE));
    }
}
