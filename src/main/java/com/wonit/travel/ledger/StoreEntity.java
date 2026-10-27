package com.wonit.travel.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** 가게 (가게명 / 위치 / 면세여부). 같은 가게명·주소는 한 행으로 모읍니다. */
@Entity
@Table(name = "stores",
        uniqueConstraints = @UniqueConstraint(name = "uq_store", columnNames = {"name", "address"}),
        indexes = @Index(name = "idx_store_geo", columnList = "latitude, longitude"))
public class StoreEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false, length = 120) private String name;
    @Column(nullable = false, length = 250) private String address;
    private Double latitude;
    private Double longitude;
    @Column(name = "is_tax_free", nullable = false) private boolean taxFree;

    protected StoreEntity() {}
    StoreEntity(String name, String address) { this.name = name; this.address = address; }

    void locate(Double latitude, Double longitude) { this.latitude = latitude; this.longitude = longitude; }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getAddress() { return address; }
    public Double getLatitude() { return latitude; }
    public Double getLongitude() { return longitude; }
    public boolean isTaxFree() { return taxFree; }
}
