package com.wonit.travel.ledger;

import com.wonit.travel.Money;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;

/** 여행 (예산 관리 · 평균 비교 기준: 국가/도시/기간). 앱은 기기마다 여행 1개를 씁니다. */
@Entity
@Table(name = "trips")
public class TripEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "device_id", nullable = false, unique = true)
    private DeviceEntity device;
    @Column(nullable = false, length = 50) private String country;
    @Column(nullable = false, length = 50) private String city;
    @Column(name = "start_date", nullable = false) private LocalDate startDate;
    @Column(name = "end_date", nullable = false) private LocalDate endDate;
    @Column(name = "budget_krw", nullable = false) private long budgetKrw;
    @Column(nullable = false, length = 3) private String currency;
    @Column(nullable = false, precision = 14, scale = 4) private BigDecimal rate;

    protected TripEntity() {}
    TripEntity(DeviceEntity device, LedgerDtos.Trip trip) {
        this.device = device; this.country = trip.country().strip(); this.city = trip.city().strip();
        this.startDate = LocalDate.parse(trip.start()); this.endDate = LocalDate.parse(trip.end());
        this.budgetKrw = trip.budget(); this.currency = trip.currency(); this.rate = trip.rate();
    }

    LedgerDtos.Trip toDto() {
        return new LedgerDtos.Trip(city, country, startDate.toString(), endDate.toString(), budgetKrw, currency, Money.compactRate(rate));
    }
}
