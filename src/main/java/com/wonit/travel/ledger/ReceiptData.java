package com.wonit.travel.ledger;

import java.math.BigDecimal;
import java.util.List;

// 앱의 Receipt(src/types.ts)와 같은 모양입니다. 요청의 id는 검사만 하고, 서버가 DB 번호를 새로 정합니다.
// store는 영수증 원문 매장명, storeKo는 한국어 매장명(없으면 null)입니다.
// browseCategory는 PAGE 2 카테고리(없으면 null)이고, demo 영수증은 서버에 저장하지 않습니다.
public record ReceiptData(String id, String store, String storeKo, String address, Location location, String category,
        String browseCategory, String date, String currency, BigDecimal rate, Long totalMinor,
        Boolean shareConsent, Boolean demo, List<Item> items, String recordedAt) {
    public record Location(Double latitude, Double longitude) {}
    public record Item(String name, String nameKo, Integer quantity, Long unitMinor) {}
}
