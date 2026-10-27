package com.wonit.travel.rate;

import com.wonit.travel.Money;
import com.wonit.travel.api.DomainException;
import com.wonit.travel.api.ErrorCode;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 한국수출입은행 매매기준율로 1 외화당 원화를 돌려줍니다. 오늘 고시가 없으면(주말·공휴일·고시 전) 최대 7일 전까지
 * 거슬러 올라갑니다. 고시가 있는 날의 응답은 메모리에 캐시하고, 오늘의 빈 응답은 10분 뒤에 다시 조회합니다.
 */
@Service
public class ExchangeRateService {
    static final String SOURCE = "한국수출입은행 매매기준율";
    private static final int MAX_DAYS_BACK = 7;
    private static final Duration EMPTY_RECHECK = Duration.ofMinutes(10);
    /** "EUR" · "JPY(100)" → 통화 코드와 고시 단위 */
    private static final Pattern UNIT = Pattern.compile("([A-Z]{3})(?:\\((\\d+)\\))?");

    private final RateSource source;
    private final JsonMapper mapper;
    private final Clock clock;
    private final Map<LocalDate, Map<String, BigDecimal>> days = new ConcurrentHashMap<>();
    private final Map<LocalDate, Instant> recheckEmpty = new ConcurrentHashMap<>();

    @Autowired
    public ExchangeRateService(RateSource source, JsonMapper mapper) {
        this(source, mapper, Clock.system(ZoneId.of("Asia/Seoul")));
    }
    ExchangeRateService(RateSource source, JsonMapper mapper, Clock clock) {
        this.source = source; this.mapper = mapper; this.clock = clock;
    }

    public ExchangeRate krwPer(String currency) {
        LocalDate today = LocalDate.now(clock);
        if ("KRW".equals(currency)) return new ExchangeRate("KRW", BigDecimal.ONE, today.toString(), SOURCE);
        for (int back = 0; back <= MAX_DAYS_BACK; back++) {
            LocalDate day = today.minusDays(back);
            var rates = published(day, today);
            if (rates.isEmpty()) continue;
            BigDecimal rate = rates.get(currency);
            if (rate == null) throw unavailable();
            return new ExchangeRate(currency, rate, day.toString(), SOURCE);
        }
        throw unavailable();
    }

    /** 그날 고시된 환율. 고시가 없으면 빈 Map입니다. */
    private Map<String, BigDecimal> published(LocalDate day, LocalDate today) {
        var cached = days.get(day);
        if (cached != null) return cached;
        Instant now = clock.instant();
        var recheck = recheckEmpty.get(day);
        if (recheck != null && now.isBefore(recheck)) return Map.of();
        var rates = parse(source.fetch(day));
        // 지난 날의 빈 응답(주말·공휴일)은 바뀌지 않으니 캐시하고, 오늘은 고시 전일 수 있어 잠시 뒤 다시 봅니다.
        if (!rates.isEmpty() || day.isBefore(today)) days.put(day, rates);
        else recheckEmpty.put(day, now.plus(EMPTY_RECHECK));
        return rates;
    }

    /** [{result:1, cur_unit:"JPY(100)", deal_bas_r:"839.83"}, …] → {JPY=8.3983}. 쉼표를 지우고 고시 단위로 나눕니다. */
    private Map<String, BigDecimal> parse(String body) {
        JsonNode root;
        try {
            root = body == null ? null : mapper.readTree(body);
        } catch (JacksonException e) {
            throw unavailable();
        }
        if (root == null || !root.isArray()) throw unavailable();
        Map<String, BigDecimal> rates = new HashMap<>();
        for (JsonNode row : root) {
            // result 1이 성공입니다. 인증키 오류·호출 한도 초과 등 그 밖의 값은 모두 조회 실패로 봅니다.
            if (row.path("result").asInt(0) != 1) throw unavailable();
            Matcher unit = UNIT.matcher(row.path("cur_unit").asString(""));
            String deal = row.path("deal_bas_r").asString("").replace(",", "").strip();
            if (!unit.matches() || !Money.supported(unit.group(1)) || deal.isEmpty()) continue;
            try {
                BigDecimal per = unit.group(2) == null ? BigDecimal.ONE : new BigDecimal(unit.group(2));
                BigDecimal rate = Money.compactRate(new BigDecimal(deal).divide(per, 4, RoundingMode.HALF_UP));
                if (Money.validRate(rate)) rates.put(unit.group(1), rate);
            } catch (ArithmeticException | NumberFormatException e) {
                // 읽을 수 없는 행은 건너뜁니다.
            }
        }
        return rates;
    }

    private static DomainException unavailable() { return new DomainException(ErrorCode.RATE_UNAVAILABLE); }
}
