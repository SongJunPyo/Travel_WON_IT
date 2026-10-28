import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
  Platform,
  AppState,
} from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { Ledger } from "./src/screens/Ledger";
import { Compare } from "./src/screens/Compare";
import { ReceiptEditor } from "./src/components/ReceiptEditor";
import { TripSettings } from "./src/components/TripSettings";
import { colors, Icon } from "./src/components/ui";
import {
  createInitialState,
  fingerprint,
  tripReady,
  validateReceipt,
  withoutDefaults,
} from "./src/domain.mjs";
import { loadLedger, syncLedger } from "./src/api";
import type { Receipt, TravelState } from "./src/types";

const STORAGE_KEY = "travel-wonhae-mobile-v1",
  TOKEN_KEY = "travel-wonhae-device-token";
function TravelApp() {
  const [state, setState] = useState<TravelState>(() => createInitialState()),
    [loaded, setLoaded] = useState(false),
    [storageFailed, setStorageFailed] = useState(false);
  const [tab, setTab] = useState("ledger"),
    [visitedCompare, setVisitedCompare] = useState(false),
    [mapOpen, setMapOpen] = useState(false),
    [editor, setEditor] = useState(false),
    [editing, setEditing] = useState<Receipt | null>(null),
    [settings, setSettings] = useState(false),
    [notice, setNotice] = useState("");
  const [pricesVersion, setPricesVersion] = useState(0),
    [syncMessage, setSyncMessage] =
      useState("가계부를 서버에 저장하고 있어요.");
  const token = useRef(""),
    writeQueue = useRef(Promise.resolve()),
    syncQueue = useRef(Promise.resolve());
  const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null),
    { width } = useWindowDimensions(),
    insets = useSafeAreaInsets();
  const desktop = Platform.OS === "web" && width >= 980;
  // PAGE 2 추천순 개인화에 쓰는 가계부 요약(남은 예산 비율, 가장 많이 쓴 카테고리)
  const profile = recommendProfile(
    summarize(state.receipts, state.trip.budget),
    state.trip.budget,
  );
  useEffect(() => {
    if (Platform.OS === "web") {
      document.title = "여행WON해 | 가볍게 기록하고, 현명하게 여행해요";
      document.documentElement.lang = "ko";
    }
    let active = true;
    (async () => {
      try {
        const [saved, savedToken] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(TOKEN_KEY),
        ]);
        token.current =
          savedToken || `${Crypto.randomUUID()}${Crypto.randomUUID()}`;
        if (!savedToken) await AsyncStorage.setItem(TOKEN_KEY, token.current);
        // 기기에 저장된 가계부가 없으면 서버(MySQL)에 저장된 이 기기의 가계부를 불러옵니다.
        let source = saved ? JSON.parse(saved) : null;
        if (!source) source = await loadLedger(token.current).catch(() => null);
        if (source) {
          const parsed = source;
          if (
            parsed.version !== 1 ||
            !parsed.trip ||
            !Number.isSafeInteger(parsed.trip.budget) ||
            !Array.isArray(parsed.receipts)
          )
            throw new Error("저장 형식 오류");
          parsed.receipts.forEach(validateReceipt);
          // 예전 버전이 넣어 둔 기본 시연 영수증과 기본 여행(파리·도쿄)은 불러오지 않습니다.
          if (active) setState(withoutDefaults(parsed));
        }
      } catch {
        if (active) {
          setStorageFailed(true);
          setNotice(
            "저장소를 읽지 못했어요. 기존 데이터를 보호하기 위해 저장을 멈췄어요. 앱을 다시 실행해 주세요.",
          );
        }
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded || storageFailed) return;
    writeQueue.current = writeQueue.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)))
      .catch(() => {
        setStorageFailed(true);
        setNotice(
          "기기에 저장하지 못했어요. 저장 공간과 브라우저 설정을 확인해 주세요.",
        );
      });
  }, [state, loaded, storageFailed]);
  async function refresh() {
    if (!token.current || storageFailed) return;
    // 여행(도시·국가·기간)을 정하기 전에는 서버가 받지 않으므로 기기에만 저장합니다.
    if (!tripReady(state.trip)) {
      setSyncMessage("여행을 설정하면 가계부를 서버에도 저장해요.");
      return;
    }
    // 가계부 전체를 순서대로 서버 DB에 저장해 삭제·수정과 재시도를 함께 처리합니다.
    // 저장이 끝나면 PAGE 2가 서버에서 다시 조회해 방금 저장한 영수증도 보여 줍니다.
    const current = state;
    syncQueue.current = syncQueue.current.then(async () => {
      try {
        await syncLedger(current, token.current);
        setSyncMessage("가계부를 서버에 저장했어요.");
        setPricesVersion((v) => v + 1);
      } catch {
        setSyncMessage(
          "서버에 연결하지 못했어요. 가계부는 기기에 저장했고, 다음 연결 때 서버에 반영해요.",
        );
      }
    });
    await syncQueue.current;
  }
  useEffect(() => {
    if (loaded) void refresh();
  }, [state, loaded, storageFailed]);
  useEffect(() => {
    if (!loaded || storageFailed) return;
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") void refresh();
    });
    const timer = setInterval(() => {
      void refresh();
    }, 60000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [state.receipts, loaded, storageFailed]);
  useEffect(() => {
    if (!notice || storageFailed) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice, storageFailed]);
  function saveReceipt(receipt: Receipt) {
    if (storageFailed)
      throw new Error("저장소 연결을 확인한 뒤 앱을 다시 실행해 주세요.");
    if (
      state.receipts.some(
        (r) => r.id !== receipt.id && fingerprint(r) === fingerprint(receipt),
      )
    )
      throw new Error("같은 매장·구매일·금액의 영수증이 이미 있어요.");
    setState((prev) => ({
      ...prev,
      receipts: [...prev.receipts.filter((r) => r.id !== receipt.id), receipt],
    }));
    setEditor(false);
    setEditing(null);
    setNotice("여행의 기록을 저장했어요.");
  }
  function navigate(next: string) {
    if (next === "compare") setVisitedCompare(true);
    setTab(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  }
  if (!loaded)
    return (
      <View style={s.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={s.loadingText}>여행의 기록을 꺼내고 있어요</Text>
      </View>
    );
  return (
    <View style={s.outer}>
      <StatusBar style="dark" />
      {desktop && (
        <View style={s.desktopIntro}>
          <View style={s.desktopBrand}>
            <Image
              source={require("./assets/travel-pudding.png")}
              style={{ width: 39, height: 45 }}
              resizeMode="contain"
            />
            <Text style={s.desktopBrandName}>
              여행<Text style={{ color: colors.primary }}>WON</Text>해
            </Text>
          </View>
          <View style={s.desktopCopy}>
            <Text style={s.desktopEyebrow}>
              A LITTLE NOTE, A BETTER JOURNEY.
            </Text>
            <Text style={s.desktopTitle}>
              가볍게 기록하고,{`\n`}현명하게 여행해요.
            </Text>
            <Text style={s.desktopDescription}>
              영수증 속 작은 기록이{`\n`}나의 여행도, 누군가의 여행도 더 좋게.
            </Text>
            <View style={s.desktopFeatures}>
              <Text style={s.feature}>01 AI 여행 가계부</Text>
              <View style={s.featureDivider} />
              <Text style={s.feature}>02 주변 상품 가격 비교</Text>
            </View>
          </View>
          <Image
            source={require("./assets/travel-pudding.png")}
            style={s.desktopMascot}
            resizeMode="contain"
          />
          <Text style={s.desktopFooter}>당신의 다음 여행에도, 여행WON해.</Text>
        </View>
      )}
      <View
        style={[s.app, desktop && s.desktopApp, { paddingTop: insets.top }]}
      >
        <View style={s.header}>
          <View style={s.brand}>
            <View style={s.brandIcon}>
              <Image
                source={require("./assets/receipt-pudding.png")}
                style={s.brandImage}
              />
            </View>
            <Text style={s.brandName}>
              여행<Text style={{ color: colors.primary }}>WON</Text>해
            </Text>
          </View>
          <View style={s.headerRight}>
            <View style={s.aiBadge}>
              <Icon name="sparkles" size={12} color={colors.primary} />
              <Text style={s.aiBadgeText}>TRAVEL SMARTER</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="설정 열기"
              onPress={() => setSettings(true)}
              style={s.avatar}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: colors.primary,
                  fontWeight: "800",
                }}
              >
                W
              </Text>
            </Pressable>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 15 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ display: tab === "ledger" ? "flex" : "none" }}>
              <Ledger
                state={state}
                deviceToken={loaded ? token.current : ""}
                onAdd={() => {
                  setEditing(null);
                  setEditor(true);
                }}
                onSettings={() => setSettings(true)}
                onReceipt={(r) => {
                  setEditing(r);
                  setEditor(true);
                }}
              />
            </View>
            {visitedCompare && (
              <View style={{ display: tab === "compare" ? "flex" : "none" }}>
                <Compare
                  active={tab === "compare"}
                  version={pricesVersion}
                  profile={profile}
                  onRefresh={refresh}
                  syncMessage={syncMessage}
                  mapOpen={mapOpen}
                  onCloseMap={() => setMapOpen(false)}
                />
              </View>
            )}
          </ScrollView>
          {tab === "compare" && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="주변 매장 지도 열기"
              onPress={() => setMapOpen(true)}
              testID="map-open"
              style={({ pressed }) => [
                s.mapButton,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Icon name="map" color="#fff" size={17} />
              <Text style={s.mapButtonText}>지도</Text>
            </Pressable>
          )}
        </View>
        {!!notice && (
          <View accessibilityRole="alert" style={s.toast}>
            <Icon
              name={storageFailed ? "info" : "check"}
              color="#fff"
              size={16}
            />
            <Text style={s.toastText}>{notice}</Text>
          </View>
        )}
        <View
          style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 12) }]}
        >
          {[
            { id: "ledger", name: "여행 가계부", icon: "wallet" },
            { id: "compare", name: "주변 가격 비교", icon: "pin" },
          ].map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityLabel={item.name}
              accessibilityState={{ selected: tab === item.id }}
              onPress={() => navigate(item.id)}
              testID={`tab-${item.id}`}
              style={s.navItem}
            >
              <View style={[s.navIcon, tab === item.id && s.navIconActive]}>
                <Icon
                  name={item.icon}
                  color={tab === item.id ? colors.primary : "#A2B2C1"}
                  size={22}
                />
              </View>
              <Text
                style={[
                  s.navLabel,
                  tab === item.id && {
                    color: colors.primary,
                    fontWeight: "700",
                  },
                ]}
              >
                {item.name}
              </Text>
              {tab === item.id && <View style={s.activeDot} />}
            </Pressable>
          ))}
        </View>
      </View>
      {editor && (
        <ReceiptEditor
          key={editing?.id || "new"}
          visible
          trip={state.trip}
          initial={editing}
          onClose={() => setEditor(false)}
          onSave={saveReceipt}
          onDelete={(id) => {
            setState((prev) => ({
              ...prev,
              receipts: prev.receipts.filter((r) => r.id !== id),
            }));
            setEditor(false);
            setNotice("영수증을 삭제했어요. 공유 가격도 연결 시 삭제돼요.");
          }}
        />
      )}
      {settings && (
        <TripSettings
          trip={state.trip}
          onClose={() => setSettings(false)}
          onSave={(trip) => {
            if (storageFailed) {
              setNotice("저장소를 사용할 수 없어요. 앱을 다시 실행해 주세요.");
              return;
            }
            setState((prev) => ({ ...prev, trip }));
            setSettings(false);
            setNotice("이번 여행의 설정을 저장했어요.");
          }}
          onClear={() => {
            setState((prev) => ({
              ...prev,
              receipts: prev.receipts.filter((r) => !r.demo),
            }));
            setSettings(false);
            setNotice("시연 기록을 지웠어요. 나의 여행을 기록해 보세요.");
          }}
        />
      )}
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <TravelApp />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  outer: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "center",
    backgroundColor: "#EBF3FA",
  },
  app: { flex: 1, maxWidth: 560, backgroundColor: colors.bg, minWidth: 0 },
  desktopApp: {
    marginVertical: 24,
    marginRight: 50,
    maxWidth: 450,
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D8E5F1",
    boxShadow: "0px 18px 60px #183A5614",
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 7 },
  // 원본의 흰 여백을 잘라 둥근 아이콘 모양만 보이게 합니다.
  brandIcon: { width: 32, height: 32, borderRadius: 8, overflow: "hidden" },
  brandImage: { width: 35, height: 35, margin: -1.5 },
  brandName: {
    fontSize: 20,
    letterSpacing: -0.8,
    fontWeight: "800",
    color: colors.ink,
  },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 11 },
  aiBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  aiBadgeText: {
    fontSize: 6,
    letterSpacing: 0.6,
    color: "#6790AD",
    fontWeight: "600",
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 20,
    backgroundColor: "#E0EDF8",
    alignItems: "center",
    justifyContent: "center",
  },
  bottomNav: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: colors.line,
    flexDirection: "row",
    paddingTop: 10,
  },
  navItem: { flex: 1, alignItems: "center", gap: 4, minHeight: 54 },
  navIcon: {
    width: 62,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  navIconActive: { backgroundColor: "#EAF4FD" },
  navLabel: { fontSize: 10, color: "#8E9FB0", fontWeight: "500" },
  activeDot: {
    position: "absolute",
    bottom: -5,
    width: 3,
    height: 3,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  mapButton: {
    position: "absolute",
    right: 20,
    bottom: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    boxShadow: "0px 6px 16px #0067AC40",
    zIndex: 10,
  },
  mapButtonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  toast: {
    position: "absolute",
    bottom: 95,
    left: 20,
    right: 20,
    flexDirection: "row",
    backgroundColor: "#183A56F2",
    padding: 15,
    borderRadius: 15,
    alignItems: "center",
    gap: 8,
    zIndex: 20,
  },
  toastText: { color: "#fff", fontSize: 11, flex: 1, lineHeight: 18 },
  loading: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: 18,
  },
  loadingText: { fontSize: 12, color: colors.muted },
  desktopIntro: {
    flex: 1,
    maxWidth: 550,
    paddingHorizontal: 50,
    paddingVertical: 45,
    overflow: "hidden",
  },
  desktopBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  desktopBrandName: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -1,
  },
  desktopCopy: { marginTop: 70 },
  desktopEyebrow: {
    fontSize: 9,
    color: "#7E9AB1",
    letterSpacing: 1.7,
    fontWeight: "600",
  },
  desktopTitle: {
    marginTop: 19,
    fontSize: 38,
    fontWeight: "800",
    lineHeight: 55,
    color: colors.ink,
    letterSpacing: -2,
  },
  desktopDescription: {
    fontSize: 14,
    lineHeight: 26,
    color: "#7B93A7",
    marginTop: 20,
  },
  desktopFeatures: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    marginTop: 28,
  },
  feature: { fontSize: 10, color: "#6C8CA5", fontWeight: "500" },
  featureDivider: { height: 12, width: 1, backgroundColor: "#C4D7E6" },
  desktopMascot: {
    flex: 1,
    width: "85%",
    maxHeight: 300,
    alignSelf: "flex-end",
    marginTop: 25,
    opacity: 0.95,
  },
  desktopFooter: { fontSize: 10, color: "#8BA3B6", marginTop: 20 },
});
