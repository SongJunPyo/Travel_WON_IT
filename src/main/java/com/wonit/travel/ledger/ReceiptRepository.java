package com.wonit.travel.ledger;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReceiptRepository extends JpaRepository<ReceiptEntity, Long> {
    List<ReceiptEntity> findByDeviceOrderByIdAsc(DeviceEntity device);
}
