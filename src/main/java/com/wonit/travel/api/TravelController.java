package com.wonit.travel.api;

import com.wonit.travel.ledger.LedgerDtos;
import com.wonit.travel.ledger.LedgerService;
import com.wonit.travel.ocr.ReceiptReader;
import com.wonit.travel.price.PriceRecord;
import com.wonit.travel.price.PriceService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class TravelController {
    private final PriceService prices;
    private final LedgerService ledger;
    private final ReceiptReader reader;
    public TravelController(PriceService prices, LedgerService ledger, ReceiptReader reader) {
        this.prices = prices; this.ledger = ledger; this.reader = reader;
    }
    @GetMapping("/health") public Map<String, Boolean> health() { return Map.of("ok", true, "ocrConfigured", reader.configured()); }
    @GetMapping("/prices") public Map<String, List<PriceRecord>> prices() { return Map.of("records", prices.get()); }
    /** 이 기기의 가계부. 아직 저장한 적이 없으면 state가 null입니다. */
    @GetMapping("/ledger")
    public Map<String, LedgerDtos.TravelState> ledger(@RequestHeader(value = "Authorization", required = false) String token) {
        Map<String, LedgerDtos.TravelState> body = new HashMap<>();
        body.put("state", ledger.load(token));
        return body;
    }
    @PutMapping(path = "/ledger", consumes = "application/json")
    public Map<String, Boolean> ledger(@RequestHeader(value = "Authorization", required = false) String token,
            @RequestBody LedgerDtos.TravelState state) {
        ledger.replace(token, state);
        return Map.of("ok", true);
    }
}
