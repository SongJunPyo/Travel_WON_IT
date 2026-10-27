package com.wonit.travel.price;

// PAGE 2에 보여 줄 매장·상품별 최근 가격입니다. 기기 정보는 담지 않습니다.
public record PriceRecord(String id, String store, String address, double latitude, double longitude,
        String product, String currency, String date, long unitMinor, String category, int count, long distance) {}
