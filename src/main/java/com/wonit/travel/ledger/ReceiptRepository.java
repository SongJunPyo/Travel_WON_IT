package com.wonit.travel.ledger;

import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReceiptRepository extends JpaRepository<Receipt, Long> {
    @EntityGraph(attributePaths = "items")
    List<Receipt> findByDeviceOrderByIdAsc(Device device);
}
