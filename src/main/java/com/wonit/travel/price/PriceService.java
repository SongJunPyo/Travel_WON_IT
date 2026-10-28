package com.wonit.travel.price;

import com.wonit.travel.ai.TtlCache;
import com.wonit.travel.api.ApiException;
import com.wonit.travel.ledger.LedgerService;
import com.wonit.travel.ledger.Receipt;
import com.wonit.travel.ledger.ReceiptItem;
import com.wonit.travel.ledger.ReceiptItemRepository;
import java.text.Normalizer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PriceService {
    // 거리순은 현재 위치 연동 후 제공합니다. 추천순은 PriceRecommender 점수로 정렬합니다.
    private static final String RECOMMENDED = "추천순";
    private static final Map<String, Comparator<PriceRecord>> ORDER = Map.of(
            "가격순", Comparator.comparingLong(PriceRecord::unitMinor).thenComparing(Comparator.comparingInt(PriceRecord::count).reversed()),
            "구매수", Comparator.comparingInt(PriceRecord::count).reversed().thenComparingLong(PriceRecord::unitMinor),
            "최신순", Comparator.comparing(PriceRecord::date).reversed().thenComparing(Comparator.comparingInt(PriceRecord::count).reversed()));
    private static final Logger log = LoggerFactory.getLogger(PriceService.class);
    // AI에는 점수 상위 10개를 보내고, 그중 가장 추천할 3개만 'AI 추천'으로 맨 위에 둡니다(배지가 흔해 보이지 않게).
    // 같은 조건·같은 후보의 결과는 10분(실패는 1분) 동안 다시 씁니다.
    private static final int AI_CANDIDATES = 10, AI_PICKS = 3;
    private static final Duration AI_CACHE = Duration.ofMinutes(10), AI_FAILURE_CACHE = Duration.ofMinutes(1);
    private final TtlCache<List<PriceRanker.Pick>> aiCache = new TtlCache<>(200);
    private final ReceiptItemRepository items;
    private final PriceRanker ranker;
    public PriceService(ReceiptItemRepository items, PriceRanker ranker) { this.items = items; this.ranker = ranker; }
    // 반경 안의 공유 영수증을 매장명·주소·상품별로 묶어 최근 가격과 구매수를 돌려줍니다.
    // category와 q는 함께 쓸 수 있고, 둘 다 없으면 반경 안의 모든 상품을 돌려줍니다. q는 상품명과 매장명을 찾습니다.
    @Transactional(readOnly = true)
    public List<PriceRecord> browse(String currency, Double latitude, Double longitude, Integer radius,
            String category, String q, String sort, PriceRecommender.Profile profile) {
        int meters = radius == null ? 3000 : radius;
        String order = sort == null ? "가격순" : sort;
        String query = q == null || q.isBlank() ? null : q.strip();
        String key = query == null ? null : LedgerService.normalize(query);
        if (currency == null || !LedgerService.CURRENCIES.contains(currency) || latitude == null || longitude == null
                || !Double.isFinite(latitude) || Math.abs(latitude) > 85.0511 || !Double.isFinite(longitude) || Math.abs(longitude) > 180
                || meters < 100 || meters > 20000 || !(ORDER.containsKey(order) || RECOMMENDED.equals(order))
                || (profile.budgetLeft() != null && (profile.budgetLeft() < -100 || profile.budgetLeft() > 100))
                || (profile.favorite() != null && !LedgerService.LEDGER_CATEGORIES.contains(profile.favorite()))
                || (category != null && !LedgerService.LEDGER_CATEGORIES.contains(category))
                || (query != null && (query.length() > 50 || key.isEmpty())))
            throw new ApiException(400, "조회 조건(통화·위치·반경·카테고리·검색어·정렬·예산)을 확인해 주세요.");
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
        List<PriceRecord> grouped = latest.entrySet().stream().map(e -> {
            ReceiptItem i = e.getValue();
            Receipt r = i.receipt();
            return new PriceRecord(String.valueOf(i.id()), r.storeName(), r.storeNameKo(), r.storeAddress(), r.latitude(), r.longitude(),
                    i.nameKo() == null ? i.rawName() : i.nameKo(), r.currency(), r.purchasedDate().toString(), i.unitMinor(),
                    r.ledgerCategory(), counts.get(e.getKey()), distance(latitude, longitude, r), null, false);
        }).toList();
        if (RECOMMENDED.equals(order)) {
            List<PriceRecommender.Scored> scored = PriceRecommender.score(grouped, profile, meters);
            String context = String.join("|", currency, String.valueOf(category), String.valueOf(key),
                    String.format(Locale.ROOT, "%.3f,%.3f", latitude, longitude), String.valueOf(meters),
                    String.valueOf(profile.budgetLeft()), String.valueOf(profile.favorite()));
            return aiRanked(scored, profile, context).stream().limit(200).toList();
        }
        return grouped.stream().sorted(ORDER.get(order).thenComparingLong(PriceRecord::distance).thenComparing(PriceRecord::id))
                .limit(200).toList();
    }
    // 추천순 2단계: 점수 상위 후보 중 AI가 3개를 골라 이유를 씁니다. 키가 없거나 실패하면 점수 순서와 규칙 이유를 그대로 씁니다.
    // AI 답은 믿지 않고 검사합니다: 후보에 없는 id·중복 id는 버리고, 3개를 넘으면 나머지를 버리며, 이유는 40자로 자릅니다.
    // AI가 고르지 않은 결과는 점수 순서와 규칙 이유로 그 뒤에 붙습니다.
    private List<PriceRecord> aiRanked(List<PriceRecommender.Scored> scored, PriceRecommender.Profile profile, String context) {
        List<PriceRecord> byScore = scored.stream().map(s -> s.record().withReason(s.reason(), false)).toList();
        if (!ranker.configured() || scored.size() < 2) return byScore;
        List<PriceRecommender.Scored> top = scored.subList(0, Math.min(AI_CANDIDATES, scored.size()));
        String cacheKey = context + "|" + top.stream().map(s -> s.record().id() + ":" + s.record().count() + ":" + s.record().unitMinor())
                .collect(Collectors.joining(","));
        List<PriceRanker.Pick> picks = aiCache.get(cacheKey);
        if (picks == null) {
            try {
                picks = List.copyOf(ranker.rank(top, profile));
                aiCache.put(cacheKey, picks, AI_CACHE);
            } catch (RuntimeException e) {
                log.warn("추천순 AI 재정렬 실패, 점수 순서 사용: {}", e.toString());
                picks = List.of();
                aiCache.put(cacheKey, picks, AI_FAILURE_CACHE);
            }
        }
        Map<String, PriceRecord> candidates = new HashMap<>();
        for (int i = 0; i < top.size(); i++) candidates.put(top.get(i).record().id(), byScore.get(i));
        List<PriceRecord> result = new ArrayList<>();
        Set<String> used = new HashSet<>();
        for (PriceRanker.Pick pick : picks) {
            if (result.size() == AI_PICKS) break;
            PriceRecord r = candidates.get(pick.id());
            if (r == null || !used.add(pick.id())) continue;
            String reason = pick.reason() == null ? "" : pick.reason().replaceAll("\\p{Cntrl}", " ").strip();
            if (reason.length() > 40) reason = reason.substring(0, 40);
            result.add(r.withReason(reason.isEmpty() ? r.reason() : reason, true));
        }
        for (PriceRecord r : byScore) if (used.add(r.id())) result.add(r);
        return result;
    }
    // 상품명(원문·한국어)과 매장명(원문·한국어) 중 하나라도 검색어를 포함하면 찾습니다. 띄어쓰기·대소문자는 무시합니다.
    private static boolean matches(ReceiptItem i, String query, String key) {
        Receipt r = i.receipt();
        return i.normalizedName().contains(key) || contains(i.rawName(), query, key) || contains(i.nameKo(), query, key)
                || contains(r.storeName(), query, key) || contains(r.storeNameKo(), query, key);
    }
    private static boolean contains(String text, String query, String key) {
        return text != null && (text.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT))
                || LedgerService.normalize(text).contains(key));
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
