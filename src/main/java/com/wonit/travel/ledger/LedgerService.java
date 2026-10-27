package com.wonit.travel.ledger;

import com.wonit.travel.api.ApiException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
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
    // 앱의 TravelState(src/types.ts)와 같은 모양입니다.
    public record TravelState(Integer version, TripData trip, List<ReceiptData> receipts) {}
    private final DeviceRepository devices;
    private final TripRepository trips;
    private final ReceiptRepository receipts;
    public LedgerService(DeviceRepository devices, TripRepository trips, ReceiptRepository receipts) {
        this.devices = devices; this.trips = trips; this.receipts = receipts;
    }
    // 저장한 적이 없는 기기는 null을 돌려줍니다. 앱은 이때 기기의 시연 가계부로 시작합니다.
    @Transactional(readOnly = true)
    public TravelState load(String authorization) {
        return devices.findByTokenHash(hash(authorization)).flatMap(d -> trips.findByDevice(d).map(t -> new TravelState(1, t.data(),
                receipts.findByDeviceOrderByIdAsc(d).stream().map(Receipt::data).toList()))).orElse(null);
    }
    // 이 기기의 여행과 영수증을 통째로 바꿉니다. 하나라도 잘못되면 아무것도 바꾸지 않습니다.
    // 시연 영수증은 저장하지 않고, 공유는 매장 위치가 있는 영수증만 합니다.
    @Transactional
    public synchronized void replace(String authorization, TravelState state) {
        String tokenHash = hash(authorization);
        if (state == null || !Integer.valueOf(1).equals(state.version()) || state.receipts() == null)
            throw new ApiException(400, "가계부 형식을 확인해 주세요.");
        TripData t = validate(state.trip());
        List<ReceiptData> rows = state.receipts().stream().filter(r -> r == null || !Boolean.TRUE.equals(r.demo())).map(this::validate).toList();
        if (rows.size() > 1000) throw new ApiException(400, "기기당 영수증은 1,000개까지 저장할 수 있어요.");
        Device device = devices.findByTokenHash(tokenHash).orElseGet(() -> devices.saveAndFlush(new Device(tokenHash)));
        List<Receipt> old = receipts.findByDeviceOrderByIdAsc(device);
        if (receipts.count() - old.size() + rows.size() > 30000) throw new ApiException(507, "시연 서버의 저장 한도에 도달했어요.");
        receipts.deleteAll(old);
        receipts.flush();
        Trip trip = trips.findByDevice(device).orElseGet(() -> new Trip(device));
        trip.update(t);
        trips.saveAndFlush(trip);
        for (ReceiptData r : rows) {
            Receipt receipt = new Receipt(device, recordedAt(r.recordedAt()));
            receipt.update(r, trip);
            receipts.save(receipt);
        }
        receipts.flush();
    }
    // 앱이 기록한 저장 시각을 그대로 써서, 같은 날 산 기록 중 최근 것을 고를 때 순서가 바뀌지 않게 합니다.
    private static LocalDateTime recordedAt(String value) {
        try { return LocalDateTime.ofInstant(Instant.parse(value), ZoneId.systemDefault()); }
        catch (RuntimeException e) { return LocalDateTime.now(); }
    }
    private TripData validate(TripData t) {
        if (t == null || !text(t.city(), 50) || !text(t.country(), 50) || !date(t.start()) || !date(t.end())
                || LocalDate.parse(t.start()).isAfter(LocalDate.parse(t.end())) || !in(CURRENCIES, t.currency())
                || t.budget() == null || t.budget() < 0 || t.budget() > 1_000_000_000_000L || !rate(t.rate()))
            throw new ApiException(400, "여행 도시·기간·예산·통화·환율을 확인해 주세요.");
        return new TripData(t.city().strip(), t.country().strip(), t.start(), t.end(), t.budget(), t.currency(), t.rate());
    }
    private ReceiptData validate(ReceiptData r) {
        if (r == null || !text(r.store(), 120) || (r.storeKo() != null && r.storeKo().strip().length() > 120)
                || (r.address() != null && r.address().strip().length() > 250)
                || !date(r.date()) || !in(CURRENCIES, r.currency()) || !in(LEDGER_CATEGORIES, r.category())
                || (!blank(r.browseCategory()) && !in(BROWSE_CATEGORIES, r.browseCategory())) || !text(r.id(), 150))
            throw new ApiException(400, "매장명·구매일·통화·카테고리를 확인해 주세요.");
        if (!rate(r.rate())) throw new ApiException(400, "적용 환율을 확인해 주세요.");
        ReceiptData.Location location = r.location();
        if (location != null && (location.latitude() == null || location.longitude() == null
                || !Double.isFinite(location.latitude()) || Math.abs(location.latitude()) > 85.0511
                || !Double.isFinite(location.longitude()) || Math.abs(location.longitude()) > 180))
            throw new ApiException(400, "매장 위치를 확인해 주세요.");
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
        return new ReceiptData(r.id(), r.store().strip(), blank(r.storeKo()) ? null : r.storeKo().strip(),
                r.address() == null ? "" : r.address().strip(), location, r.category(),
                blank(r.browseCategory()) ? null : r.browseCategory(), r.date(), r.currency(), r.rate(), r.totalMinor(),
                Boolean.TRUE.equals(r.shareConsent()) && location != null, false, items, r.recordedAt());
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
