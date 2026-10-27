package com.wonit.travel.ledger;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ReceiptItemRepository extends JpaRepository<ReceiptItemEntity, Long> {
    /** 시연 기록이 아니고 매장 위치·주소가 있는 품목을 가격 비교에 씁니다 (share_consent는 항상 !demo). */
    @Query("""
            select i from ReceiptItemEntity i
              join fetch i.receipt r
              join fetch r.store s
              join fetch i.product p
            where r.shareConsent = true and r.demo = false
              and r.latitude is not null and r.longitude is not null
              and s.address <> ''
            order by r.id, i.position""")
    List<ReceiptItemEntity> findShared();
}
