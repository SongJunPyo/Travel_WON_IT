package com.wonit.travel.api;

/** 사진 인식·환율 오류 코드. 응답은 {errors:[{field, code, message}]} 형식입니다 (98_HACKATHON과 동일). */
public enum ErrorCode {
    INVALID_FILE,
    OCR_UNAVAILABLE,
    OCR_FAILED,
    RATE_UNAVAILABLE
}
