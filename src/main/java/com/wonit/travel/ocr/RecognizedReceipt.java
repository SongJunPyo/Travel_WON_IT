package com.wonit.travel.ocr;

import java.util.List;

/** 사진에서 읽은 그대로의 값. 읽지 못한 항목은 null입니다. 금액은 소수 문자열입니다. */
public record RecognizedReceipt(String store, String address, String date, String currency, String category,
        String total, List<Item> items) {
    public record Item(String name, String nameKo, Integer quantity, String unitPrice) {}
}
