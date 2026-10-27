package com.wonit.travel.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

// 로그인 없이 앱이 만든 기기 토큰으로 사용자를 구분합니다. 토큰 원문은 저장하지 않습니다.
@Entity
@Table(name = "devices")
public class Device {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name = "token_hash", nullable = false, unique = true, length = 64) private String tokenHash;
    @Column(name = "is_sample", nullable = false) private boolean sample;
    @Column(name = "created_at", nullable = false) private LocalDateTime createdAt;
    protected Device() {}
    Device(String tokenHash) { this.tokenHash = tokenHash; this.createdAt = LocalDateTime.now(); }
    public Long id() { return id; }
}
