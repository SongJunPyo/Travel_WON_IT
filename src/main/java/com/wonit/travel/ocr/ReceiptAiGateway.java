package com.wonit.travel.ocr;

public interface ReceiptAiGateway {
    ReceiptDraft extract(String image);
}
