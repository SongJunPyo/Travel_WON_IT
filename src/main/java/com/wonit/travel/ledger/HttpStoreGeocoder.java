package com.wonit.travel.ledger;

import java.net.URI;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 영수증 매장 주소를 좌표로 바꿉니다. Mapbox 토큰(MAPBOX_TOKEN, 없으면 EXPO_PUBLIC_MAPBOX_TOKEN)이 있으면 Mapbox,
 * 없으면 키가 필요 없는 OpenStreetMap Nominatim을 씁니다. 결과(실패 포함)는 주소별로 메모리에 캐시합니다.
 */
@Component
public class HttpStoreGeocoder implements StoreGeocoder {
    private static final Logger log = LoggerFactory.getLogger(HttpStoreGeocoder.class);
    private final RestClient http;
    private final JsonMapper mapper;
    private final String mapboxToken;
    private final String mapboxUrl;
    private final String nominatimUrl;
    private final Map<String, Optional<LedgerDtos.Coordinate>> cache = new ConcurrentHashMap<>();

    public HttpStoreGeocoder(JsonMapper mapper,
            @Value("${MAPBOX_TOKEN:${EXPO_PUBLIC_MAPBOX_TOKEN:}}") String mapboxToken,
            @Value("${app.geocoding.mapbox-url:https://api.mapbox.com/search/geocode/v6/forward}") String mapboxUrl,
            @Value("${app.geocoding.nominatim-url:https://nominatim.openstreetmap.org/search}") String nominatimUrl) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(4));
        factory.setReadTimeout(Duration.ofSeconds(6));
        this.http = RestClient.builder().requestFactory(factory).build();
        this.mapper = mapper;
        this.mapboxToken = mapboxToken == null ? "" : mapboxToken.strip();
        this.mapboxUrl = mapboxUrl;
        this.nominatimUrl = nominatimUrl;
    }

    @Override
    public Optional<LedgerDtos.Coordinate> locate(String address) {
        if (address == null || address.isBlank()) return Optional.empty();
        return cache.computeIfAbsent(address.strip(), this::lookup);
    }

    private Optional<LedgerDtos.Coordinate> lookup(String address) {
        try {
            String body;
            if (!mapboxToken.isEmpty()) {
                URI uri = UriComponentsBuilder.fromUriString(mapboxUrl).queryParam("q", address)
                        .queryParam("limit", 1).queryParam("access_token", mapboxToken).encode().build().toUri();
                body = http.get().uri(uri).retrieve().body(String.class);
                return parseMapbox(mapper.readTree(body));
            }
            URI uri = UriComponentsBuilder.fromUriString(nominatimUrl).queryParam("q", address)
                    .queryParam("format", "jsonv2").queryParam("limit", 1).encode().build().toUri();
            // Nominatim 이용 정책: 앱을 알 수 있는 User-Agent가 필요합니다.
            body = http.get().uri(uri).header("User-Agent", "travel-wonhae/1.0 (hackathon demo)")
                    .retrieve().body(String.class);
            return parseNominatim(mapper.readTree(body));
        } catch (RuntimeException e) {
            log.warn("매장 주소 좌표 변환 실패: {}", e.toString());
            return Optional.empty();
        }
    }

    /** Mapbox v6: features[0].geometry.coordinates = [경도, 위도] */
    static Optional<LedgerDtos.Coordinate> parseMapbox(JsonNode root) {
        JsonNode c = root.path("features").path(0).path("geometry").path("coordinates");
        if (!c.isArray() || c.size() < 2) return Optional.empty();
        return valid(c.get(1).asDouble(), c.get(0).asDouble());
    }

    /** Nominatim: [{ "lat": "48.86", "lon": "2.34" }] */
    static Optional<LedgerDtos.Coordinate> parseNominatim(JsonNode root) {
        JsonNode first = root.path(0);
        if (first.isMissingNode() || first.path("lat").isMissingNode()) return Optional.empty();
        try {
            return valid(Double.parseDouble(first.path("lat").asString()), Double.parseDouble(first.path("lon").asString()));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    private static Optional<LedgerDtos.Coordinate> valid(double lat, double lng) {
        if (!Double.isFinite(lat) || !Double.isFinite(lng) || Math.abs(lat) > 85.0511 || Math.abs(lng) > 180)
            return Optional.empty();
        return Optional.of(new LedgerDtos.Coordinate(lat, lng));
    }
}
