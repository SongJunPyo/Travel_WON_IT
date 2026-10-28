package com.wonit.travel.api;

import com.wonit.travel.insight.Insight;
import com.wonit.travel.insight.InsightRequest;
import com.wonit.travel.insight.InsightService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

// PAGE 1 '나의 소비 인사이트': 앱이 보낸 가계부 요약(여행 설정 + 카테고리별 원화 지출)을 분석합니다.
// 기기 토큰(Authorization)은 선택이며, 있으면 비교 기준에서 이 기기를 뺍니다.
@RestController
public class InsightController {
    private final InsightService insights;
    public InsightController(InsightService insights) { this.insights = insights; }
    @PostMapping(path = "/insight", consumes = "application/json")
    public Insight insight(@RequestHeader(value = "Authorization", required = false) String token,
            @RequestBody InsightRequest request) {
        return insights.analyze(token, request);
    }
}
