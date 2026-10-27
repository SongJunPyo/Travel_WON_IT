package com.wonit.travel.ocr;

import com.wonit.travel.api.ErrorCode;
import java.time.LocalDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 인식 요청마다 이력 1행을 남깁니다. DB가 끊겨도 인식 응답은 막지 않고 WARN 로그만 남깁니다. */
@Component
public class OcrHistoryRecorder {
    private static final Logger log = LoggerFactory.getLogger(OcrHistoryRecorder.class);
    private final OcrHistoryRepository repository;
    private final String model;

    public OcrHistoryRecorder(OcrHistoryRepository repository,
            @Value("${spring.ai.anthropic.chat.model:unknown}") String model) {
        this.repository = repository;
        this.model = model;
    }

    public void recordSuccess(String fileType, long fileSize, ReceiptDraft draft) {
        save(new OcrHistory(LocalDateTime.now(), model, fileType, fileSize, "OK",
                draft.store(), draft.address(), draft.date(), draft.currency(), draft.totalMinor(), draft.items().size()));
    }

    public void recordFailure(String fileType, long fileSize, ErrorCode errorCode) {
        save(new OcrHistory(LocalDateTime.now(), model, fileType, fileSize, errorCode.name(),
                null, null, null, null, null, null));
    }

    private void save(OcrHistory history) {
        try {
            repository.save(history);
        } catch (RuntimeException e) {
            log.warn("OCR 이력 저장 실패: {}", e.toString());
        }
    }
}
