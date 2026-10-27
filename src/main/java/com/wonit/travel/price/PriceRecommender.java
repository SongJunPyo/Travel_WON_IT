package com.wonit.travel.price;

import com.wonit.travel.ledger.LedgerService;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

// 추천순 1단계: 같은 조건이면 늘 같은 순서가 나오는 점수입니다. AI 재정렬이 실패하면 이 순서를 그대로 씁니다.
// 점수 = 가격 이점(같은 상품의 주변 중앙값 대비) + 인기(구매수) + 최근성 + 거리 + 개인화(자주 쓰는 카테고리)
// 남은 예산이 30% 미만이면 가격 이점의 비중을 키웁니다.
public final class PriceRecommender {
    // budgetLeft: 남은 예산 비율(%, 예산 초과면 음수), favorite: 가장 많이 쓴 가계부 카테고리. 둘 다 없을 수 있습니다.
    public record Profile(Integer budgetLeft, String favorite) {
        public boolean tight() { return budgetLeft != null && budgetLeft < 30; }
    }
    // priceEdge: 같은 상품의 주변 중앙값보다 싼 비율(-0.5~0.5, 비교 대상이 없으면 0)
    public record Scored(PriceRecord record, double score, double priceEdge, boolean cheapest, String reason) {}

    private PriceRecommender() {}

    public static List<Scored> score(List<PriceRecord> records, Profile profile, int radius) {
        if (records.isEmpty()) return List.of();
        Map<String, List<Long>> prices = new HashMap<>();
        for (PriceRecord r : records) prices.computeIfAbsent(LedgerService.normalize(r.product()), k -> new ArrayList<>()).add(r.unitMinor());
        int maxCount = records.stream().mapToInt(PriceRecord::count).max().orElse(1);
        LocalDate newest = records.stream().map(r -> LocalDate.parse(r.date())).max(Comparator.naturalOrder()).orElseThrow();
        boolean tight = profile.tight();
        double wPrice = tight ? 0.45 : 0.30, wPopular = tight ? 0.20 : 0.30, wRecent = 0.15, wNear = tight ? 0.20 : 0.25;
        List<Scored> scored = new ArrayList<>();
        for (PriceRecord r : records) {
            List<Long> same = prices.get(LedgerService.normalize(r.product()));
            double edge = 0;
            boolean cheapest = false;
            if (same.size() >= 2) {
                double median = median(same);
                edge = Math.max(-0.5, Math.min(0.5, (median - r.unitMinor()) / median));
                cheapest = r.unitMinor() == same.stream().mapToLong(Long::longValue).min().orElseThrow();
            }
            double popular = Math.log1p(r.count()) / Math.log1p(maxCount);
            long days = ChronoUnit.DAYS.between(LocalDate.parse(r.date()), newest);
            double recent = Math.exp(-days / 30.0);
            double near = 1 - Math.min(r.distance(), radius) / (double) radius;
            double score = wPrice * (0.5 + edge) + wPopular * popular + wRecent * recent + wNear * near
                    + (profile.favorite() != null && profile.favorite().equals(r.category()) ? 0.05 : 0);
            scored.add(new Scored(r, score, edge, cheapest, reason(r, cheapest, edge, maxCount, days)));
        }
        scored.sort(Comparator.comparingDouble(Scored::score).reversed()
                .thenComparingLong(s -> s.record().unitMinor()).thenComparingLong(s -> s.record().distance())
                .thenComparing(s -> s.record().id()));
        return scored;
    }

    // 점수에 가장 크게 기여한 근거 하나를 짧게 보여 줍니다. 근거가 약하면 이유를 붙이지 않습니다.
    private static String reason(PriceRecord r, boolean cheapest, double edge, int maxCount, long days) {
        if (cheapest && edge > 0) return "주변 최저가";
        if (r.count() >= 2 && r.count() == maxCount) return "구매 " + r.count() + "회로 가장 많음";
        if (r.distance() <= 500) return "도보 약 " + Math.max(1, (int) Math.ceil(r.distance() / 70.0)) + "분";
        if (days == 0) return "가장 최근 구매";
        return null;
    }

    private static double median(List<Long> values) {
        List<Long> sorted = values.stream().sorted().toList();
        int n = sorted.size();
        return n % 2 == 1 ? sorted.get(n / 2) : (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2.0;
    }
}
