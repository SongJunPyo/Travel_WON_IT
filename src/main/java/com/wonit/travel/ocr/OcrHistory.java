package com.wonit.travel.ocr;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/** 영수증 사진 인식 요청 1건의 기록. 사진과 카드번호는 저장하지 않습니다. */
@Entity
@Table(name = "ocr_history")
public class OcrHistory {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "requested_at", nullable = false) private LocalDateTime requestedAt;
    @Column(nullable = false, length = 50) private String model;
    @Column(name = "file_type", length = 50) private String fileType;
    @Column(name = "file_size") private long fileSize;
    /** OK 또는 오류 코드(INVALID_FILE · OCR_FAILED · OCR_UNAVAILABLE) */
    @Column(nullable = false, length = 30) private String result;
    @Column(length = 120) private String store;
    @Column(name = "store_address", length = 250) private String storeAddress;
    @Column(name = "purchase_date", length = 10) private String purchaseDate;
    @Column(length = 3) private String currency;
    @Column(name = "total_minor") private Long totalMinor;
    @Column(name = "item_count") private Integer itemCount;

    protected OcrHistory() {}

    OcrHistory(LocalDateTime requestedAt, String model, String fileType, long fileSize, String result,
            String store, String storeAddress, String purchaseDate, String currency, Long totalMinor, Integer itemCount) {
        this.requestedAt = requestedAt; this.model = model; this.fileType = fileType; this.fileSize = fileSize;
        this.result = result; this.store = store; this.storeAddress = storeAddress; this.purchaseDate = purchaseDate; this.currency = currency;
        this.totalMinor = totalMinor; this.itemCount = itemCount;
    }

    public Long getId() { return id; }
    public LocalDateTime getRequestedAt() { return requestedAt; }
    public String getModel() { return model; }
    public String getFileType() { return fileType; }
    public long getFileSize() { return fileSize; }
    public String getResult() { return result; }
    public String getStore() { return store; }
    public String getStoreAddress() { return storeAddress; }
    public String getPurchaseDate() { return purchaseDate; }
    public String getCurrency() { return currency; }
    public Long getTotalMinor() { return totalMinor; }
    public Integer getItemCount() { return itemCount; }
}
