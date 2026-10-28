package com.wonit.travel.ledger;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ReceiptRepository extends JpaRepository<Receipt, Long> {
    @EntityGraph(attributePaths = "items")
    List<Receipt> findByDeviceOrderByIdAsc(Device device);
    // 소비 인사이트 비교 기준: 최근에 끝난(since <= end_date < today) 같은 나라·통화 여행의 기기·카테고리·통화별 지출 합계입니다.
    // 행: [기기 id, 여행 시작일, 종료일, 예산(원), 가데이터 여부, 카테고리, 통화, sum(최소 단위 금액 × 환율), 구매일]
    // 구매일은 '일차별 누적 지출' 비교에 씁니다.
    @Query("""
            select d.id, t.startDate, t.endDate, t.budgetKrw, d.sample, r.ledgerCategory, r.currency, sum(r.totalMinor * r.rate),
                   r.purchasedDate
            from Receipt r join r.trip t join t.device d
            where t.country = :country and t.currency = :currency and t.endDate >= :since and t.endDate < :today
            group by d.id, t.startDate, t.endDate, t.budgetKrw, d.sample, r.ledgerCategory, r.currency, r.purchasedDate""")
    List<Object[]> spendingOfRecentTrips(String country, String currency, LocalDate since, LocalDate today);
    // 가장 최근에 저장된 영수증 번호. 집계 캐시가 새 영수증 저장 뒤에도 남지 않게 키에 씁니다(없으면 null).
    @Query("select max(r.id) from Receipt r")
    Long lastId();
}
