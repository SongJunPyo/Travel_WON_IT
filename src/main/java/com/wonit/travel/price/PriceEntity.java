package com.wonit.travel.price;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

@Entity
@Table(name = "shared_prices", indexes = @Index(name = "idx_prices_owner", columnList = "owner_hash"))
public class PriceEntity {
    @Id @Column(length = 200) private String id;
    @Column(name = "owner_hash", nullable = false, length = 64) private String ownerHash;
    @Column(nullable = false, length = 150) private String receiptId;
    @Column(nullable = false, length = 120) private String store;
    @Column(nullable = false, length = 250) private String address;
    private double latitude;
    private double longitude;
    @Column(nullable = false, length = 160) private String product;
    @Column(nullable = false, length = 200) private String normalized;
    @Column(nullable = false, length = 3) private String currency;
    @Column(name = "purchased_date", nullable = false, length = 10) private String date;
    private long unitMinor;
    @Column(nullable = false, length = 35) private String recordedAt;
    protected PriceEntity() {}
    PriceEntity(String ownerHash, PriceRecord r) {
        this.id = ownerHash.substring(0, 12) + ":" + r.id();
        this.ownerHash = ownerHash; this.receiptId = r.receiptId(); this.store = r.store();
        this.address = r.address(); this.latitude = r.latitude(); this.longitude = r.longitude();
        this.product = r.product(); this.normalized = r.normalized(); this.currency = r.currency();
        this.date = r.date(); this.unitMinor = r.unitMinor(); this.recordedAt = r.recordedAt();
    }
    public PriceRecord publicRecord() {
        return new PriceRecord(id, receiptId, store, address, latitude, longitude, product, normalized,
                currency, date, unitMinor, recordedAt, false);
    }
}
