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
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

@Entity
@Table(name = "receipt_items", indexes = {
        @Index(name = "idx_items_receipt", columnList = "receipt_id"),
        @Index(name = "idx_items_normalized", columnList = "normalized_name")})
public class ReceiptItem {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "receipt_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE) private Receipt receipt;
    @Column(name = "raw_name", nullable = false, length = 160) private String rawName;
    @Column(name = "name_ko", length = 160) private String nameKo;
    @Column(name = "normalized_name", nullable = false, length = 200) private String normalizedName;
    @Column(nullable = false) private int quantity;
    @Column(name = "unit_minor", nullable = false) private long unitMinor;
    protected ReceiptItem() {}
    ReceiptItem(Receipt receipt, ReceiptData.Item i) {
        this.receipt = receipt; rawName = i.name(); nameKo = i.nameKo(); normalizedName = LedgerService.normalize(i.name());
        quantity = i.quantity(); unitMinor = i.unitMinor();
    }
    ReceiptData.Item data() { return new ReceiptData.Item(rawName, nameKo, quantity, unitMinor); }
    public Long id() { return id; }
    public Receipt receipt() { return receipt; }
    public String rawName() { return rawName; }
    public String nameKo() { return nameKo; }
    public String normalizedName() { return normalizedName; }
    public long unitMinor() { return unitMinor; }
}
