package com.wonit.travel.insight;

import java.util.List;
import java.util.Map;

// '나의 소비 인사이트' 카드에 보여 줄 내용입니다.
// facts는 문장의 근거가 된 숫자(서버 계산), basis는 비교 기준 설명(비교 대상이 5명 미만이면 null),
// sampleData는 비교 기준에 시연 가데이터가 섞였는지, ai는 문장을 AI가 썼는지입니다.
// peerShares는 비교 기준 여행자들의 카테고리별 평균 비중(%)으로, 가계부의 평균 비교 표에 씁니다(5명 미만이면 null).
public record Insight(String headline, String body, String tip, List<String> facts, String basis, boolean sampleData, boolean ai,
        Map<String, Long> peerShares) {}
