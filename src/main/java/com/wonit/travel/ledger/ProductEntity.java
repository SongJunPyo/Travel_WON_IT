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

/** 상품 (정규화된 품목명 / 카테고리). 'COKE 0.5L'과 '코카콜라 500ml'은 같은 상품입니다. */
@Entity
@Table(name = "products")
public class ProductEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "normalized_name", nullable = false, unique = true, length = 200) private String normalizedName;
    @Column(nullable = false, length = 160) private String name;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "category_id", nullable = false)
    private CategoryEntity category;

    protected ProductEntity() {}
    ProductEntity(String normalizedName, String name, CategoryEntity category) {
        this.normalizedName = normalizedName; this.name = name; this.category = category;
    }

    public Long getId() { return id; }
    public String getNormalizedName() { return normalizedName; }
    public String getName() { return name; }
}
