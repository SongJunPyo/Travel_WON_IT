package com.wonit.travel.insight;

import java.util.Map;

/** 서버가 계산한 숫자(facts)로 소비 인사이트 문장을 쓰는 외부 AI. 테스트에서는 가짜 구현을 씁니다. */
public interface SpendingAdvisor {
    /** headline·body는 꼭 있어야 하고, tip은 없을 수 있습니다. */
    record Advice(String headline, String body, String tip) {}
    /** 실패하면 예외를 던지고, 호출한 쪽이 규칙 기반 문장을 그대로 씁니다. */
    Advice advise(Map<String, Object> facts);
    default boolean configured() { return true; }
}
