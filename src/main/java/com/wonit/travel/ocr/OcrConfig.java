package com.wonit.travel.ocr;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OcrConfig {
    /** 키가 없어도 앱은 뜨고, 인식 요청만 OCR_UNAVAILABLE로 거절됩니다. */
    @Bean
    ReceiptReader receiptReader(ChatClient.Builder builder, @Value("${ANTHROPIC_API_KEY:}") String apiKey) {
        return new ClaudeReceiptReader(builder, apiKey);
    }
}
