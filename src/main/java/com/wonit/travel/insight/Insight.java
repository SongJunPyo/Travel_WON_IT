package com.wonit.travel.insight;

import java.util.List;

// '나의 소비 인사이트' 카드에 보여 줄 내용입니다.
// facts는 문장의 근거가 된 숫자(서버 계산), basis는 비교 기준 설명(비교 대상이 5명 미만이면 null),
// sampleData는 비교 기준에 시연 가데이터가 섞였는지, ai는 문장을 AI가 썼는지입니다.
// peerCumulative는 가계부 '다른 여행자와 비교'용 일차별 평균 누적 지출(원)입니다. 인덱스가 일차(0 = 출발 전)이고,
// 그 일차까지 여행한 비교 여행자가 5명 미만이 되는 일차부터는 넣지 않습니다(비교 여행자 5명 미만이면 null).
public record Insight(String headline, String body, String tip, List<String> facts, String basis, boolean sampleData, boolean ai,
        List<Long> peerCumulative) {}
