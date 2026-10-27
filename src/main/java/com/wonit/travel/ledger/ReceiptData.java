package com.wonit.travel.ledger;

import java.math.BigDecimal;
import java.util.List;

// 영수증의 요청·응답 형식입니다. 요청의 id·recordedAt은 무시하고 서버가 정합니다.
public record ReceiptData(Long id, String store, String address, Location location, String category,
        String browseCategory, String date, String currency, BigDecimal rate, Long totalMinor,
        Boolean shareConsent, List<Item> items, String recordedAt) {
    public record Location(Double latitude, Double longitude) {}
    public record Item(String name, String nameKo, Integer quantity, Long unitMinor) {}
}
