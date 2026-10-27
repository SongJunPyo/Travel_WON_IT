package com.wonit.travel.ledger;

import com.wonit.travel.Money;
import com.wonit.travel.api.ApiException;
import com.wonit.travel.price.PriceService;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 기기별 가계부(여행 1개 + 영수증)를 DB에 저장하고 읽습니다. 저장은 전체 스냅샷 교체입니다. */
@Service
public class LedgerService {
    public static final List<String> CATEGORIES = List.of("음식", "쇼핑", "교통", "숙박", "관광", "기타");
    private static final int MAX_RECEIPTS = 2000;

    private final DeviceRepository devices;
    private final TripRepository trips;
    private final ReceiptRepository receipts;
    private final StoreRepository stores;
    private final ProductRepository products;
    private final CategoryRepository categories;
    private final PriceService prices;
    private final StoreGeocoder geocoder;

    public LedgerService(DeviceRepository devices, TripRepository trips, ReceiptRepository receipts,
            StoreRepository stores, ProductRepository products, CategoryRepository categories, PriceService prices,
            StoreGeocoder geocoder) {
        this.devices = devices; this.trips = trips; this.receipts = receipts; this.stores = stores;
        this.products = products; this.categories = categories; this.prices = prices; this.geocoder = geocoder;
    }

    /** 저장된 가계부가 없으면 null. */
    @Transactional(readOnly = true)
    public LedgerDtos.TravelState load(String authorization) {
        var device = devices.findByTokenHash(DeviceTokens.hash(authorization)).orElse(null);
        if (device == null) return null;
        var trip = trips.findByDevice(device).orElse(null);
        if (trip == null) return null;
        return new LedgerDtos.TravelState(1, trip.toDto(),
                receipts.findByDeviceOrderByIdAsc(device).stream().map(receipt -> receipt.toDto()).toList());
    }

    @Transactional
    public synchronized void replace(String authorization, LedgerDtos.TravelState state) {
        String owner = DeviceTokens.hash(authorization);
        validate(state);
        var device = devices.findByTokenHash(owner).orElseGet(() -> devices.save(new DeviceEntity(owner)));
        receipts.deleteAll(receipts.findByDeviceOrderByIdAsc(device));
        trips.findByDevice(device).ifPresent(trips::delete);
        receipts.flush();
        trips.flush();
        var trip = trips.save(new TripEntity(device, state.trip()));
        for (var r : state.receipts()) {
            var category = categories.findByName(r.category()).orElseThrow(this::invalid);
            var store = store(r);
            var receipt = new ReceiptEntity(device, trip, store, category, r,
                    Money.toWon(r.totalMinor(), r.currency(), r.rate()));
            // 앱에서 위치를 받지 않으므로, 영수증 주소로 찾은 매장 좌표를 영수증 위치로 씁니다.
            if (r.location() == null && store.getLatitude() != null)
                receipt.locateAt(store.getLatitude(), store.getLongitude());
            for (int i = 0; i < r.items().size(); i++) {
                var item = r.items().get(i);
                // 같은 상품을 여러 나라 영수증에서 묶을 수 있게 한국어 번역 이름을 우선 정규화합니다.
                String productName = item.nameKo() == null || item.nameKo().isBlank() ? item.name() : item.nameKo();
                receipt.addItem(new ReceiptItemEntity(receipt, product(productName, category), i, item));
            }
            receipts.save(receipt);
        }
        receipts.flush();
        prices.refreshStoreProducts();
    }

    private StoreEntity store(LedgerDtos.Receipt r) {
        String name = r.store().strip(), address = r.address() == null ? "" : r.address().strip();
        var store = stores.findByNameAndAddress(name, address).orElseGet(() -> stores.save(new StoreEntity(name, address)));
        if (r.location() != null) store.locate(r.location().latitude(), r.location().longitude());
        else if (store.getLatitude() == null && !address.isEmpty() && !Boolean.TRUE.equals(r.demo()))
            geocoder.locate(address).ifPresent(p -> store.locate(p.latitude(), p.longitude()));
        return store;
    }

    private ProductEntity product(String name, CategoryEntity category) {
        String normalized = PriceService.normalize(name);
        if (normalized.isBlank() || normalized.length() > 200) return null;
        return products.findByNormalizedName(normalized)
                .orElseGet(() -> products.save(new ProductEntity(normalized, name.strip(), category)));
    }

    /** 앱의 validateReceipt와 같은 기준으로 검사합니다. */
    private void validate(LedgerDtos.TravelState s) {
        if (s == null || s.trip() == null || s.receipts() == null || s.receipts().size() > MAX_RECEIPTS) throw invalid();
        var t = s.trip();
        if (!text(t.city(), 50) || !text(t.country(), 50) || !date(t.start()) || !date(t.end())
                || t.budget() == null || t.budget() < 0 || t.budget() > 1_000_000_000_000L
                || !Money.supported(t.currency()) || !Money.validRate(t.rate())) throw invalid();
        Set<String> ids = new HashSet<>();
        for (var r : s.receipts()) {
            if (r == null || !text(r.id(), 150) || !ids.add(r.id()) || !text(r.store(), 120) || !date(r.date())
                    || !Money.supported(r.currency()) || !CATEGORIES.contains(r.category()) || !Money.validRate(r.rate())
                    || r.items() == null || r.items().isEmpty() || r.items().size() > 100
                    || r.totalMinor() == null || r.totalMinor() < 1 || r.totalMinor() > Money.MAX_MINOR
                    || (r.address() != null && r.address().length() > 250)
                    || !text(r.recordedAt(), 35)) throw invalid();
            if (r.location() != null) {
                var l = r.location();
                if (l.latitude() == null || l.longitude() == null || !Double.isFinite(l.latitude()) || !Double.isFinite(l.longitude())
                        || Math.abs(l.latitude()) > 85.0511 || Math.abs(l.longitude()) > 180) throw invalid();
            }
            long sum = 0;
            for (var i : r.items()) {
                if (i == null || !text(i.name(), 160) || (i.nameKo() != null && i.nameKo().length() > 160) || i.quantity() == null || i.quantity() < 1 || i.quantity() > 999
                        || i.unitMinor() == null || i.unitMinor() < 1 || i.unitMinor() > Money.MAX_MINOR) throw invalid();
                sum += i.unitMinor() * i.quantity();
            }
            if (sum != r.totalMinor()) throw invalid();
        }
    }

    private static boolean text(String value, int max) { return value != null && !value.isBlank() && value.length() <= max; }
    private static boolean date(String value) {
        try { return value != null && LocalDate.parse(value).toString().equals(value); }
        catch (DateTimeParseException e) { return false; }
    }
    private ApiException invalid() { return new ApiException(400, "가계부의 여행·영수증 정보를 확인해 주세요."); }
}
