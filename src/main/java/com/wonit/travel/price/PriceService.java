package com.wonit.travel.price;

import com.wonit.travel.api.ApiException;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.util.regex.Pattern;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PriceService {
    public static final Set<String> CURRENCIES = Set.of("EUR", "USD", "JPY", "THB", "KRW");
    private final PriceRepository repository;
    public PriceService(PriceRepository repository) { this.repository = repository; }
    @Transactional(readOnly = true)
    public List<PriceRecord> get() { return repository.findAll().stream().map(PriceEntity::publicRecord).toList(); }
    @Transactional
    public synchronized void replace(String authorization, List<PriceRecord> rows) {
        if (authorization == null || !authorization.matches("Bearer [\\w-]{40,160}"))
            throw new ApiException(401, "기기 식별 토큰이 필요해요.");
        if (rows == null || rows.size() > 3000) throw new ApiException(400, "공유 상품은 3,000개 이하로 등록해 주세요.");
        List<PriceRecord> safe = rows.stream().map(this::validate).toList();
        String owner = hash(authorization.substring(7));
        repository.deleteByOwnerHash(owner);
        repository.flush();
        if (repository.count() + safe.size() > 30000) throw new ApiException(507, "시연 서버의 공유 데이터 한도에 도달했어요.");
        repository.saveAll(safe.stream().map(r -> new PriceEntity(owner, r)).toList());
        repository.flush();
    }
    private PriceRecord validate(PriceRecord r) {
        if (r == null || !text(r.id(), 180) || !text(r.receiptId(), 150) || !text(r.store(), 120)
                || !text(r.address(), 250) || !text(r.product(), 160) || !CURRENCIES.contains(r.currency() == null ? "" : r.currency())
                || r.unitMinor() == null || r.unitMinor() < 1 || r.unitMinor() > 1_000_000_000
                || r.latitude() == null || !Double.isFinite(r.latitude()) || Math.abs(r.latitude()) > 85.0511
                || r.longitude() == null || !Double.isFinite(r.longitude()) || Math.abs(r.longitude()) > 180
                || !Boolean.FALSE.equals(r.demo())) throw invalid();
        try { if (!LocalDate.parse(r.date()).toString().equals(r.date())) throw invalid(); }
        catch (RuntimeException e) { throw invalid(); }
        String recordedAt;
        try { recordedAt = Instant.parse(r.recordedAt()).toString(); } catch (RuntimeException e) { recordedAt = Instant.now().toString(); }
        return new PriceRecord(r.id(), r.receiptId(), r.store().strip(), r.address().strip(),
                r.latitude(), r.longitude(), r.product().strip(), normalize(r.product()), r.currency(),
                r.date(), r.unitMinor(), recordedAt, false);
    }
    public static String normalize(String value) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT)
                .replaceAll("코카\\s*콜라|coca[\\s-]*cola|coke", "코카콜라")
                .replaceAll("에비앙|evian", "에비앙");
        normalized = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*l\\b").matcher(normalized)
                .replaceAll(match -> new BigDecimal(match.group(1)).multiply(BigDecimal.valueOf(1000)).stripTrailingZeros().toPlainString() + "ml");
        return normalized.replaceAll("[\\s._-]+", "").replace("밀리리터", "ml");
    }
    private boolean text(String value, int max) { return value != null && !value.isBlank() && value.length() <= max; }
    private ApiException invalid() { return new ApiException(400, "공유 상품의 매장·위치·가격·구매일을 확인해 주세요."); }
    private String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8))); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }
}
