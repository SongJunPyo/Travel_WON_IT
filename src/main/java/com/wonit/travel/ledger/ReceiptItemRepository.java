package com.wonit.travel.ledger;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ReceiptItemRepository extends JpaRepository<ReceiptItem, Long> {
    // 공유에 동의한 영수증 품목 중 위치 사각형 안의 것만 가져옵니다. 정확한 반경은 서비스에서 거릅니다.
    @Query("""
            select i from ReceiptItem i join fetch i.receipt r
            where r.shareConsent = true and r.currency = :currency
              and r.latitude between :minLat and :maxLat and r.longitude between :minLng and :maxLng""")
    List<ReceiptItem> findShared(String currency, double minLat, double maxLat, double minLng, double maxLng);
}
