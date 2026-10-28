package com.wonit.travel.ai;

import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** 서버 메모리에 두는 작은 캐시입니다. 항목마다 만료 시간이 있고, 꽉 차면 가장 오래 안 쓴 것부터 버립니다. */
public final class TtlCache<V> {
    private record Entry<V>(V value, Instant expires) {}
    private final Map<String, Entry<V>> entries;

    public TtlCache(int maxSize) {
        entries = Collections.synchronizedMap(new LinkedHashMap<>(16, 0.75f, true) {
            @Override protected boolean removeEldestEntry(Map.Entry<String, Entry<V>> eldest) { return size() > maxSize; }
        });
    }

    /** 없거나 만료됐으면 null입니다. */
    public V get(String key) {
        Entry<V> entry = entries.get(key);
        return entry != null && entry.expires().isAfter(Instant.now()) ? entry.value() : null;
    }

    public void put(String key, V value, Duration ttl) { entries.put(key, new Entry<>(value, Instant.now().plus(ttl))); }
}
