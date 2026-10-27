package com.wonit.travel.ledger;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReceiptRepository extends JpaRepository<Receipt, Long> {
    @EntityGraph(attributePaths = "items")
    List<Receipt> findByDeviceOrderByPurchasedDateDescCreatedAtDesc(Device device);
    Optional<Receipt> findByIdAndDevice(Long id, Device device);
    long countByDevice(Device device);
}
