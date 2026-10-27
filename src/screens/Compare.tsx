import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  Modal,
  TextInput,
  Pressable,
  StyleSheet,
  Linking,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
import {
  CATEGORIES,
  BROWSE_SORTS,
  DEMO_LOCATION,
  money,
  CURRENCIES,
  normalizeProduct,
  storeLabel,
  storeOriginal,
} from "../domain.mjs";
import { fetchPrices } from "../api";
import { colors, Icon, Chip, Empty, Button, Sheet } from "../components/ui";
import { PriceMap } from "../components/PriceMap";
import type { Coordinate, Price } from "../types";

const PAGE_SIZE = 5;
// 흰 글자가 잘 보이도록 가계부 차트 색보다 진한 타일 색을 씁니다.
const TILE_COLORS: Record<string, string> = {
  음식: "#D9653B",
  쇼핑: "#C8508A",
  숙박: "#0067AC",
  교통: "#47617A",
  관광: "#2F6FB5",
  기타: "#6B5BC4",
};
export function Compare({
  active,
  version,
  onRefresh,
  syncMessage,
  mapOpen,
  onCloseMap,
}: {
  active: boolean;
  // 가계부를 서버에 저장할 때마다 바뀌어, 방금 저장한 영수증도 다시 조회합니다.
  version: number;
  onRefresh: () => Promise<void>;
  syncMessage: string;
  mapOpen: boolean;
  onCloseMap: () => void;
}) {
  const [query, setQuery] = useState(""),
    [searched, setSearched] = useState<string | null>(null),
    [searchVersion, setSearchVersion] = useState(0);
  const [location, setLocation] = useState<Coordinate>(DEMO_LOCATION),
    [demo, setDemo] = useState(true),
    [locating, setLocating] = useState(false),
    [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [sort, setSort] = useState("가격순");
  const [currency, setCurrency] = useState("JPY");
  const [category, setCategory] = useState<string | null>(null),
    [categorySort, setCategorySort] = useState("가격순");
  const [rows, setRows] = useState<Price[]>([]),
    [loading, setLoading] = useState(false),
    [loadError, setLoadError] = useState("");
  // 결과는 5개씩 보여 주고, '더 보기'를 누를 때마다 5개씩 늘립니다.
  const [limit, setLimit] = useState(PAGE_SIZE);
  // 신주쿠 시연 가데이터는 엔화(JPY)로 쌓여 있습니다.
  const effectiveCurrency = demo ? "JPY" : currency;
  // 서버가 반경 3km 안의 공유 영수증을 매장·상품별로 묶어 돌려줍니다. 카테고리를 고르면 카테고리, 아니면 검색어로 찾습니다.
  useEffect(() => {
    if (!category && !searched) {
      setRows([]);
      setLoadError("");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setLoadError("");
    fetchPrices({
      currency: effectiveCurrency,
      location,
      ...(category ? { category, sort: categorySort } : { q: searched ?? undefined }),
    })
      .then((result) => {
        if (!active) return;
        setRows(result);
        setLoadError("");
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setLoadError(
          "가격 기록을 불러오지 못했어요. 서버 연결과 검색어를 확인해 주세요.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category, categorySort, searched, searchVersion, location, effectiveCurrency, version]);
  // 조회 조건이나 정렬이 바뀌면 다시 처음 5개부터 보여 줍니다.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [category, categorySort, searched, searchVersion, sort, location, effectiveCurrency]);
  const prices = category ? [] : rows,
    browsed = category ? rows : [];
  const sorted =
    sort === "거리순"
      ? [...prices].sort((a, b) => a.distance - b.distance)
      : prices;
  const shown = rows;
  const selectedPrice = shown.find((p) => p.id === selected);
  const moreButton = (total: number) =>
    total > limit ? (
      <Button
        title={`더 보기 (${total - limit}개 남음)`}
        variant="outline"
        onPress={() => setLimit((n) => n + PAGE_SIZE)}
        testID="show-more"
        style={{ marginBottom: 11 }}
      />
    ) : null;
  const categoryIcon =
    CATEGORIES.find((c) => c.name === category)?.icon || "bag";
  // 고른 카테고리의 결과는 그 타일이 있는 줄 바로 아래에 펼칩니다.
  const categoryIndex = CATEGORIES.findIndex((c) => c.name === category);
  const resultsAfter =
    categoryIndex < 0
      ? -1
      : Math.min(Math.floor(categoryIndex / 2) * 2 + 1, CATEGORIES.length - 1);
  const categoryResults = category && !loading && !loadError ? (
    <View style={s.categoryResults} testID="category-results">
      <View style={[s.resultsHead, { marginTop: 6 }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text style={s.sectionTitle}>{category}</Text>
          <Text style={s.count}>{browsed.length}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="카테고리 선택 해제"
          onPress={() => chooseCategory(category)}
          style={{ padding: 6 }}
        >
          <Icon name="close" size={16} color={colors.muted} />
        </Pressable>
      </View>
      <View style={s.sorts}>
        {BROWSE_SORTS.map((x) => (
          <Chip
            key={x.name}
            title={x.ready ? x.name : `${x.name} · 준비 중`}
            active={categorySort === x.name}
            disabled={!x.ready}
            onPress={() => setCategorySort(x.name)}
            testID={`browse-sort-${x.name}`}
          />
        ))}
      </View>
      <Text style={s.productTitle}>
        다른 여행자의 영수증 기록
        <Text style={s.unitNote}> · 최근 구매가격 · {effectiveCurrency}</Text>
      </Text>
      {browsed.length ? (
        browsed.slice(0, limit).map((p) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${storeLabel(p)} 매장 선택`}
            onPress={() => setSelected(p.id)}
            key={p.id}
            style={[
              s.storeCard,
              selected === p.id && { borderColor: colors.primary },
            ]}
            testID={`browse-${p.id}`}
          >
            <View style={s.storeTop}>
              <View style={s.storeIcon}>
                <Icon name={categoryIcon} color="#819CB2" size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.storeName}>{storeLabel(p)}</Text>
                {storeOriginal(p) ? (
                  <Text style={s.storeOriginal}>{storeOriginal(p)}</Text>
                ) : null}
                <Text style={s.storeDistance}>{p.product}</Text>
              </View>
              <Text style={s.price}>{money(p.unitMinor, p.currency)}</Text>
            </View>
            <View style={s.storeBottom}>
              <Text style={s.purchaseDate}>
                최근 구매일 {p.date.replace(/-/g, ".")}
              </Text>
              <Text style={s.purchaseCount}>구매 {p.count}회</Text>
            </View>
          </Pressable>
        ))
      ) : (
        <View style={s.emptyCard}>
          <Empty
            icon="search"
            title="아직 이 카테고리의 공유 기록이 없어요"
            detail="다른 여행자의 영수증 기록이 쌓이면 여기에 표시돼요."
          />
        </View>
      )}
      {moreButton(browsed.length)}
    </View>
  ) : null;
  async function locate() {
    setLocating(true);
    setMessage("");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted")
        throw new Error(
          "위치 권한이 꺼져 있어요. 기기 설정에서 허용한 뒤 다시 시도해 주세요.",
        );
      const result = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error(
                  "위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.",
                ),
              ),
            15000,
          ),
        ),
      ]);
      setLocation(result.coords);
      setDemo(false);
      setSelected(null);
      await onRefresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "위치를 확인할 수 없어요.",
      );
    } finally {
      setLocating(false);
    }
  }
  function search(value = query) {
    const term = value.trim() || null;
    setQuery(value);
    setSearched(term);
    setSearchVersion((previous) => previous + 1);
    setLoading(!!term);
    setLoadError("");
    setCategory(null);
    setSelected(null);
  }
  function chooseCategory(name: string) {
    setCategory((prev) => (prev === name ? null : name));
    setSelected(null);
  }
  return (
    <View style={s.content}>
      <Text style={s.eyebrow}>SMART FINDS, NEAR YOU</Text>
      <Text style={s.title}>같은 상품을 더 좋은 가격에</Text>
      <Text style={s.subtitle}>여행자들의 영수증으로 찾는 주변 가격</Text>
      <View style={s.search}>
        <Icon name="search" size={21} color={colors.primary} />
        <TextInput
          accessibilityLabel="상품 검색"
          testID="product-search"
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="상품명과 용량을 입력해 주세요"
          placeholderTextColor="#9AAEBE"
          returnKeyType="search"
          onSubmitEditing={() => search()}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="검색하기"
          onPress={() => search()}
          testID="search-submit"
          style={s.searchButton}
        >
          <Icon name="arrow" size={18} color="#fff" />
        </Pressable>
      </View>
      <View style={s.suggestions}>
        <Text style={s.suggestionLabel}>빠른 검색</Text>
        {["도리토스", "하다라보", "킷캣 말차"].map((q) => (
          <Pressable
            accessibilityRole="button"
            key={q}
            testID={`quick-search-${q}`}
            onPress={() => search(q)}
          >
            <Text style={s.suggestion}>{q}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.browseHead}>
        <Text style={s.sectionTitle}>카테고리 둘러보기</Text>
        <Text style={s.browseCaption}>다른 여행자의 영수증 기록</Text>
      </View>
      <View style={s.grid}>
        {CATEGORIES.map((c, i) => {
          const active = category === c.name;
          return (
            <React.Fragment key={c.name}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${c.name} 카테고리`}
                accessibilityState={{ selected: active }}
                onPress={() => chooseCategory(c.name)}
                testID={`category-${c.name}`}
                style={[
                  s.tile,
                  { backgroundColor: TILE_COLORS[c.name] },
                  active && s.tileActive,
                  !!category && !active && { opacity: 0.5 },
                ]}
              >
                <View style={{ alignSelf: "flex-end" }}>
                  <Icon name={c.icon} color="#fff" size={22} />
                </View>
                <Text style={s.tileText}>{c.name}</Text>
              </Pressable>
              {i === resultsAfter && categoryResults}
            </React.Fragment>
          );
        })}
      </View>
      {!demo && (
        <View
          style={{
            flexDirection: "row",
            gap: 5,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          {Object.keys(CURRENCIES).map((c) => (
            <Chip
              key={c}
              title={c}
              active={currency === c}
              onPress={() => setCurrency(c)}
            />
          ))}
        </View>
      )}
      <View style={s.locationRow}>
        <Icon name="pin" color={colors.primary} size={15} />
        <Text style={s.locationText}>
          {demo ? "신주쿠역 · 시연 위치 · 반경 3km" : "현재 위치 · 반경 3km"}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="현재 위치 사용"
          onPress={locate}
          disabled={locating}
          style={s.locateButton}
        >
          {locating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <Icon name="location" size={14} color={colors.primary} />
          )}
          <Text style={s.locateText}>{locating ? "확인 중" : "내 위치"}</Text>
        </Pressable>
      </View>
      {message ? (
        <Text accessibilityRole="alert" style={s.error}>
          {message}
        </Text>
      ) : null}
      {loadError ? (
        <Text accessibilityRole="alert" style={s.error} testID="prices-error">
          {loadError}
        </Text>
      ) : null}
      {!category && !!searched && !loading && !loadError && (
        <>
          <View style={s.resultsHead}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text style={s.sectionTitle}>주변 매장</Text>
              <Text style={s.count}>{prices.length}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {["가격순", "거리순"].map((x) => (
                <Chip
                  key={x}
                  title={x}
                  active={sort === x}
                  onPress={() => setSort(x)}
                />
              ))}
            </View>
          </View>
          <Text style={s.productTitle}>
            {searched}
            <Text style={s.unitNote}> · 개당 가격 · {effectiveCurrency}</Text>
          </Text>
          {sorted.length ? (
            sorted.slice(0, limit).map((p) => {
              const comparable = prices.filter(
                (row) =>
                  normalizeProduct(row.product) === normalizeProduct(p.product),
              );
              const lowest = Math.min(
                ...comparable.map((row) => row.unitMinor),
              );
              const cheapest = p.unitMinor === lowest,
                active = selected === p.id;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${storeLabel(p)} 매장 선택`}
                  onPress={() => setSelected(p.id)}
                  key={p.id}
                  style={[
                    s.storeCard,
                    cheapest && s.cheapest,
                    active && { borderColor: colors.primary },
                  ]}
                  testID={`store-${p.id}`}
                >
                  <View style={s.storeTop}>
                    <View
                      style={[
                        s.storeIcon,
                        cheapest && { backgroundColor: "#DCEFFD" },
                      ]}
                    >
                      <Icon
                        name="bag"
                        color={cheapest ? colors.primary : "#819CB2"}
                        size={22}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={s.storeNameRow}>
                        <Text style={s.storeName}>{storeLabel(p)}</Text>
                        {cheapest && <Text style={s.lowest}>최저 기록</Text>}
                      </View>
                      {storeOriginal(p) ? (
                        <Text style={s.storeOriginal}>{storeOriginal(p)}</Text>
                      ) : null}
                      <Text style={[s.storeDistance, { fontSize: 8 }]}>
                        {p.product}
                      </Text>
                      <Text style={s.storeDistance}>
                        {p.distance < 1000
                          ? `${p.distance}m`
                          : `${(p.distance / 1000).toFixed(1)}km`}{" "}
                        · 도보 약 {Math.max(1, Math.ceil(p.distance / 70))}분{" "}
                        <Text style={{ color: "#A5B4C1" }}>추정</Text>
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={[s.price, cheapest && { color: colors.primary }]}
                      >
                        {money(p.unitMinor, p.currency)}
                      </Text>
                      {!cheapest && (
                        <Text style={s.priceDiff}>
                          동일 상품 최저보다 +
                          {money(p.unitMinor - lowest, p.currency)}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={s.storeBottom}>
                    <Text style={s.purchaseDate}>
                      구매일 {p.date.replace(/-/g, ".")}
                    </Text>
                    <Pressable
                      accessibilityRole="link"
                      accessibilityLabel={`${storeLabel(p)} 지도에서 보기`}
                      onPress={() =>
                        Linking.openURL(
                          `https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=18/${p.latitude}/${p.longitude}`,
                        )
                      }
                    >
                      <Text style={s.mapLink}>위치 보기 ↗</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          ) : (
            <View style={s.emptyCard}>
              <Empty
                icon="search"
                title="아직 주변 구매 기록이 없어요"
                detail={
                  "같은 상품의 구매 기록이 쌓이면 여기에 표시돼요.\n상품명과 용량을 다시 확인해 보세요."
                }
              />
            </View>
          )}
          {moreButton(sorted.length)}
        </>
      )}
      <View style={s.notice}>
        <Icon name="info" color="#8AA0B4" size={16} />
        <Text style={s.noticeText}>
          영수증에 기록된 과거 구매가격이에요. 현재 가격과 재고는 다를 수
          있어요. 도보 시간은 직선거리 기준 추정치예요.
        </Text>
      </View>
      <View style={s.sharing}>
        <View style={s.sharingHeading}>
          <Icon name="receipt" color={colors.primary} size={19} />
          <Text style={s.sharingTitle}>나의 기록이 누군가의 좋은 선택으로</Text>
        </View>
        <Text style={s.sharingText}>
          가계부에 저장한 영수증의 매장·상품·개당 가격·구매일이 모여요. 영수증
          사진과 개인 결제정보는 공유하지 않아요.
        </Text>
      </View>
      <View style={{ gap: 10, marginTop: 16 }}>
        {!demo && (
          <Button
            title="공유 기록 새로고침"
            variant="outline"
            onPress={() => {
              void onRefresh();
            }}
          />
        )}
        {!demo && (
          <Button
            title="신주쿠 시연 위치로 보기"
            variant="soft"
            onPress={() => {
              setDemo(true);
              setLocation(DEMO_LOCATION);
              setSelected(null);
            }}
          />
        )}
        <Text style={s.sync}>
          {demo
            ? `신주쿠 주변 매장·가격은 시연용 가데이터예요. ${syncMessage}`
            : syncMessage}
        </Text>
      </View>
      <Modal
        visible={active && loading}
        transparent
        animationType="fade"
        onRequestClose={() => {}}
      >
        <View style={s.loadingBackdrop}>
          <View
            style={s.loadingCard}
            testID="prices-loading"
            accessibilityViewIsModal
            accessibilityState={{ busy: true }}
          >
            <Image
              source={require("../../assets/search-pudding.png")}
              style={s.loadingImage}
              resizeMode="contain"
              accessible={false}
              testID="search-loading-image"
            />
            <Text style={s.loadingTitle} accessibilityRole="header" accessibilityLiveRegion="polite">
              검색 중입니다
            </Text>
            <Text style={s.loadingDescription}>주변 매장의 가격 기록을 찾고 있어요.</Text>
            <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
          </View>
        </View>
      </Modal>
      {mapOpen && (
        <Sheet
          visible
          title={category ? `${category} 매장 지도` : "주변 매장 지도"}
          subtitle={`${category || searched || "검색 결과"} · 매장 ${shown.length}곳 · 반경 3km`}
          onClose={onCloseMap}
        >
          <PriceMap
            center={location}
            prices={shown}
            selected={selected}
            onSelect={setSelected}
          />
          <View style={s.mapCaption}>
            <View style={s.mapDot} />
            <Text style={s.mapCaptionText}>
              {demo
                ? "파란 점은 시연 위치(신주쿠역)예요"
                : "파란 점은 현재 위치예요"}
            </Text>
            <Text style={s.demoBadge}>
              {demo ? "시연 가데이터 · 공유 영수증" : "공유 영수증 기록"}
            </Text>
          </View>
          {!shown.length && (
            <Text style={s.mapEmpty}>
              지도에 표시할 매장이 없어요. 검색어나 카테고리를 바꿔 보세요.
            </Text>
          )}
          {selectedPrice && (
            <View style={s.selected}>
              <Icon name="pin" color={colors.primary} size={18} />
              <Text style={s.selectedText}>
                {storeLabel(selectedPrice)} ·{" "}
                {money(selectedPrice.unitMinor, selectedPrice.currency)}
              </Text>
              <Pressable
                onPress={() => setSelected(null)}
                accessibilityLabel="매장 선택 해제"
              >
                <Icon name="close" size={16} />
              </Pressable>
            </View>
          )}
        </Sheet>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  // 우하단 지도 버튼이 마지막 내용을 가리지 않도록 아래 여백을 둡니다.
  content: { padding: 24, paddingTop: 14, paddingBottom: 72 },
  eyebrow: {
    fontSize: 9,
    color: colors.primary,
    fontWeight: "700",
    letterSpacing: 2,
    marginBottom: 9,
  },
  title: {
    fontSize: 25,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -1.2,
  },
  subtitle: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
    marginBottom: 24,
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderWidth: 1.5,
    borderColor: "#BCD9F0",
    borderRadius: 16,
    padding: 8,
    paddingLeft: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 8,
    minWidth: 0,
    outlineWidth: 0,
  },
  searchButton: {
    backgroundColor: colors.primary,
    padding: 10,
    borderRadius: 11,
  },
  suggestions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 12,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  suggestionLabel: { fontSize: 11, color: colors.muted },
  suggestion: { fontSize: 12, color: "#6F8DA5" },
  browseHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 13,
  },
  browseCaption: { fontSize: 10, color: colors.muted },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginBottom: 24 },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    height: 78,
    borderRadius: 14,
    padding: 13,
    justifyContent: "space-between",
  },
  categoryResults: { width: "100%", marginBottom: 6 },
  tileActive: { borderWidth: 2.5, borderColor: colors.ink },
  tileText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  sorts: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  purchaseCount: { fontSize: 9, color: colors.primary, fontWeight: "700" },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
  },
  locationText: { flex: 1, fontSize: 11, color: "#5E7B92" },
  locateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 7,
    borderRadius: 10,
    backgroundColor: "#E9F2FA",
  },
  locateText: { fontSize: 10, color: colors.primary, fontWeight: "600" },
  error: { color: "#B7624E", fontSize: 11, lineHeight: 18, marginBottom: 12 },
  loadingBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#183A5666",
  },
  loadingCard: {
    width: "100%",
    maxWidth: 300,
    alignItems: "center",
    padding: 24,
    borderRadius: 24,
    backgroundColor: "#fff",
    boxShadow: "0px 12px 40px #183A5626",
  },
  loadingImage: { width: 208, height: 208, maxWidth: "100%" },
  loadingTitle: { marginTop: 8, fontSize: 20, fontWeight: "800", color: colors.ink },
  loadingDescription: { marginTop: 8, fontSize: 12, color: colors.muted, textAlign: "center", lineHeight: 18 },
  mapCaption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 11,
  },
  mapDot: {
    width: 5,
    height: 5,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  mapCaptionText: { fontSize: 9, color: colors.muted, flex: 1 },
  demoBadge: { color: "#8AA0B4", fontSize: 8 },
  mapEmpty: {
    fontSize: 11,
    color: colors.muted,
    marginTop: 12,
    lineHeight: 18,
  },
  selected: {
    backgroundColor: "#E6F2FB",
    borderRadius: 12,
    marginTop: 15,
    flexDirection: "row",
    gap: 8,
    padding: 12,
    alignItems: "center",
  },
  selectedText: {
    flex: 1,
    color: colors.primary,
    fontSize: 12,
    fontWeight: "600",
  },
  resultsHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.6,
  },
  count: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  productTitle: {
    marginTop: 14,
    marginBottom: 13,
    color: "#5F7B91",
    fontWeight: "600",
    fontSize: 11,
  },
  unitNote: { fontSize: 9, color: colors.muted, fontWeight: "400" },
  storeCard: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 17,
    marginBottom: 11,
  },
  cheapest: { borderColor: "#B9D8EE", backgroundColor: "#F9FCFF" },
  storeTop: { flexDirection: "row", gap: 11, alignItems: "center" },
  storeIcon: { backgroundColor: "#F0F5F9", borderRadius: 12, padding: 10 },
  storeNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  storeName: { fontSize: 13, color: colors.ink, fontWeight: "700" },
  storeOriginal: { fontSize: 9, color: colors.muted, marginTop: 2 },
  lowest: {
    fontSize: 8,
    color: colors.primary,
    backgroundColor: "#E2EFFA",
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 4,
  },
  storeDistance: { fontSize: 9, color: colors.muted, marginTop: 7 },
  price: {
    fontSize: 22,
    color: colors.ink,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  priceDiff: { fontSize: 8, color: colors.muted, marginTop: 4 },
  storeBottom: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 12,
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  purchaseDate: { fontSize: 9, color: colors.muted },
  mapLink: { fontSize: 9, color: "#6086A3" },
  emptyCard: { backgroundColor: "#fff", borderRadius: 18 },
  notice: { flexDirection: "row", gap: 7, marginTop: 5, padding: 10 },
  noticeText: { flex: 1, fontSize: 10, color: "#879BAE", lineHeight: 18 },
  sharing: {
    backgroundColor: "#EAF3FC",
    borderRadius: 17,
    padding: 17,
    marginTop: 15,
  },
  sharingHeading: { flexDirection: "row", alignItems: "center", gap: 7 },
  sharingTitle: {
    color: colors.primary,
    fontWeight: "700",
    fontSize: 12,
    flex: 1,
  },
  sharingText: { marginTop: 9, color: "#6F8CA4", fontSize: 11, lineHeight: 19 },
  sync: {
    textAlign: "center",
    color: colors.muted,
    fontSize: 9,
    lineHeight: 16,
    marginBottom: 24,
  },
});
