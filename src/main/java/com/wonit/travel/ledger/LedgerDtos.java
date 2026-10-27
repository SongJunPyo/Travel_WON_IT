package com.wonit.travel.ledger;

import java.math.BigDecimal;
import java.util.List;

/** 앱의 TravelState(src/types.ts)와 같은 모양입니다. rate는 1 외화당 원화(소수 4자리까지)입니다. */
public final class LedgerDtos {
    private LedgerDtos() {}
    public record TravelState(Integer version, Trip trip, List<Receipt> receipts) {}
    public record Trip(String city, String country, String start, String end, Long budget, String currency, BigDecimal rate) {}
    public record Receipt(String id, String store, String date, String category, String currency, BigDecimal rate,
            List<Item> items, Long totalMinor, Boolean shareConsent, Boolean demo,
            Coordinate location, String address, String recordedAt) {}
    /** name은 영수증 원어 그대로, nameKo는 한국어 번역(없으면 null)입니다. */
    public record Item(String name, String nameKo, Integer quantity, Long unitMinor) {}
    public record Coordinate(Double latitude, Double longitude) {}
}
