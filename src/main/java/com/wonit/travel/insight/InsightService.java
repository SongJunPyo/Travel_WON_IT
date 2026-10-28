package com.wonit.travel.insight;

import com.wonit.travel.Money;
import com.wonit.travel.ai.TtlCache;
import com.wonit.travel.api.ApiException;
import com.wonit.travel.ledger.DeviceRepository;
import com.wonit.travel.ledger.LedgerService;
import com.wonit.travel.ledger.ReceiptRepository;
import com.wonit.travel.ledger.TripData;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

// PAGE 1 '나의 소비 인사이트'.
// 1) 숫자는 서버가 계산합니다: 내 가계부(예산 속도·예상 총지출·남은 기간 하루 권장액)와,
//    이미 여행을 마친 같은 도시·통화 여행자들의 실제 기록(카테고리 비중 평균·하루 지출 중앙값·예산 사용률 중앙값).
// 2) AI는 그 숫자만으로 문장을 씁니다. 문장에 계산하지 않은 숫자가 나오면 버리고 규칙 기반 문장을 씁니다.
@Service
public class InsightService {
    private static final Logger log = LoggerFactory.getLogger(InsightService.class);
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    // 개인의 지출을 짐작할 수 없도록 5명 이상일 때만 다른 여행자와 비교합니다.
    private static final int MIN_PEERS = 5;
    private static final List<String> CATEGORIES = List.of("음식", "쇼핑", "숙박", "교통", "관광", "기타");
    private static final Duration PEER_CACHE = Duration.ofMinutes(10), AI_CACHE = Duration.ofMinutes(10),
            AI_FAILURE_CACHE = Duration.ofMinutes(1);
    private static final Pattern NUMBER = Pattern.compile("\\d[\\d,]*(?:\\.\\d+)?");

    // 비교 기준 여행 하나: 기간(일), 예산(원), 가데이터 여부, 카테고리별 원화 지출
    record PeerTrip(long deviceId, long days, long budget, boolean sample, Map<String, Double> spending) {
        double total() { return spending.values().stream().mapToDouble(Double::doubleValue).sum(); }
    }
    private record Facts(Map<String, Object> json, Insight fallback) {}

    private final TtlCache<List<PeerTrip>> peerCache = new TtlCache<>(50);
    private final TtlCache<Optional<SpendingAdvisor.Advice>> aiCache = new TtlCache<>(200);
    private final JsonMapper json = JsonMapper.builder().build();
    private final ReceiptRepository receipts;
    private final DeviceRepository devices;
    private final SpendingAdvisor advisor;

    public InsightService(ReceiptRepository receipts, DeviceRepository devices, SpendingAdvisor advisor) {
        this.receipts = receipts; this.devices = devices; this.advisor = advisor;
    }

    public Insight analyze(String authorization, InsightRequest request) {
        if (request == null) throw new ApiException(400, "가계부 요약을 확인해 주세요.");
        TripData trip = LedgerService.validateTrip(request.trip());
        Map<String, Long> spending = spending(request.categories());
        long total = spending.values().stream().mapToLong(Long::longValue).sum();
        if (total == 0)
            return new Insight("첫 영수증을 기록해 보세요", "영수증을 기록하면 예산을 쓰는 속도와 카테고리별 소비를 분석해 드려요.",
                    null, List.of(), null, false, false);
        LocalDate today = LocalDate.now(ZONE);
        List<PeerTrip> peers = peers(trip, today, self(authorization));
        Facts facts = facts(trip, spending, total, today, peers);
        return advisor.configured() ? withAi(facts) : facts.fallback();
    }

    // 앱 요약의 카테고리는 6개 중에서만, 금액은 0원 이상 1조 원 이하만 받습니다.
    private static Map<String, Long> spending(Map<String, Long> categories) {
        if (categories == null || categories.size() > CATEGORIES.size())
            throw new ApiException(400, "카테고리별 지출을 확인해 주세요.");
        Map<String, Long> result = new LinkedHashMap<>();
        for (String name : CATEGORIES) result.put(name, 0L);
        categories.forEach((name, amount) -> {
            if (!result.containsKey(name) || amount == null || amount < 0 || amount > 1_000_000_000_000L)
                throw new ApiException(400, "카테고리별 지출을 확인해 주세요.");
            result.put(name, amount);
        });
        return result;
    }

    // 요청한 기기 자신은 비교 기준에서 뺍니다. 토큰이 없거나 처음 보는 기기면 뺄 것이 없습니다.
    private Long self(String authorization) {
        try {
            return devices.findByTokenHash(LedgerService.hash(authorization)).map(d -> d.id()).orElse(null);
        } catch (ApiException e) {
            return null;
        }
    }

    // 이미 끝난 같은 도시·통화 여행을 기기별로 모읍니다. DB 집계는 도시·통화·날짜별로 10분 캐시하고,
    // 그사이 누군가 영수증을 새로 저장하면(가장 최근 영수증 번호가 바뀌면) 다시 집계합니다.
    private List<PeerTrip> peers(TripData trip, LocalDate today, Long self) {
        String key = trip.city() + "|" + trip.currency() + "|" + today + "|" + receipts.lastId();
        List<PeerTrip> all = peerCache.get(key);
        if (all == null) {
            Map<Long, PeerTrip> byDevice = new LinkedHashMap<>();
            for (Object[] row : receipts.spendingOfFinishedTrips(trip.city(), trip.currency(), today)) {
                long id = ((Number) row[0]).longValue();
                PeerTrip peer = byDevice.computeIfAbsent(id, k -> new PeerTrip(id,
                        ChronoUnit.DAYS.between((LocalDate) row[1], (LocalDate) row[2]) + 1, ((Number) row[3]).longValue(),
                        (Boolean) row[4], new HashMap<>()));
                // sum(최소 단위 × 환율) ÷ 10^소수자릿수 = 원화
                double won = new BigDecimal(row[7].toString()).movePointLeft(Money.DECIMALS.getOrDefault((String) row[6], 0)).doubleValue();
                peer.spending().merge((String) row[5], won, Double::sum);
            }
            all = List.copyOf(byDevice.values());
            peerCache.put(key, all, PEER_CACHE);
        }
        return all.stream().filter(p -> !Objects.equals(p.deviceId(), self) && p.total() > 0).toList();
    }

    private static Facts facts(TripData trip, Map<String, Long> spending, long total, LocalDate today, List<PeerTrip> peers) {
        LocalDate start = LocalDate.parse(trip.start()), end = LocalDate.parse(trip.end());
        long days = ChronoUnit.DAYS.between(start, end) + 1;
        long elapsed = today.isBefore(start) ? 0 : Math.min(days, ChronoUnit.DAYS.between(start, today) + 1);
        long remaining = days - elapsed, budget = trip.budget();
        Long usedPct = budget > 0 ? Math.round(total * 100.0 / budget) : null;
        long progressPct = Math.round(elapsed * 100.0 / days);
        Long daily = elapsed > 0 ? Math.round((double) total / elapsed) : null;
        Long projected = elapsed > 0 ? Math.round((double) total * days / elapsed) : null;
        Long projectedPct = projected != null && budget > 0 ? Math.round(projected * 100.0 / budget) : null;
        Long safeDaily = remaining > 0 && budget > total ? (budget - total) / remaining : null;
        Long over = budget > 0 && total > budget ? total - budget : null;
        boolean compare = peers.size() >= MIN_PEERS;
        String group = compare ? "여행을 마친 " + trip.city() + " 여행자 " + peers.size() + "명" : null;

        // 카테고리: 내 비중과 비교 기준 평균 비중(여행자별 비중의 평균)
        List<Map<String, Object>> categories = new ArrayList<>();
        Map<String, Object> biggestGap = null;
        for (String name : CATEGORIES) {
            long mine = Math.round(spending.get(name) * 100.0 / total);
            Long peer = compare ? Math.round(peers.stream().mapToDouble(p -> p.spending().getOrDefault(name, 0.0) * 100 / p.total())
                    .average().orElse(0)) : null;
            if (spending.get(name) == 0 && (peer == null || peer == 0)) continue;
            Map<String, Object> c = new LinkedHashMap<>();
            c.put("name", name);
            c.put("minePct", mine);
            c.put("peersPct", peer);
            c.put("diffPp", peer == null ? null : mine - peer);
            categories.add(c);
            if (peer != null && Math.abs(mine - peer) >= 3
                    && (biggestGap == null || Math.abs(mine - peer) > Math.abs((Long) biggestGap.get("diffPp")))) biggestGap = c;
        }
        categories.sort(Comparator.comparingLong((Map<String, Object> c) -> (Long) c.get("minePct")).reversed());
        Map<String, Object> top = categories.get(0);
        Long peerDaily = compare ? Math.round(median(peers.stream().map(p -> p.total() / p.days()).toList())) : null;
        List<Double> peerUsed = peers.stream().filter(p -> p.budget() > 0).map(p -> p.total() * 100 / p.budget()).toList();
        Long peerUsedPct = compare && !peerUsed.isEmpty() ? Math.round(median(peerUsed)) : null;

        Map<String, Object> tripFacts = new LinkedHashMap<>();
        tripFacts.put("city", trip.city());
        tripFacts.put("days", days);
        tripFacts.put("elapsedDays", elapsed);
        tripFacts.put("remainingDays", remaining);
        tripFacts.put("progressPct", progressPct);
        Map<String, Object> budgetFacts = new LinkedHashMap<>();
        budgetFacts.put("budget", won(budget));
        budgetFacts.put("spent", won(total));
        budgetFacts.put("usedPct", usedPct);
        budgetFacts.put("projectedTotal", won(projected));
        budgetFacts.put("projectedPct", projectedPct);
        budgetFacts.put("safeDailyBudget", won(safeDaily));
        budgetFacts.put("overBudget", won(over));
        Map<String, Object> dailyFacts = new LinkedHashMap<>();
        dailyFacts.put("mine", won(daily));
        dailyFacts.put("peersMedian", won(peerDaily));
        Map<String, Object> peerFacts = null;
        if (compare) {
            peerFacts = new LinkedHashMap<>();
            peerFacts.put("count", peers.size());
            peerFacts.put("description", group);
            peerFacts.put("medianBudgetUsedPct", peerUsedPct);
        }
        Map<String, Object> facts = new LinkedHashMap<>();
        facts.put("trip", tripFacts);
        facts.put("budget", budgetFacts);
        facts.put("dailyAverage", dailyFacts);
        facts.put("categories", categories);
        facts.put("peers", peerFacts);

        // AI가 없거나 실패했을 때 쓰는 규칙 기반 문장
        String headline;
        if (elapsed == 0) headline = "여행 전 지출을 기록하고 있어요";
        else if (projectedPct != null && projectedPct > 100) headline = "이대로면 예산의 " + projectedPct + "%를 쓰게 돼요";
        else if (usedPct != null && usedPct > progressPct + 10) headline = "예산을 여행 속도보다 빨리 쓰고 있어요";
        else if (usedPct != null) headline = "예산 안에서 잘 쓰고 있어요";
        else headline = top.get("name") + "에 가장 많이 썼어요";
        List<String> sentences = new ArrayList<>();
        if (usedPct != null && elapsed > 0) sentences.add("예산의 " + usedPct + "%를 썼고, 여행은 " + progressPct + "% 지났어요.");
        if (biggestGap != null) {
            long gap = (Long) biggestGap.get("diffPp");
            sentences.add(biggestGap.get("name") + " 비중은 " + biggestGap.get("minePct") + "%로, " + group + " 평균보다 "
                    + Math.abs(gap) + "%p " + (gap > 0 ? "높아요." : "낮아요."));
        } else {
            sentences.add(top.get("name") + " 비중이 " + top.get("minePct") + "%로 가장 커요.");
        }
        String tip = safeDaily != null ? "남은 " + remaining + "일은 하루 " + won(safeDaily) + " 안에서 쓰면 예산을 지킬 수 있어요."
                : over != null ? "예산을 " + won(over) + " 넘었어요. 남은 일정은 꼭 필요한 지출 위주로 계획해 보세요." : null;
        List<String> chips = new ArrayList<>();
        if (usedPct != null && elapsed > 0) chips.add("예산 " + usedPct + "% 사용 · 여행 " + progressPct + "% 경과");
        if (daily != null) chips.add("하루 평균 " + won(daily) + (peerDaily != null ? " · 여행자 중앙값 " + won(peerDaily) : ""));
        if (projected != null && remaining > 0) chips.add("이 속도면 총 " + won(projected));
        boolean sample = compare && peers.stream().anyMatch(PeerTrip::sample);
        return new Facts(facts, new Insight(headline, String.join(" ", sentences), tip, List.copyOf(chips), group, sample, false));
    }

    // AI 문장은 검사한 뒤에만 씁니다. 같은 숫자(facts)면 10분 동안 다시 쓰고, 실패는 1분 동안 기억해 반복 호출을 막습니다.
    private Insight withAi(Facts facts) {
        String key = json.writeValueAsString(facts.json());
        Optional<SpendingAdvisor.Advice> advice = aiCache.get(key);
        if (advice == null) {
            try {
                advice = Optional.ofNullable(checked(facts.json(), key, advisor.advise(facts.json())));
                aiCache.put(key, advice, advice.isPresent() ? AI_CACHE : AI_FAILURE_CACHE);
            } catch (RuntimeException e) {
                log.warn("소비 인사이트 AI 실패, 규칙 기반 문장 사용: {}", e.toString());
                advice = Optional.empty();
                aiCache.put(key, advice, AI_FAILURE_CACHE);
            }
        }
        Insight fallback = facts.fallback();
        return advice.map(a -> new Insight(a.headline(), a.body(), a.tip(), fallback.facts(), fallback.basis(), fallback.sampleData(), true))
                .orElse(fallback);
    }

    // 제목·본문이 비었거나, 문장에 facts에 없는 숫자가 있으면(계산·추측한 숫자) 쓰지 않습니다.
    private static SpendingAdvisor.Advice checked(Map<String, Object> facts, String factsJson, SpendingAdvisor.Advice advice) {
        if (advice == null) return null;
        String headline = clean(advice.headline(), 40), body = clean(advice.body(), 160), tip = clean(advice.tip(), 80);
        if (headline == null || body == null) return null;
        Set<String> allowed = numbers(factsJson);
        Set<String> used = numbers(headline + " " + body + " " + (tip == null ? "" : tip));
        used.removeAll(allowed);
        if (!used.isEmpty()) {
            log.warn("소비 인사이트 AI 문장에 근거 없는 숫자 {}, 규칙 기반 문장 사용", used);
            return null;
        }
        return new SpendingAdvisor.Advice(headline, body, tip);
    }

    private static Set<String> numbers(String text) {
        Set<String> found = new HashSet<>();
        Matcher m = NUMBER.matcher(text);
        while (m.find()) found.add(m.group().replace(",", ""));
        return found;
    }

    private static String clean(String text, int max) {
        if (text == null) return null;
        String value = text.replaceAll("\\p{Cntrl}", " ").strip();
        if (value.isEmpty()) return null;
        return value.length() > max ? value.substring(0, max) : value;
    }

    private static String won(Long value) { return value == null ? null : String.format(Locale.ROOT, "%,d원", value); }
    private static String won(long value) { return String.format(Locale.ROOT, "%,d원", value); }

    private static double median(List<Double> values) {
        List<Double> sorted = values.stream().sorted().toList();
        int n = sorted.size();
        return n % 2 == 1 ? sorted.get(n / 2) : (sorted.get(n / 2 - 1) + sorted.get(n / 2)) / 2;
    }
}
