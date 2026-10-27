package com.wonit.travel.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

/** 사용자. 로그인이 없으므로 기기 토큰의 SHA-256 해시로만 구분합니다 (토큰 원문은 저장하지 않음). */
@Entity
@Table(name = "devices")
public class DeviceEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "token_hash", nullable = false, unique = true, length = 64) private String tokenHash;
    @Column(name = "created_at", nullable = false) private Instant createdAt;

    protected DeviceEntity() {}
    DeviceEntity(String tokenHash) { this.tokenHash = tokenHash; this.createdAt = Instant.now(); }

    public Long getId() { return id; }
    public String getTokenHash() { return tokenHash; }
}
