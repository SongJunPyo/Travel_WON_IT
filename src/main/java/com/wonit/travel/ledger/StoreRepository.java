package com.wonit.travel.ledger;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StoreRepository extends JpaRepository<StoreEntity, Long> {
    Optional<StoreEntity> findByNameAndAddress(String name, String address);
}
