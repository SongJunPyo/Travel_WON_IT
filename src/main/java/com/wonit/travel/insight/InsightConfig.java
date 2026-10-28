package com.wonit.travel.insight;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class InsightConfig {
    /** 영수증 인식·추천순과 같은 ANTHROPIC_API_KEY를 씁니다. 키가 없으면 규칙 기반 문장만 씁니다. */
    @Bean
    SpendingAdvisor spendingAdvisor(ChatClient.Builder builder, @Value("${ANTHROPIC_API_KEY:}") String apiKey) {
        return new ClaudeSpendingAdvisor(builder, apiKey);
    }
}
