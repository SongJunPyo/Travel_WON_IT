package com.wonit.travel.api;

import com.wonit.travel.ledger.LedgerService;
import java.util.HashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

// PAGE 1 가계부: 기기 토큰(Authorization: Bearer ...)으로 이 기기의 가계부만 통째로 읽고 씁니다.
@RestController
public class LedgerController {
    private final LedgerService ledger;
    public LedgerController(LedgerService ledger) { this.ledger = ledger; }
    // 저장한 적이 없으면 state가 null입니다.
    @GetMapping("/ledger")
    public Map<String, LedgerService.TravelState> ledger(@RequestHeader(value = "Authorization", required = false) String token) {
        Map<String, LedgerService.TravelState> body = new HashMap<>();
        body.put("state", ledger.load(token));
        return body;
    }
    @PutMapping(path = "/ledger", consumes = "application/json")
    public Map<String, Boolean> replace(@RequestHeader(value = "Authorization", required = false) String token,
            @RequestBody LedgerService.TravelState state) {
        ledger.replace(token, state); return Map.of("ok", true);
    }
}
