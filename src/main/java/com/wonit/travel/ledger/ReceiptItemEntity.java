package com.wonit.travel.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/** 영수증 품목. raw_name은 영수증 원어 그대로, name_ko는 한국어 번역, product는 정규화로 연결한 상품입니다. */
@Entity
@Table(name = "receipt_items", indexes = @Index(name = "idx_item_product", columnList = "product_id"))
public class ReceiptItemEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "receipt_id", nullable = false)
    private ReceiptEntity receipt;
    @ManyToOne(fetch = FetchType.LAZY) @JoinColumn(name = "product_id")
    private ProductEntity product;
    @Column(name = "line_no", nullable = false) private int position;
    @Column(name = "raw_name", nullable = false, length = 160) private String rawName;
    @Column(name = "name_ko", length = 160) private String nameKo;
    @Column(nullable = false) private int quantity;
    @Column(name = "unit_minor", nullable = false) private long unitMinor;
    @Column(name = "line_minor", nullable = false) private long lineMinor;

    protected ReceiptItemEntity() {}
    ReceiptItemEntity(ReceiptEntity receipt, ProductEntity product, int position, LedgerDtos.Item item) {
        this.receipt = receipt; this.product = product; this.position = position;
        this.rawName = item.name(); this.nameKo = blankToNull(item.nameKo()); this.quantity = item.quantity(); this.unitMinor = item.unitMinor();
        this.lineMinor = Math.multiplyExact(item.unitMinor(), (long) item.quantity());
    }

    LedgerDtos.Item toDto() { return new LedgerDtos.Item(rawName, nameKo, quantity, unitMinor); }

    private static String blankToNull(String value) { return value == null || value.isBlank() ? null : value.strip(); }

    public ReceiptEntity getReceipt() { return receipt; }
    public ProductEntity getProduct() { return product; }
    public int getPosition() { return position; }
    public String getRawName() { return rawName; }
    public String getNameKo() { return nameKo; }
    /** 가격 비교에 보여 줄 이름: 한국어 번역이 있으면 번역, 없으면 원어. */
    public String getDisplayName() { return nameKo != null ? nameKo : rawName; }
    public long getUnitMinor() { return unitMinor; }
}
