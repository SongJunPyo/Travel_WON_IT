package com.wonit.travel.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

@Entity
@Table(name = "trips")
public class Trip {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @OneToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "device_id", nullable = false, unique = true)
    @OnDelete(action = OnDeleteAction.CASCADE) private Device device;
    @Column(nullable = false, length = 50) private String city;
    @Column(nullable = false, length = 50) private String country;
    @Column(name = "start_date", nullable = false) private LocalDate startDate;
    @Column(name = "end_date", nullable = false) private LocalDate endDate;
    @Column(name = "budget_krw", nullable = false) private long budgetKrw;
    @Column(nullable = false, length = 3) private String currency;
    @Column(nullable = false, precision = 12, scale = 4) private BigDecimal rate;
    protected Trip() {}
    Trip(Device device) { this.device = device; }
    void update(TripData t) {
        city = t.city(); country = t.country(); startDate = LocalDate.parse(t.start()); endDate = LocalDate.parse(t.end());
        budgetKrw = t.budget(); currency = t.currency(); rate = t.rate();
    }
    TripData data() {
        return new TripData(city, country, startDate.toString(), endDate.toString(), budgetKrw, currency, rate);
    }
}
