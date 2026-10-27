package com.wonit.travel.ledger;

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
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

@Entity
@Table(name = "receipts", indexes = {
        @Index(name = "idx_receipts_device_date", columnList = "device_id, purchased_date"),
        @Index(name = "idx_receipts_browse", columnList = "share_consent, browse_category, currency")})
public class Receipt {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "device_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE) private Device device;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "trip_id")
    @OnDelete(action = OnDeleteAction.SET_NULL) private Trip trip;
    @Column(name = "store_name", nullable = false, length = 120) private String storeName;
    @Column(name = "store_address", nullable = false, length = 250) private String storeAddress;
    private Double latitude;
    private Double longitude;
    @Column(name = "ledger_category", nullable = false, length = 10) private String ledgerCategory;
    @Column(name = "browse_category", length = 20) private String browseCategory;
    @Column(name = "purchased_date", nullable = false) private LocalDate purchasedDate;
    @Column(nullable = false, length = 3) private String currency;
    @Column(name = "total_minor", nullable = false) private long totalMinor;
    @Column(nullable = false, precision = 12, scale = 4) private BigDecimal rate;
    @Column(name = "share_consent", nullable = false) private boolean shareConsent;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    @OneToMany(mappedBy = "receipt", cascade = CascadeType.ALL, orphanRemoval = true) @OrderBy("id")
    private List<ReceiptItem> items = new ArrayList<>();
    protected Receipt() {}
    Receipt(Device device) { this.device = device; this.createdAt = LocalDateTime.now(); }
    // 검증을 마친 값으로 덮어씁니다. 품목은 통째로 바꿉니다.
    void update(ReceiptData r, Trip trip) {
        this.trip = trip;
        storeName = r.store(); storeAddress = r.address(); ledgerCategory = r.category(); browseCategory = r.browseCategory();
        latitude = r.location() == null ? null : r.location().latitude();
        longitude = r.location() == null ? null : r.location().longitude();
        purchasedDate = LocalDate.parse(r.date()); currency = r.currency(); totalMinor = r.totalMinor(); rate = r.rate();
        shareConsent = r.shareConsent();
        items.clear();
        r.items().forEach(i -> items.add(new ReceiptItem(this, i)));
    }
    ReceiptData data() {
        return new ReceiptData(id, storeName, storeAddress, latitude == null ? null : new ReceiptData.Location(latitude, longitude),
                ledgerCategory, browseCategory, purchasedDate.toString(), currency, rate, totalMinor, shareConsent,
                items.stream().map(ReceiptItem::data).toList(), createdAt.toString());
    }
    public Long id() { return id; }
    public String storeName() { return storeName; }
    public String storeAddress() { return storeAddress; }
    public Double latitude() { return latitude; }
    public Double longitude() { return longitude; }
    public String browseCategory() { return browseCategory; }
    public LocalDate purchasedDate() { return purchasedDate; }
    public String currency() { return currency; }
    public LocalDateTime createdAt() { return createdAt; }
}
