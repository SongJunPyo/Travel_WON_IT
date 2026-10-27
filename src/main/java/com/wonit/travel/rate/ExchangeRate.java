package com.wonit.travel.rate;

import java.math.BigDecimal;

/** 1 외화당 원화. date는 고시일(YYYY-MM-DD), source는 화면에 보여 줄 출처입니다. */
public record ExchangeRate(String currency, BigDecimal rate, String date, String source) {}
