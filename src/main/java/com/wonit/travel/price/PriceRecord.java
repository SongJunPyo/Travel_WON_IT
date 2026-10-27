package com.wonit.travel.price;

public record PriceRecord(String id, String receiptId, String store, String address,
        Double latitude, Double longitude, String product, String normalized,
        String currency, String date, Long unitMinor, String recordedAt, Boolean demo) {}
