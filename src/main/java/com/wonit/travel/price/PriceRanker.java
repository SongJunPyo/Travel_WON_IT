package com.wonit.travel.price;

import java.util.List;

/** 추천순 2단계: 점수 상위 후보를 다시 고르고 추천 이유를 쓰는 외부 AI. 테스트에서는 가짜 구현을 씁니다. */
public interface PriceRanker {
    /** 추천 순서대로의 후보 id와 한 줄 이유. 이유가 없을 수 있습니다. */
    record Pick(String id, String reason) {}
    /** 실패하면 예외를 던지고, 호출한 쪽이 점수 순서를 그대로 씁니다. */
    List<Pick> rank(List<PriceRecommender.Scored> candidates, PriceRecommender.Profile profile);
    default boolean configured() { return true; }
}
