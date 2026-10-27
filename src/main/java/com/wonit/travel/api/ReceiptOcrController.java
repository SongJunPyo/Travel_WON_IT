package com.wonit.travel.api;

import com.wonit.travel.ocr.OcrHistoryRecorder;
import com.wonit.travel.ocr.ReceiptDraft;
import com.wonit.travel.ocr.ReceiptDraftMapper;
import com.wonit.travel.ocr.ReceiptReader;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** 영수증 사진(multipart file)을 읽어 상품별 초안을 돌려줍니다. 성공이든 실패든 이력에 남깁니다. */
@RestController
public class ReceiptOcrController {
    private record Limit(int count, long expires) {}
    private final ConcurrentHashMap<String, Limit> limits = new ConcurrentHashMap<>();
    private final ReceiptReader receiptReader;
    private final OcrHistoryRecorder historyRecorder;
    private final ReceiptDraftMapper draftMapper = new ReceiptDraftMapper();

    public ReceiptOcrController(ReceiptReader receiptReader, OcrHistoryRecorder historyRecorder) {
        this.receiptReader = receiptReader;
        this.historyRecorder = historyRecorder;
    }

    @PostMapping(path = "/api/receipts/ocr", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, ReceiptDraft> recognize(@RequestParam("file") MultipartFile file, HttpServletRequest servlet)
            throws IOException {
        long now = System.currentTimeMillis();
        if (limits.size() > 10000) limits.entrySet().removeIf(e -> e.getValue().expires() < now);
        Limit limit = limits.compute(servlet.getRemoteAddr(), (key, old) -> old == null || old.expires() < now
                ? new Limit(1, now + 3600000) : new Limit(old.count() + 1, old.expires()));
        if (limit.count() > 20) throw new ApiException(429, "시간당 분석 한도에 도달했어요. 직접 입력을 이용해 주세요.");
        ReceiptDraft draft;
        try {
            draft = draftMapper.recognize(receiptReader, file.getBytes(), file.getContentType());
        } catch (DomainException e) {
            historyRecorder.recordFailure(file.getContentType(), file.getSize(), e.errorCode());
            throw e;
        }
        historyRecorder.recordSuccess(file.getContentType(), file.getSize(), draft);
        return Map.of("receipt", draft);
    }
}
