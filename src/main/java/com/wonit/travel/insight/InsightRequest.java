package com.wonit.travel.insight;

import com.wonit.travel.ledger.TripData;
import java.util.Map;

// 앱이 보내는 가계부 요약입니다. categories는 가계부 카테고리별 원화 지출 합계(앱의 summarize 결과)입니다.
// 영수증 원문·매장·상품은 보내지 않습니다.
public record InsightRequest(TripData trip, Map<String, Long> categories) {}
