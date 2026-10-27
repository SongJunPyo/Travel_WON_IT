package com.wonit.travel.ledger;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeviceRepository extends JpaRepository<DeviceEntity, Long> {
    Optional<DeviceEntity> findByTokenHash(String tokenHash);
}
