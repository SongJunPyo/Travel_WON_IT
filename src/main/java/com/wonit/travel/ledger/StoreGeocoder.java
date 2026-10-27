package com.wonit.travel.ledger;

import java.util.Optional;

/** 매장 주소 → 지도 좌표. 테스트에서는 가짜 구현을 씁니다. */
public interface StoreGeocoder {
    Optional<LedgerDtos.Coordinate> locate(String address);
}
