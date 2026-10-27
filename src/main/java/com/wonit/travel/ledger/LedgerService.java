package com.wonit.travel.ledger;

import com.wonit.travel.api.ApiException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LedgerService {
    public static final Set<String> CURRENCIES = Set.of("EUR", "USD", "JPY", "THB", "KRW");
    public static final Set<String> LEDGER_CATEGORIES = Set.of("음식", "쇼핑", "교통", "숙박", "관광", "기타");
    public static final Set<String> BROWSE_CATEGORIES = Set.of("식당", "명소", "화장품", "의류", "뷰티·웰니스", "숙박", "액티비티", "렌트");
    private static final BigDecimal MAX_RATE = BigDecimal.valueOf(1_000_000);
    public record Ledger(TripData trip, List<ReceiptData> receipts) {}
    private final DeviceRepository devices;
    private final TripRepository trips;
    private final ReceiptRepository receipts;
    public LedgerService(DeviceRepository devices, TripRepository trips, ReceiptRepository receipts) {
        this.devices = devices; this.trips = trips; this.receipts = receipts;
    }
    // 처음 보는 기기는 저장할 때 만들고, 조회만 할 때는 빈 가계부를 돌려줍니다.
    @Transactional(readOnly = true)
    public Ledger ledger(String authorization) {
        return devices.findByTokenHash(hash(authorization))
                .map(d -> new Ledger(trips.findByDevice(d).map(Trip::data).orElse(null),
                        receipts.findByDeviceOrderByPurchasedDateDescCreatedAtDesc(d).stream().map(Receipt::data).toList()))
                .orElse(new Ledger(null, List.of()));
    }
    @Transactional
    public synchronized TripData saveTrip(String authorization, TripData request) {
        TripData t = validate(request);
        Device device = device(authorization);
        Trip trip = trips.findByDevice(device).orElseGet(() -> new Trip(device));
        trip.update(t);
        return trips.saveAndFlush(trip).data();
    }
    @Transactional
    public synchronized ReceiptData create(String authorization, ReceiptData request) {
        ReceiptData r = validate(request);
        Device device = device(authorization);
        if (receipts.countByDevice(device) >= 1000) throw new ApiException(507, "기기당 영수증은 1,000개까지 저장할 수 있어요.");
        if (receipts.count() >= 30000) throw new ApiException(507, "시연 서버의 저장 한도에 도달했어요.");
        Receipt receipt = new Receipt(device);
        receipt.update(r, trips.findByDevice(device).orElse(null));
        return receipts.saveAndFlush(receipt).data();
    }
    @Transactional
    public synchronized ReceiptData update(String authorization, Long id, ReceiptData request) {
        ReceiptData r = validate(request);
        Receipt receipt = own(authorization, id);
        receipt.update(r, trips.findByDevice(devices.findByTokenHash(hash(authorization)).orElseThrow()).orElse(null));
        return receipts.saveAndFlush(receipt).data();
    }
    @Transactional
    public synchronized void delete(String authorization, Long id) {
        receipts.delete(own(authorization, id));
    }
    // 다른 기기의 영수증은 있는지조차 알리지 않도록 같은 404로 응답합니다.
    private Receipt own(String authorization, Long id) {
        return devices.findByTokenHash(hash(authorization)).flatMap(d -> receipts.findByIdAndDevice(id, d))
                .orElseThrow(() -> new ApiException(404, "영수증을 찾지 못했어요."));
    }
    private Device device(String authorization) {
        String tokenHash = hash(authorization);
        return devices.findByTokenHash(tokenHash).orElseGet(() -> devices.saveAndFlush(new Device(tokenHash)));
    }
    private TripData validate(TripData t) {
        if (t == null || !text(t.city(), 50) || !text(t.country(), 50) || !date(t.start()) || !date(t.end())
                || LocalDate.parse(t.start()).isAfter(LocalDate.parse(t.end())) || !in(CURRENCIES, t.currency())
                || t.budget() == null || t.budget() < 0 || t.budget() > 1_000_000_000_000L || !rate(t.rate()))
            throw new ApiException(400, "여행 도시·기간·예산·통화·환율을 확인해 주세요.");
        return new TripData(t.city().strip(), t.country().strip(), t.start(), t.end(), t.budget(), t.currency(), t.rate());
    }
    private ReceiptData validate(ReceiptData r) {
        if (r == null || !text(r.store(), 120) || (r.address() != null && r.address().strip().length() > 250)
                || !date(r.date()) || !in(CURRENCIES, r.currency()) || !in(LEDGER_CATEGORIES, r.category())
                || (!blank(r.browseCategory()) && !in(BROWSE_CATEGORIES, r.browseCategory())) || r.shareConsent() == null)
            throw new ApiException(400, "매장명·구매일·통화·카테고리를 확인해 주세요.");
        if (!rate(r.rate())) throw new ApiException(400, "적용 환율을 확인해 주세요.");
        ReceiptData.Location location = r.location();
        if (location != null && (location.latitude() == null || location.longitude() == null
                || !Double.isFinite(location.latitude()) || Math.abs(location.latitude()) > 85.0511
                || !Double.isFinite(location.longitude()) || Math.abs(location.longitude()) > 180))
            throw new ApiException(400, "매장 위치를 확인해 주세요.");
        if (r.shareConsent() && location == null) throw new ApiException(400, "가격을 공유하려면 매장 위치가 필요해요.");
        if (r.items() == null || r.items().isEmpty() || r.items().size() > 100
                || r.items().stream().anyMatch(i -> i == null || !text(i.name(), 160) || (i.nameKo() != null && i.nameKo().strip().length() > 160)
                    || i.quantity() == null || i.quantity() < 1 || i.quantity() > 999
                    || i.unitMinor() == null || i.unitMinor() < 1 || i.unitMinor() > 1_000_000_000))
            throw new ApiException(400, "상품명·수량·개당 가격을 확인해 주세요.");
        if (r.totalMinor() == null || r.totalMinor() < 1 || r.totalMinor() > 1_000_000_000)
            throw new ApiException(400, "총 결제금액을 확인해 주세요.");
        if (r.items().stream().mapToLong(i -> i.unitMinor() * i.quantity()).sum() != r.totalMinor())
            throw new ApiException(400, "상품 합계와 총 결제금액이 달라요. 할인·세금은 상품 가격에 반영해 주세요.");
        List<ReceiptData.Item> items = r.items().stream().map(i -> new ReceiptData.Item(i.name().strip(),
                blank(i.nameKo()) ? null : i.nameKo().strip(), i.quantity(), i.unitMinor())).toList();
        return new ReceiptData(null, r.store().strip(), r.address() == null ? "" : r.address().strip(), location, r.category(),
                blank(r.browseCategory()) ? null : r.browseCategory(), r.date(), r.currency(), r.rate(), r.totalMinor(),
                r.shareConsent(), items, null);
    }
    // 같은 상품을 묶는 기준입니다. 영수증 원문 이름을 정규화합니다.
    public static String normalize(String value) {
        String normalized = Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT)
                .replaceAll("코카\\s*콜라|coca[\\s-]*cola|coke", "코카콜라")
                .replaceAll("에비앙|evian", "에비앙");
        normalized = Pattern.compile("(\\d+(?:\\.\\d+)?)\\s*l\\b").matcher(normalized)
                .replaceAll(match -> new BigDecimal(match.group(1)).multiply(BigDecimal.valueOf(1000)).stripTrailingZeros().toPlainString() + "ml");
        return normalized.replaceAll("[\\s._-]+", "").replace("밀리리터", "ml");
    }
    private static boolean in(Set<String> values, String value) { return value != null && values.contains(value); }
    private static boolean blank(String value) { return value == null || value.isBlank(); }
    private static boolean text(String value, int max) { return !blank(value) && value.strip().length() <= max; }
    private static boolean rate(BigDecimal rate) {
        return rate != null && rate.signum() > 0 && rate.compareTo(MAX_RATE) <= 0 && rate.stripTrailingZeros().scale() <= 4;
    }
    private static boolean date(String value) {
        try { return value != null && LocalDate.parse(value).toString().equals(value); } catch (RuntimeException e) { return false; }
    }
    private static String hash(String authorization) {
        if (authorization == null || !authorization.matches("Bearer [\\w-]{40,160}"))
            throw new ApiException(401, "기기 식별 토큰이 필요해요.");
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(authorization.substring(7).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
