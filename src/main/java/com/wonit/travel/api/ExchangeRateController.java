package com.wonit.travel.api;

import com.wonit.travel.Money;
import com.wonit.travel.rate.ExchangeRate;
import com.wonit.travel.rate.ExchangeRateService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/** 영수증의 적용 환율 칸에 채울 참고 환율(한국수출입은행 매매기준율)을 돌려줍니다. */
@RestController
public class ExchangeRateController {
    private final ExchangeRateService rates;
    public ExchangeRateController(ExchangeRateService rates) { this.rates = rates; }

    /** 예: GET /api/exchange-rates/JPY → {"currency":"JPY","rate":8.3983,"date":"2026-10-27","source":"한국수출입은행 매매기준율"} */
    @GetMapping("/api/exchange-rates/{currency}")
    public ExchangeRate rate(@PathVariable String currency) {
        if (!Money.supported(currency)) throw new ApiException(400, "지원하지 않는 통화예요.");
        return rates.krwPer(currency);
    }
}
