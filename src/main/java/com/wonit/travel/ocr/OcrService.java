package com.wonit.travel.ocr;

import com.wonit.travel.api.ApiException;
import com.wonit.travel.ledger.LedgerService;
import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class OcrService {
    private final ReceiptAiGateway gateway;
    private final String apiKey;
    public OcrService(ReceiptAiGateway gateway, @Value("${app.openai-api-key}") String apiKey) { this.gateway = gateway; this.apiKey = apiKey; }
    public boolean configured() { return !apiKey.isBlank(); }
    public ReceiptDraft extract(String image) {
        if (!configured()) throw new ApiException(503, "AI 분석 키가 설정되지 않았어요. 서버의 OPENAI_API_KEY를 설정하거나 직접 입력해 주세요.");
        if (image == null || image.length() > 8_000_000 || !image.matches("data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+"))
            throw new ApiException(400, "6MB 이하의 JPG·PNG·WEBP 사진을 선택해 주세요.");
        ReceiptDraft r = gateway.extract(image);
        try {
            if (r == null || r.store() == null || r.store().isBlank() || r.store().length() > 120
                    || !LocalDate.parse(r.date()).toString().equals(r.date())
                    || !LedgerService.CURRENCIES.contains(r.currency()) || !LedgerService.LEDGER_CATEGORIES.contains(r.category())
                    || r.totalMinor() < 1 || r.totalMinor() > 1_000_000_000 || r.items() == null || r.items().isEmpty() || r.items().size() > 100
                    || r.items().stream().anyMatch(i -> i == null || i.name() == null || i.name().isBlank() || i.name().length() > 160
                        || i.quantity() < 1 || i.quantity() > 999 || i.unitMinor() < 1 || i.unitMinor() > 1_000_000_000)) throw new IllegalArgumentException();
        } catch (RuntimeException e) { throw new ApiException(422, "영수증의 상품이나 구매일을 정확히 읽지 못했어요. 직접 입력해 주세요."); }
        return r;
    }
}
