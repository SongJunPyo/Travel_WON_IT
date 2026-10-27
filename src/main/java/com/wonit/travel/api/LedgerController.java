package com.wonit.travel.api;

import com.wonit.travel.ledger.LedgerService;
import com.wonit.travel.ledger.ReceiptData;
import com.wonit.travel.ledger.TripData;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

// PAGE 1 가계부: 기기 토큰(Authorization: Bearer ...)으로 내 여행과 영수증만 읽고 씁니다.
@RestController
public class LedgerController {
    private final LedgerService ledger;
    public LedgerController(LedgerService ledger) { this.ledger = ledger; }
    @GetMapping("/ledger")
    public LedgerService.Ledger ledger(@RequestHeader(value = "Authorization", required = false) String token) { return ledger.ledger(token); }
    @PutMapping(path = "/trip", consumes = "application/json")
    public Map<String, TripData> trip(@RequestHeader(value = "Authorization", required = false) String token, @RequestBody TripData request) {
        return Map.of("trip", ledger.saveTrip(token, request));
    }
    @PostMapping(path = "/receipts", consumes = "application/json") @ResponseStatus(HttpStatus.CREATED)
    public Map<String, ReceiptData> create(@RequestHeader(value = "Authorization", required = false) String token, @RequestBody ReceiptData request) {
        return Map.of("receipt", ledger.create(token, request));
    }
    @PutMapping(path = "/receipts/{id}", consumes = "application/json")
    public Map<String, ReceiptData> update(@RequestHeader(value = "Authorization", required = false) String token, @PathVariable Long id, @RequestBody ReceiptData request) {
        return Map.of("receipt", ledger.update(token, id, request));
    }
    @DeleteMapping("/receipts/{id}")
    public Map<String, Boolean> delete(@RequestHeader(value = "Authorization", required = false) String token, @PathVariable Long id) {
        ledger.delete(token, id); return Map.of("ok", true);
    }
}
