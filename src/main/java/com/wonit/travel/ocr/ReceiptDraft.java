package com.wonit.travel.ocr;

import java.util.List;

/** 앱 편집 화면에 채울 인식 초안. 매장명·한국어 매장명·매장 주소·구매일·한국어 상품명은 읽지 못하면 null입니다. */
public record ReceiptDraft(String store, String storeKo, String address, String date, String currency, String category,
        long totalMinor, List<Item> items) {
    /** name은 영수증 원어 그대로, nameKo는 한국어 번역입니다. */
    public record Item(String name, String nameKo, int quantity, long unitMinor) {}
}
