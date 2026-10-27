package com.wonit.travel.price;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PriceRepository extends JpaRepository<PriceEntity, String> {
    void deleteByOwnerHash(String ownerHash);
}
