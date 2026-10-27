package com.wonit.travel.api;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);
    private static final Map<ErrorCode, HttpStatus> STATUS = Map.of(
            ErrorCode.INVALID_FILE, HttpStatus.BAD_REQUEST,
            ErrorCode.OCR_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE,
            ErrorCode.OCR_FAILED, HttpStatus.BAD_GATEWAY,
            ErrorCode.RATE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    private static final Map<ErrorCode, String> MESSAGE = Map.of(
            ErrorCode.INVALID_FILE, "JPG · PNG · WebP 사진(10MB 이하)만 인식할 수 있어요.",
            ErrorCode.OCR_UNAVAILABLE, "지금은 사진 인식을 쓸 수 없어요. 영수증 정보를 직접 입력해 주세요.",
            ErrorCode.OCR_FAILED, "영수증의 상품이나 금액을 읽지 못했어요. 선명한 사진을 고르거나 직접 입력해 주세요.",
            ErrorCode.RATE_UNAVAILABLE, "지금은 환율을 불러올 수 없어요. 적용 환율을 직접 입력해 주세요.");

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, String>> api(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.getMessage()));
    }
    @ExceptionHandler(DomainException.class)
    ResponseEntity<ApiErrorResponse> domain(DomainException e) { return error(e.errorCode()); }
    /** 업로드 한도 초과·파일 누락도 INVALID_FILE로 돌려줍니다. */
    @ExceptionHandler({MaxUploadSizeExceededException.class, MissingServletRequestPartException.class, MultipartException.class})
    ResponseEntity<ApiErrorResponse> invalidFile() { return error(ErrorCode.INVALID_FILE); }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> invalidJson() {
        return ResponseEntity.badRequest().body(Map.of("error", "요청 데이터를 읽지 못했어요."));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unexpected(Exception e) {
        // 404 · 405 · 415 같은 Spring 표준 오류는 원래 상태 코드를 유지합니다.
        if (e instanceof ErrorResponse standard)
            return ResponseEntity.status(standard.getStatusCode()).body(Map.of("error", "요청 경로나 형식을 확인해 주세요."));
        log.error("처리하지 못한 오류", e);
        return ResponseEntity.internalServerError().body(Map.of("error", "서버에서 처리하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    private static ResponseEntity<ApiErrorResponse> error(ErrorCode code) {
        String field = code == ErrorCode.INVALID_FILE ? "file" : null;
        return ResponseEntity.status(STATUS.get(code))
                .body(new ApiErrorResponse(List.of(new ApiErrorResponse.ApiError(field, code.name(), MESSAGE.get(code)))));
    }
}
