package com.wonit.travel.price;

import com.wonit.travel.ledger.ReceiptItemEntity;
import com.wonit.travel.ledger.ReceiptItemRepository;
import com.wonit.travel.ledger.StoreProductWriter;
import java.math.BigDecimal;
import java.text.Normalizer;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 시연이 아닌 영수증 품목에서 가격 비교 기록을 만듭니다. 기기 토큰·사진 등은 내보내지 않습니다. */
@Service
public class PriceService {
    private final ReceiptItemRepository items;
    private final StoreProductWriter storeProducts;

    public PriceService(ReceiptItemRepository items, StoreProductWriter storeProducts) {
        this.items = items; this.storeProducts = storeProducts;
    }

    @Transactional(readOnly = true)
    public List<PriceRecord> get() {
        return items.findShared().stream().map(PriceService::record).toList();
    }

    /** store_products(매장별 최근 구매가격)를 공유 품목에서 다시 계산합니다. */
    @Transactional
    public void refreshStoreProducts() { storeProducts.rebuild(items.findShared()); }

    private static PriceRecord record(ReceiptItemEntity i) {
        var r = i.getReceipt();
        return new PriceRecord("r" + r.getId() + "-" + i.getPosition(), r.getClientId(), r.getStore().getName(),
                r.getStore().getAddress(), r.getLatitude(), r.getLongitude(), i.getDisplayName(), i.getRawName(),
                i.getProduct().getNormalizedName(), r.getCurrency(), r.getPurchasedDate().toString(),
                i.getUnitMinor(), r.getRecordedAt(), false);
    }

    public static String normalize(String value) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT)
                .replaceAll("코카\\s*콜라|coca[\\s-]*cola|coke", "코카콜라")
                .replaceAll("에비앙|evian", "에비앙");
        normalized = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*l\\b").matcher(normalized)
                .replaceAll(match -> new BigDecimal(match.group(1)).multiply(BigDecimal.valueOf(1000)).stripTrailingZeros().toPlainString() + "ml");
        return normalized.replaceAll("[\\s._-]+", "").replace("밀리리터", "ml");
    }
}
