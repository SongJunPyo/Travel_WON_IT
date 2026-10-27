package com.wonit.travel.ledger;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripRepository extends JpaRepository<TripEntity, Long> {
    Optional<TripEntity> findByDevice(DeviceEntity device);
}
