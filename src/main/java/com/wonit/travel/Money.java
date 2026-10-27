package com.wonit.travel;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Map;

/** 금액은 최소 통화 단위 정수(EUR 1.80 → 180, JPY·KRW는 그대로)로 다룹니다. */
public final class Money {
    public static final Map<String, Integer> DECIMALS = Map.of("EUR", 2, "USD", 2, "THB", 2, "JPY", 0, "KRW", 0);
    public static final long MAX_MINOR = 1_000_000_000L;
    public static final BigDecimal MAX_RATE = BigDecimal.valueOf(1_000_000);
    private Money() {}
    public static boolean supported(String currency) { return currency != null && DECIMALS.containsKey(currency); }
    /** "12.40" 같은 소수 문자열을 최소 단위로 바꿉니다. 읽을 수 없거나 범위를 벗어나면 -1. */
    public static long parseMinor(String amount, String currency) {
        if (amount == null || !supported(currency)) return -1;
        try {
            long minor = new BigDecimal(amount.strip()).movePointRight(DECIMALS.get(currency))
                    .setScale(0, RoundingMode.HALF_UP).longValueExact();
            return minor >= 1 && minor <= MAX_MINOR ? minor : -1;
        } catch (RuntimeException e) {
            return -1;
        }
    }
    /** 적용 환율(1 외화당 원화)은 0보다 크고 1,000,000 이하, 소수 4자리까지입니다. */
    public static boolean validRate(BigDecimal rate) {
        return rate != null && rate.signum() > 0 && rate.compareTo(MAX_RATE) <= 0 && rate.stripTrailingZeros().scale() <= 4;
    }
    /** 계산한 환율(8.398300)을 앱에 줄 때 뒤의 0을 뺍니다(1600, 8.3983). */
    public static BigDecimal compactRate(BigDecimal rate) {
        BigDecimal stripped = rate.stripTrailingZeros();
        return stripped.scale() < 0 ? stripped.setScale(0) : stripped;
    }
}
