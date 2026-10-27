package com.wonit.travel.ocr;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

public record ReceiptDraft(
        @JsonProperty(required = true) String store,
        @JsonProperty(required = true) String date,
        @JsonProperty(required = true) String currency,
        @JsonProperty(required = true) String category,
        @JsonProperty(required = true) long totalMinor,
        @JsonProperty(required = true) List<Item> items) {
    public record Item(@JsonProperty(required = true) String name,
            @JsonProperty(required = true) int quantity,
            @JsonProperty(required = true) long unitMinor) {}
}
