package com.wonit.travel.price;

// PAGE 2에 보여 줄 매장·상품별 최근 가격입니다. 기기 정보는 담지 않습니다.
// store는 영수증 원문 매장명, storeKo는 한국어 매장명(없으면 null)입니다.
public record PriceRecord(String id, String store, String storeKo, String address, double latitude, double longitude,
        String product, String currency, String date, long unitMinor, String category, int count, long distance) {}
