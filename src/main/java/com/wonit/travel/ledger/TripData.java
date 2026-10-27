package com.wonit.travel.ledger;

import java.math.BigDecimal;

// 여행 설정의 요청·응답 형식입니다. rate는 1 현지통화당 원화(소수 4자리까지)입니다.
public record TripData(String city, String country, String start, String end, Long budget,
        String currency, BigDecimal rate) {}
