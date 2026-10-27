package com.wonit.travel.price;

import com.wonit.travel.api.ApiException;
import com.wonit.travel.ledger.LedgerService;
import com.wonit.travel.ledger.Receipt;
import com.wonit.travel.ledger.ReceiptItem;
import com.wonit.travel.ledger.ReceiptItemRepository;
import java.text.Normalizer;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PriceService {
    // 거리순은 현재 위치 연동 후 제공합니다.
    private static final Map<String, Comparator<PriceRecord>> ORDER = Map.of(
            "가격순", Comparator.comparingLong(PriceRecord::unitMinor).thenComparing(Comparator.comparingInt(PriceRecord::count).reversed()),
            "구매수", Comparator.comparingInt(PriceRecord::count).reversed().thenComparingLong(PriceRecord::unitMinor),
            "최신순", Comparator.comparing(PriceRecord::date).reversed().thenComparing(Comparator.comparingInt(PriceRecord::count).reversed()));
    private final ReceiptItemRepository items;
    public PriceService(ReceiptItemRepository items) { this.items = items; }
    // 반경 안의 공유 영수증을 매장명·주소·상품별로 묶어 최근 가격과 구매수를 돌려줍니다.
    // category와 q는 함께 쓸 수 있고, 둘 다 없으면 반경 안의 모든 상품을 돌려줍니다.
    @Transactional(readOnly = true)
    public List<PriceRecord> browse(String currency, Double latitude, Double longitude, Integer radius,
            String category, String q, String sort) {
        int meters = radius == null ? 3000 : radius;
        String order = sort == null ? "가격순" : sort;
        String query = q == null || q.isBlank() ? null : q.strip();
        String key = query == null ? null : LedgerService.normalize(query);
        if (currency == null || !LedgerService.CURRENCIES.contains(currency) || latitude == null || longitude == null
                || !Double.isFinite(latitude) || Math.abs(latitude) > 85.0511 || !Double.isFinite(longitude) || Math.abs(longitude) > 180
                || meters < 100 || meters > 20000 || !ORDER.containsKey(order)
                || (category != null && !LedgerService.BROWSE_CATEGORIES.contains(category))
                || (query != null && (query.length() > 50 || key.isEmpty())))
            throw new ApiException(400, "조회 조건(통화·위치·반경·카테고리·검색어·정렬)을 확인해 주세요.");
        double dLat = meters / 111_320.0, dLng = meters / (111_320.0 * Math.cos(Math.toRadians(latitude)));
        Map<String, ReceiptItem> latest = new HashMap<>();
        Map<String, Integer> counts = new HashMap<>();
        for (ReceiptItem i : items.findShared(currency, category, latitude - dLat, latitude + dLat, longitude - dLng, longitude + dLng)) {
            Receipt r = i.receipt();
            if (query != null && !matches(i, query, key)) continue;
            if (distance(latitude, longitude, r) > meters) continue;
            String group = compact(r.storeName()) + "|" + compact(r.storeAddress()) + "|" + i.normalizedName();
            latest.merge(group, i, (a, b) -> newer(b, a) ? b : a);
            counts.merge(group, 1, Integer::sum);
        }
        return latest.entrySet().stream().map(e -> {
            ReceiptItem i = e.getValue();
            Receipt r = i.receipt();
            return new PriceRecord(String.valueOf(i.id()), r.storeName(), r.storeAddress(), r.latitude(), r.longitude(),
                    i.nameKo() == null ? i.rawName() : i.nameKo(), r.currency(), r.purchasedDate().toString(), i.unitMinor(),
                    r.browseCategory(), counts.get(e.getKey()), distance(latitude, longitude, r));
        }).sorted(ORDER.get(order).thenComparingLong(PriceRecord::distance).thenComparing(PriceRecord::id)).limit(200).toList();
    }
    private static boolean matches(ReceiptItem i, String query, String key) {
        String lower = query.toLowerCase(Locale.ROOT);
        return i.normalizedName().contains(key) || i.rawName().toLowerCase(Locale.ROOT).contains(lower)
                || (i.nameKo() != null && (i.nameKo().toLowerCase(Locale.ROOT).contains(lower) || LedgerService.normalize(i.nameKo()).contains(key)));
    }
    private static boolean newer(ReceiptItem a, ReceiptItem b) {
        Receipt x = a.receipt(), y = b.receipt();
        int byDate = x.purchasedDate().compareTo(y.purchasedDate());
        if (byDate != 0) return byDate > 0;
        int byCreated = x.createdAt().compareTo(y.createdAt());
        return byCreated != 0 ? byCreated > 0 : a.id() > b.id();
    }
    private static String compact(String value) {
        return Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }
    private static long distance(double latitude, double longitude, Receipt r) {
        double dLat = Math.toRadians(r.latitude() - latitude), dLng = Math.toRadians(r.longitude() - longitude);
        double h = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(latitude)) * Math.cos(Math.toRadians(r.latitude())) * Math.pow(Math.sin(dLng / 2), 2);
        return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
    }
}
