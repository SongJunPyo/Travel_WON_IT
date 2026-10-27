package com.wonit.travel.rate;

import java.time.LocalDate;

/** 한국수출입은행 현재환율 API의 하루치 응답(JSON 문자열). 테스트에서는 가짜 구현을 씁니다. */
public interface RateSource {
    /** 키가 없거나 호출에 실패하면 DomainException(RATE_UNAVAILABLE)을 던집니다. */
    String fetch(LocalDate day);
}
