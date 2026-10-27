package com.wonit.travel.ledger;

import com.wonit.travel.Money;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/** 영수증 (헤더). client_id는 앱이 만든 영수증 id입니다. */
@Entity
@Table(name = "receipts",
        uniqueConstraints = @UniqueConstraint(name = "uq_receipt_client", columnNames = {"device_id", "client_id"}),
        indexes = @Index(name = "idx_receipt_share", columnList = "share_consent, demo"))
public class ReceiptEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "device_id", nullable = false)
    private DeviceEntity device;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "trip_id")
    private TripEntity trip;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "store_id", nullable = false)
    private StoreEntity store;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "category_id", nullable = false)
    private CategoryEntity category;
    @Column(name = "client_id", nullable = false, length = 150) private String clientId;
    @Column(name = "purchased_date", nullable = false) private LocalDate purchasedDate;
    @Column(nullable = false, length = 3) private String currency;
    @Column(name = "total_minor", nullable = false) private long totalMinor;
    @Column(nullable = false, precision = 14, scale = 4) private BigDecimal rate;
    @Column(name = "total_krw", nullable = false) private long totalKrw;
    @Column(name = "share_consent", nullable = false) private boolean shareConsent;
    @Column(nullable = false) private boolean demo;
    private Double latitude;
    private Double longitude;
    @Column(name = "recorded_at", nullable = false, length = 35) private String recordedAt;
    @OneToMany(mappedBy = "receipt", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<ReceiptItemEntity> items = new ArrayList<>();

    protected ReceiptEntity() {}
    ReceiptEntity(DeviceEntity device, TripEntity trip, StoreEntity store, CategoryEntity category,
            LedgerDtos.Receipt r, long totalKrw) {
        this.device = device; this.trip = trip; this.store = store; this.category = category;
        this.clientId = r.id(); this.purchasedDate = LocalDate.parse(r.date()); this.currency = r.currency();
        this.totalMinor = r.totalMinor(); this.rate = r.rate(); this.totalKrw = totalKrw;
        // 동의 절차 없이 시연이 아닌 영수증은 모두 가격 비교에 공유합니다 (앱이 보낸 shareConsent 값은 쓰지 않음).
        this.demo = Boolean.TRUE.equals(r.demo()); this.shareConsent = !this.demo;
        if (r.location() != null) { this.latitude = r.location().latitude(); this.longitude = r.location().longitude(); }
        this.recordedAt = r.recordedAt();
    }

    void addItem(ReceiptItemEntity item) { items.add(item); }
    void locateAt(Double latitude, Double longitude) { this.latitude = latitude; this.longitude = longitude; }

    LedgerDtos.Receipt toDto() {
        var location = latitude == null || longitude == null ? null : new LedgerDtos.Coordinate(latitude, longitude);
        return new LedgerDtos.Receipt(clientId, store.getName(), purchasedDate.toString(), category.getName(), currency, Money.compactRate(rate),
                items.stream().map(item -> item.toDto()).toList(), totalMinor, shareConsent, demo,
                location, store.getAddress(), recordedAt);
    }

    public Long getId() { return id; }
    public String getClientId() { return clientId; }
    public StoreEntity getStore() { return store; }
    public LocalDate getPurchasedDate() { return purchasedDate; }
    public String getCurrency() { return currency; }
    public Double getLatitude() { return latitude; }
    public Double getLongitude() { return longitude; }
    public String getRecordedAt() { return recordedAt; }
}
