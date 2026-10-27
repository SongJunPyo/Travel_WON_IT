package com.wonit.travel.ledger;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ReceiptItemRepository extends JpaRepository<ReceiptItem, Long> {
    // 공유한 영수증 품목 중 위치 사각형 안의 것만 가져옵니다. category(가계부 카테고리 6개)가 null이면 모든 카테고리입니다.
    // 정확한 반경과 상품명 검색은 서비스에서 거릅니다.
    @Query("""
            select i from ReceiptItem i join fetch i.receipt r
            where r.shareConsent = true and r.currency = :currency
              and (:category is null or r.ledgerCategory = :category)
              and r.latitude between :minLat and :maxLat and r.longitude between :minLng and :maxLng""")
    List<ReceiptItem> findShared(String currency, String category, double minLat, double maxLat, double minLng, double maxLng);
}
