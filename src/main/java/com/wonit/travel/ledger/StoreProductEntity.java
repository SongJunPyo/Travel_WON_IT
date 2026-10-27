package com.wonit.travel.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDate;

/** 가게-상품 (가격): 가격 비교에 공유되는 영수증에서 계산한 매장별 최근 구매가격. */
@Entity
@Table(name = "store_products",
        uniqueConstraints = @UniqueConstraint(name = "uq_store_product", columnNames = {"store_id", "product_id", "currency"}))
public class StoreProductEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "store_id", nullable = false)
    private StoreEntity store;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "product_id", nullable = false)
    private ProductEntity product;
    @Column(nullable = false, length = 3) private String currency;
    @Column(name = "latest_unit_minor", nullable = false) private long latestUnitMinor;
    @Column(name = "last_purchased_date", nullable = false) private LocalDate lastPurchasedDate;
    @Column(name = "purchase_count", nullable = false) private int purchaseCount;

    protected StoreProductEntity() {}
    StoreProductEntity(StoreEntity store, ProductEntity product, String currency,
            long latestUnitMinor, LocalDate lastPurchasedDate, int purchaseCount) {
        this.store = store; this.product = product; this.currency = currency;
        this.latestUnitMinor = latestUnitMinor; this.lastPurchasedDate = lastPurchasedDate; this.purchaseCount = purchaseCount;
    }

    public long getLatestUnitMinor() { return latestUnitMinor; }
    public LocalDate getLastPurchasedDate() { return lastPurchasedDate; }
    public int getPurchaseCount() { return purchaseCount; }
    public String getCurrency() { return currency; }
}
