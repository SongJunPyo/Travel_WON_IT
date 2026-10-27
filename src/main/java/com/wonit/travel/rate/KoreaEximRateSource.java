package com.wonit.travel.rate;

import com.wonit.travel.api.DomainException;
import com.wonit.travel.api.ErrorCode;
import java.net.URI;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;

/** 한국수출입은행 현재환율 API(data=AP01)를 부릅니다. 인증키는 환경 변수 KOREAEXIM_API_KEY에서만 읽습니다. */
@Component
public class KoreaEximRateSource implements RateSource {
    private static final Logger log = LoggerFactory.getLogger(KoreaEximRateSource.class);
    private final RestClient http;
    private final String apiKey;
    private final String url;

    public KoreaEximRateSource(@Value("${KOREAEXIM_API_KEY:}") String apiKey,
            @Value("${app.exchange-rate.url:https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON}") String url) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(4));
        factory.setReadTimeout(Duration.ofSeconds(6));
        this.http = RestClient.builder().requestFactory(factory).build();
        this.apiKey = apiKey == null ? "" : apiKey.strip();
        this.url = url;
    }

    @Override
    public String fetch(LocalDate day) {
        if (apiKey.isEmpty()) throw new DomainException(ErrorCode.RATE_UNAVAILABLE);
        URI uri = UriComponentsBuilder.fromUriString(url).queryParam("authkey", apiKey)
                .queryParam("searchdate", day.format(DateTimeFormatter.BASIC_ISO_DATE)).queryParam("data", "AP01")
                .encode().build().toUri();
        try {
            return http.get().uri(uri).retrieve().body(String.class);
        } catch (RuntimeException e) {
            // 예외 메시지에는 인증키가 든 주소가 들어갈 수 있어 예외 종류만 남깁니다.
            log.warn("환율 조회 실패: {}", e.getClass().getSimpleName());
            throw new DomainException(ErrorCode.RATE_UNAVAILABLE);
        }
    }
}
