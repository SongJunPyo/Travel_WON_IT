package com.wonit.travel.api;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Map<String, String>> domain(ApiException e) {
        return ResponseEntity.status(e.status()).body(Map.of("error", e.getMessage()));
    }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Map<String, String>> invalidJson() {
        return ResponseEntity.badRequest().body(Map.of("error", "요청 데이터를 읽지 못했어요."));
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<Map<String, String>> unexpected(Exception e) {
        // 없는 주소(404)·허용되지 않은 방식(405)처럼 Spring이 상태를 정한 요청 오류는 그 상태를 유지합니다.
        if (e instanceof ErrorResponse error)
            return ResponseEntity.status(error.getStatusCode()).body(Map.of("error", "요청한 주소나 방식을 확인해 주세요."));
        return ResponseEntity.internalServerError().body(Map.of("error", "서버에서 처리하지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
}
