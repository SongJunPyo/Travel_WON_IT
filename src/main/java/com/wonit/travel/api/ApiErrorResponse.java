package com.wonit.travel.api;

import java.util.List;

/** 사진 인식 오류 응답 형식. */
public record ApiErrorResponse(List<ApiError> errors) {
    public record ApiError(String field, String code, String message) {}
}
