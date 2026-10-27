package com.wonit.travel.api;

import com.wonit.travel.ocr.OcrService;
import com.wonit.travel.ocr.ReceiptDraft;
import com.wonit.travel.price.PriceRecord;
import com.wonit.travel.price.PriceService;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TravelController {
    public record OcrRequest(String image) {}
    private record Limit(int count, long expires) {}
    private final ConcurrentHashMap<String, Limit> limits = new ConcurrentHashMap<>();
    private final PriceService prices;
    private final OcrService ocr;
    public TravelController(PriceService prices, OcrService ocr) { this.prices = prices; this.ocr = ocr; }
    @GetMapping("/health") public Map<String, Boolean> health() { return Map.of("ok", true, "ocrConfigured", ocr.configured()); }
    // PAGE 2: 공유 동의한 영수증을 반경 안에서 카테고리(category) 또는 상품명(q)으로 조회합니다.
    @GetMapping("/prices")
    public Map<String, List<PriceRecord>> prices(@RequestParam(required = false) String currency,
            @RequestParam(required = false) Double latitude, @RequestParam(required = false) Double longitude,
            @RequestParam(required = false) Integer radius, @RequestParam(required = false) String category,
            @RequestParam(required = false) String q, @RequestParam(required = false) String sort) {
        return Map.of("records", prices.browse(currency, latitude, longitude, radius, category, q, sort));
    }
    @PostMapping(path = "/ocr", consumes = "application/json")
    public Map<String, ReceiptDraft> ocr(@RequestBody OcrRequest request, HttpServletRequest servlet) {
        long now = System.currentTimeMillis();
        if (limits.size() > 10000) limits.entrySet().removeIf(e -> e.getValue().expires() < now);
        Limit limit = limits.compute(servlet.getRemoteAddr(), (key, old) -> old == null || old.expires() < now
                ? new Limit(1, now + 3600000) : new Limit(old.count() + 1, old.expires()));
        if (limit.count() > 20) throw new ApiException(429, "시간당 분석 한도에 도달했어요. 직접 입력을 이용해 주세요.");
        return Map.of("receipt", ocr.extract(request.image()));
    }
}
