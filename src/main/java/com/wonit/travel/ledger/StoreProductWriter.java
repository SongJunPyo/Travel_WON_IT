package com.wonit.travel.ledger;

import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/** 같은 매장·상품·통화의 최신 구매일 단가와 구매 횟수를 store_products에 씁니다. */
@Component
public class StoreProductWriter {
    private final StoreProductRepository repository;
    public StoreProductWriter(StoreProductRepository repository) { this.repository = repository; }

    public void rebuild(List<ReceiptItemEntity> shared) {
        repository.deleteAllInBatch();
        Map<String, List<ReceiptItemEntity>> groups = new LinkedHashMap<>();
        for (var item : shared) {
            var r = item.getReceipt();
            String key = r.getStore().getId() + "|" + item.getProduct().getId() + "|" + r.getCurrency();
            groups.computeIfAbsent(key, k -> new java.util.ArrayList<>()).add(item);
        }
        var newest = Comparator.<ReceiptItemEntity, java.time.LocalDate>comparing(i -> i.getReceipt().getPurchasedDate())
                .thenComparing(i -> i.getReceipt().getRecordedAt());
        repository.saveAll(groups.values().stream().map(list -> {
            var latest = list.stream().max(newest).orElseThrow();
            var r = latest.getReceipt();
            return new StoreProductEntity(r.getStore(), latest.getProduct(), r.getCurrency(),
                    latest.getUnitMinor(), r.getPurchasedDate(), list.size());
        }).toList());
    }
}
