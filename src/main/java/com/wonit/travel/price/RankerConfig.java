package com.wonit.travel.price;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RankerConfig {
    /** 영수증 인식과 같은 ANTHROPIC_API_KEY를 씁니다. 키가 없으면 추천순은 점수 순서만 씁니다. */
    @Bean
    PriceRanker priceRanker(ChatClient.Builder builder, @Value("${ANTHROPIC_API_KEY:}") String apiKey) {
        return new ClaudePriceRanker(builder, apiKey);
    }
}
