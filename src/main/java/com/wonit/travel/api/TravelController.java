package com.wonit.travel.api;

import com.wonit.travel.ocr.ReceiptReader;
import com.wonit.travel.price.PriceRecord;
import com.wonit.travel.price.PriceService;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

// 영수증 사진 인식은 ReceiptOcrController(POST /api/receipts/ocr, Claude)가 맡습니다.
@RestController
public class TravelController {
    private final PriceService prices;
    private final ReceiptReader reader;
    public TravelController(PriceService prices, ReceiptReader reader) { this.prices = prices; this.reader = reader; }
    @GetMapping("/health") public Map<String, Boolean> health() { return Map.of("ok", true, "ocrConfigured", reader.configured()); }
    // PAGE 2: 공유 동의한 영수증을 반경 안에서 카테고리(category) 또는 상품명(q)으로 조회합니다.
    @GetMapping("/prices")
    public Map<String, List<PriceRecord>> prices(@RequestParam(required = false) String currency,
            @RequestParam(required = false) Double latitude, @RequestParam(required = false) Double longitude,
            @RequestParam(required = false) Integer radius, @RequestParam(required = false) String category,
            @RequestParam(required = false) String q, @RequestParam(required = false) String sort) {
        return Map.of("records", prices.browse(currency, latitude, longitude, radius, category, q, sort));
    }
}
