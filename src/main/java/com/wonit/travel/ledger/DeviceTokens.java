package com.wonit.travel.ledger;

import com.wonit.travel.api.ApiException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;

/** Authorization: Bearer {기기 토큰} → SHA-256 해시. 토큰 원문은 저장하지 않습니다. */
public final class DeviceTokens {
    private DeviceTokens() {}
    public static String hash(String authorization) {
        if (authorization == null || !authorization.matches("Bearer [\\w-]{40,160}"))
            throw new ApiException(401, "기기 식별 토큰이 필요해요.");
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(authorization.substring(7).getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
