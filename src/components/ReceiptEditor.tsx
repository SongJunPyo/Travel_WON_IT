import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  BROWSE_CATEGORIES,
  CATEGORIES,
  CURRENCIES,
  parseMoney,
  minorText,
  money,
  rateUnits,
  validateReceipt,
  toWon,
  won,
  demoStoreLocation,
} from "../domain.mjs";
import { fetchExchangeRate, recognizeReceipt } from "../api";
import { Sheet, Button, Field, Label, Chip, Icon, colors } from "./ui";
import type { Coordinate, Receipt, TravelState } from "../types";

type ItemDraft = {
  name: string;
  nameKo: string;
  quantity: string;
  price: string;
};
// 분석을 기다리는 동안 순서대로 보여 줄 안내 문구
const ANALYZING_STEPS = [
  "매장명과 구매일을 찾고 있어요",
  "상품과 가격을 읽고 있어요",
  "상품명을 한국어로 옮기고 있어요",
  "금액 합계를 맞춰 보고 있어요",
];
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(
    new Date(),
  );
// PAGE 2 카테고리 선택지. "선택 안 함"이면 상품·매장 검색에만 나옵니다.
const BROWSE_CHOICES: { name: string | null; title: string }[] = [
  { name: null, title: "선택 안 함" },
  ...BROWSE_CATEGORIES.map((c) => ({ name: c.name, title: c.name })),
];
export function ReceiptEditor({
  visible,
  trip,
  initial,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  trip: TravelState["trip"];
  initial: Receipt | null;
  onClose: () => void;
  onSave: (r: Receipt) => void;
  onDelete: (id: string) => void;
}) {
  const [store, setStore] = useState(initial?.store || ""),
    [storeKo, setStoreKo] = useState(initial?.storeKo || ""),
    [date, setDate] = useState(initial?.date || today()),
    [category, setCategory] = useState(initial?.category || "음식"),
    [browseCategory, setBrowseCategory] = useState<string | null>(
      initial?.browseCategory || null,
    );
  const [currency, setCurrency] = useState(initial?.currency || trip.currency),
    [rate, setRate] = useState(String(initial?.rate || trip.rate)),
    [rateNote, setRateNote] = useState<{ text: string; failed: boolean } | null>(
      null,
    ),
    [rateLoading, setRateLoading] = useState(false);
  // 환율 요청 번호. 그사이 통화를 바꾸거나 직접 입력하면 번호가 바뀌어 늦게 온 응답을 버립니다.
  const rateRequest = useRef(0);
  // 오늘 환율을 못 불러올 때 쓰는 값: 여행 통화는 여행 설정의 환율, 원화는 1
  const fallbackRate = (c: string) =>
    c === trip.currency ? String(trip.rate) : c === "KRW" ? "1" : "";
  const [items, setItems] = useState<ItemDraft[]>(
    initial?.items.map((i) => ({
      name: i.name,
      nameKo: i.nameKo || "",
      quantity: String(i.quantity),
      price: minorText(i.unitMinor, initial.currency),
    })) || [{ name: "", nameKo: "", quantity: "1", price: "" }],
  );
  const [total, setTotal] = useState(
    initial ? minorText(initial.totalMinor, initial.currency) : "",
  );
  // 매장 좌표는 서버가 매장 주소로 찾습니다. 예전에 확인한 위치는 수정할 때 그대로 유지해요.
  const [location, setLocation] = useState<Coordinate | null>(
      initial?.location || null,
    ),
    [address, setAddress] = useState(initial?.address || "");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [analyzing, setAnalyzing] = useState(false),
    [step, setStep] = useState(0),
    [image, setImage] = useState<string | null>(null),
    [demo, setDemo] = useState(initial?.demo || false),
    [deleteConfirm, setDeleteConfirm] = useState(false),
    [source, setSource] = useState(
      initial ? "등록 내역을 수정할 수 있어요." : "",
    );
  useEffect(() => {
    if (!analyzing) return;
    setStep(0);
    const timer = setInterval(
      () => setStep((n) => Math.min(n + 1, ANALYZING_STEPS.length - 1)),
      3500,
    );
    return () => clearInterval(timer);
  }, [analyzing]);
  // 새 영수증은 오늘 환율을 기본값으로 채웁니다. 저장된 영수증은 그때 쓴 환율을 그대로 둡니다.
  useEffect(() => {
    if (!initial) void loadRate(currency);
  }, []);
  function updateItem(index: number, key: keyof ItemDraft, value: string) {
    setItems((prev) =>
      prev.map((i, n) => (n === index ? { ...i, [key]: value } : i)),
    );
  }
  function applyData(data: any, isDemo: boolean) {
    setStore(data.store || "");
    setStoreKo(data.storeKo || "");
    setDate(data.date || today());
    setCurrency(data.currency || trip.currency);
    setCategory(
      CATEGORIES.some((c) => c.name === data.category) ? data.category : "기타",
    );
    setItems(
      data.items.map((i: any) => ({
        name: i.name,
        nameKo: i.nameKo || "",
        quantity: String(i.quantity),
        price: minorText(i.unitMinor, data.currency),
      })),
    );
    setTotal(minorText(data.totalMinor, data.currency));
    setDemo(isDemo);
    setLocation(null);
    // 영수증에 찍힌 매장 주소를 그대로 채웁니다. 저장하면 DB의 receipts.store_address에 들어가요.
    setAddress(data.address || "");
    const nextCurrency = data.currency || trip.currency;
    setRate(fallbackRate(nextCurrency));
    void loadRate(nextCurrency);
    setSource(
      isDemo
        ? "시연 예시예요. 실제 사진의 인식 결과가 아니에요."
        : "AI 인식 결과예요. 구매일·단가·합계를 꼭 확인해 주세요.",
    );
  }
  async function pick(camera: boolean) {
    setError("");
    setBusy(true);
    try {
      if (camera && Platform.OS !== "web") {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted)
          throw new Error(
            "카메라 권한이 필요해요. 사진 선택이나 직접 입력도 가능해요.",
          );
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        base64: true,
        quality: 0.75,
        allowsEditing: false,
        exif: false,
      };
      const result = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64)
        throw new Error(
          "사진을 읽지 못했어요. JPG 또는 PNG 사진을 선택해 주세요.",
        );
      if (asset.base64.length > 13_900_000)
        throw new Error("사진이 너무 커요. 10MB 이하의 사진을 선택해 주세요.");
      setImage(asset.uri);
      // 네이티브 picker는 원본이 HEIC여도 base64를 JPEG로 반환할 수 있어요.
      const mime = asset.base64.startsWith("/9j/")
        ? "image/jpeg"
        : asset.base64.startsWith("iVBORw0KGgo")
          ? "image/png"
          : asset.base64.startsWith("UklGR")
            ? "image/webp"
            : asset.mimeType;
      setAnalyzing(true);
      const receipt = await recognizeReceipt({
        uri: asset.uri,
        base64: asset.base64,
        mimeType: mime || "image/jpeg",
      });
      applyData(receipt, false);
    } catch (e) {
      // Expo fetch는 시간 초과·연결 끊김을 모두 "fetch failed: ..."로 던지므로 원래 메시지를 함께 보여 줍니다.
      console.warn("영수증 분석 실패", e);
      setError(
        e instanceof Error
          ? e.message.includes("fetch") || e.message.includes("Network")
            ? `분석 서버에 연결하지 못했어요. 서버 실행 상태를 확인하거나 직접 입력해 주세요. (${e.message})`
            : e.message
          : "사진 분석에 실패했어요. 직접 입력할 수 있어요.",
      );
    } finally {
      setAnalyzing(false);
      setBusy(false);
    }
  }
  // 오늘 환율(한국수출입은행 매매기준율)을 적용 환율의 기본값으로 채웁니다. 값은 사용자가 고칠 수 있어요.
  async function loadRate(target: string) {
    const request = ++rateRequest.current;
    if (target === "KRW") {
      setRateLoading(false);
      setRateNote(null);
      return;
    }
    setRateLoading(true);
    setRateNote({ text: "오늘 환율을 불러오고 있어요.", failed: false });
    try {
      const result = await fetchExchangeRate(target);
      if (request !== rateRequest.current) return;
      setRate(String(result.rate));
      setRateNote({
        text: `${result.source} · ${result.date} 기준 오늘 환율이에요. 카드 결제 환율과 다르면 직접 고쳐 주세요.`,
        failed: false,
      });
    } catch (e) {
      if (request !== rateRequest.current) return;
      setRateNote({
        text:
          e instanceof Error && !e.message.includes("fetch")
            ? e.message
            : "환율 서버에 연결하지 못했어요. 적용 환율을 직접 입력해 주세요.",
        failed: true,
      });
    } finally {
      if (request === rateRequest.current) setRateLoading(false);
    }
  }
  function save() {
    setError("");
    try {
      if (rateUnits(rate) === null)
        throw new Error(
          "적용 환율을 0보다 크게, 소수 넷째 자리까지 입력해 주세요.",
        );
      const parsedItems = items.map((i) => ({
        name: i.name.trim(),
        ...(i.nameKo.trim() ? { nameKo: i.nameKo.trim() } : {}),
        quantity: /^\d+$/.test(i.quantity) ? Number(i.quantity) : 0,
        unitMinor: parseMoney(i.price, currency),
      }));
      const receipt: Receipt = {
        id:
          initial?.id ||
          `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        store: store.trim(),
        ...(storeKo.trim() ? { storeKo: storeKo.trim() } : {}),
        browseCategory,
        date,
        category,
        currency,
        rate: Number(rate),
        items: parsedItems,
        totalMinor: parseMoney(total, currency),
        shareConsent: !demo,
        demo,
        address: address.trim(),
        // 시연에서는 실제 GPS 대신 신주쿠역 근처의 가짜 매장 좌표를 넣어 PAGE 2와 지도에 나오게 합니다.
        location:
          location || (demo ? null : demoStoreLocation(store, address)),
        recordedAt: new Date().toISOString(),
      };
      validateReceipt(receipt);
      onSave(receipt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력한 값을 확인해 주세요.");
    }
  }
  function sumItems() {
    try {
      const sum = items.reduce(
        (sum, i) => sum + parseMoney(i.price, currency) * Number(i.quantity),
        0,
      );
      setTotal(minorText(sum, currency));
      setError("");
    } catch {
      setError("상품 가격과 수량을 먼저 입력해 주세요.");
    }
  }
  return (
    <Sheet
      visible={visible}
      title={initial ? "영수증 상세" : "새로운 여행의 기록"}
      subtitle={
        initial
          ? "상품별 내역과 가격 공유 설정을 확인해요"
          : "사진으로 간편하게, 직접 입력으로 꼼꼼하게"
      }
      onClose={onClose}
    >
      <Modal visible={analyzing} transparent animationType="fade">
        <View style={s.loadingBackdrop} testID="ocr-loading">
          <View style={s.loadingCard}>
            <Image
              source={require("../../assets/receipt-pudding.png")}
              resizeMode="contain"
              style={s.loadingImage}
              accessibilityIgnoresInvertColors
            />
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={s.loadingTitle}>AI가 영수증을 읽고 있어요</Text>
            <Text style={s.loadingStep}>{ANALYZING_STEPS[step]}</Text>
            <View style={s.loadingDots}>
              {ANALYZING_STEPS.map((_, n) => (
                <View
                  key={n}
                  style={[s.loadingDot, n <= step && s.loadingDotActive]}
                />
              ))}
            </View>
            <Text style={s.loadingNote}>
              보통 10~20초 걸려요.{"\n"}화면을 닫지 말고 잠시만 기다려 주세요.
            </Text>
          </View>
        </View>
      </Modal>
      {!initial && (
        <View style={s.upload}>
          <View style={s.uploadHeading}>
            <Icon name="scan" color={colors.primary} size={23} />
            <Text style={s.uploadTitle}>AI 영수증 분석</Text>
          </View>
          <Text style={s.uploadText}>
            사진 선택 시 AI 분석 서버로 전송돼요.{`\n`}사진 원본과 카드정보는
            서버에 저장하지 않아요.
          </Text>
          <View style={s.row}>
            <Button
              title="사진 선택"
              icon="image"
              onPress={() => {
                void pick(false);
              }}
              variant="outline"
              disabled={busy}
              style={{ flex: 1 }}
            />
            <Button
              title="촬영하기"
              icon="camera"
              onPress={() => {
                void pick(true);
              }}
              variant="soft"
              loading={busy}
              style={{ flex: 1 }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            testID="sample-receipt"
            onPress={() => {
              applyData(
                {
                  store: "데일리마트 · 시연 매장",
                  date: today(),
                  currency: "JPY",
                  category: "음식",
                  totalMinor: 636,
                  items: [
                    {
                      name: "DORITOS ナチョチーズ 60G",
                      nameKo: "도리토스 나초치즈 60g",
                      quantity: 2,
                      unitMinor: 158,
                    },
                    {
                      name: "コカ・コーラ 500ML",
                      nameKo: "코카콜라 500ml",
                      quantity: 2,
                      unitMinor: 160,
                    },
                  ],
                },
                true,
              );
              setImage(null);
              setError("");
            }}
            style={{ paddingTop: 14 }}
          >
            <Text style={s.sampleText}>먼저 시연 영수증으로 체험하기 →</Text>
          </Pressable>
        </View>
      )}
      {image && (
        <Image source={{ uri: image }} resizeMode="contain" style={s.preview} />
      )}
      {source ? <Text style={s.source}>{source}</Text> : null}
      <Field
        label="매장명 (영수증 원문)"
        value={store}
        onChangeText={setStore}
        placeholder="예: すし酒場さしす"
        testID="receipt-store"
      />
      <Field
        label="매장명 (한국어)"
        value={storeKo}
        onChangeText={setStoreKo}
        placeholder="예: 스시 사카바 사시스 (AI가 읽으면 자동 입력)"
        testID="receipt-store-ko"
      />
      <Field
        label="매장 주소"
        testID="store-address"
        value={address}
        onChangeText={setAddress}
        placeholder="영수증의 매장 주소 (AI가 읽으면 자동 입력)"
      />
      <Field
        label="구매일"
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        testID="receipt-date"
      />
      <Label>카테고리</Label>
      <View style={s.chips}>
        {CATEGORIES.map((c) => (
          <Chip
            key={c.name}
            title={c.name}
            active={category === c.name}
            onPress={() => setCategory(c.name)}
          />
        ))}
      </View>
      <Label>주변 가격 비교 카테고리</Label>
      <View style={s.chips}>
        {BROWSE_CHOICES.map((c) => (
          <Chip
            key={c.title}
            title={c.title}
            active={browseCategory === c.name}
            onPress={() => setBrowseCategory(c.name)}
            testID={`browse-category-${c.title}`}
          />
        ))}
      </View>
      <Text style={s.totalNote}>
        고르면 다른 여행자의 카테고리 둘러보기에 나와요. 고르지 않으면 상품·매장
        검색에만 나와요.
      </Text>
      <Label>결제 통화</Label>
      <View style={s.chips}>
        {Object.keys(CURRENCIES).map((c) => (
          <Chip
            key={c}
            title={c}
            active={currency === c}
            onPress={() => {
              setCurrency(c);
              setRate(fallbackRate(c));
              void loadRate(c);
            }}
          />
        ))}
      </View>
      <Field
        label={`적용 환율 · 1 ${currency}당 원화 (수정 가능)`}
        value={rate}
        onChangeText={(value) => {
          // 직접 입력한 값이 우선입니다. 불러오던 오늘 환율은 버립니다.
          rateRequest.current++;
          setRateLoading(false);
          setRate(value);
          setRateNote({ text: "직접 입력한 환율로 계산해요.", failed: false });
        }}
        keyboardType="decimal-pad"
        placeholder={currency === "JPY" ? "예: 8.3983" : "예: 1477.87"}
        testID="receipt-rate"
      />
      {currency !== "KRW" && (
        <View style={s.rateRow}>
          <Text
            style={[s.rateNote, rateNote?.failed && s.rateNoteFailed]}
            testID="rate-note"
          >
            {rateNote?.text ||
              "저장할 때 쓴 적용 환율이에요. 통화를 바꾸면 그 통화의 오늘 환율을 채워요."}
          </Text>
          {rateLoading && (
            <ActivityIndicator size="small" color={colors.primary} />
          )}
        </View>
      )}
      <View style={s.itemsHeading}>
        <Text style={s.itemsTitle}>구매 상품</Text>
        <Text style={s.itemsNote}>가격은 개당 가격이에요</Text>
      </View>
      {items.map((item, index) => (
        <View key={index} style={s.itemCard}>
          <View style={s.itemNumberRow}>
            <Text style={s.itemNumber}>
              ITEM {String(index + 1).padStart(2, "0")}
            </Text>
            {items.length > 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`상품 ${index + 1} 삭제`}
                onPress={() => setItems(items.filter((_, n) => n !== index))}
                style={{ padding: 6 }}
              >
                <Icon name="close" size={15} color={colors.muted} />
              </Pressable>
            )}
          </View>
          <Field
            label="원어 상품명 · 영수증 그대로"
            value={item.name}
            onChangeText={(v) => updateItem(index, "name", v)}
            placeholder="예: COCA COLA 50CL"
            testID={`item-name-${index}`}
          />
          <Field
            label="한국어 상품명 · 용량 포함"
            value={item.nameKo}
            onChangeText={(v) => updateItem(index, "nameKo", v)}
            placeholder="예: 코카콜라 500ml"
            testID={`item-name-ko-${index}`}
          />
          <View style={s.row}>
            <Field
              label="수량"
              value={item.quantity}
              onChangeText={(v) => updateItem(index, "quantity", v)}
              keyboardType="number-pad"
              testID={`item-quantity-${index}`}
            />
            <Field
              label={`개당 가격 (${currency})`}
              value={item.price}
              onChangeText={(v) => updateItem(index, "price", v)}
              keyboardType="decimal-pad"
              placeholder="0.00"
              testID={`item-price-${index}`}
            />
          </View>
        </View>
      ))}
      <Button
        title="상품 추가"
        icon="plus"
        variant="outline"
        onPress={() =>
          setItems([
            ...items,
            { name: "", nameKo: "", quantity: "1", price: "" },
          ])
        }
      />
      <View style={{ marginTop: 20 }}>
        <Field
          label={`총 결제금액 (${currency})`}
          value={total}
          onChangeText={setTotal}
          keyboardType="decimal-pad"
          testID="receipt-total"
          placeholder="0.00"
        />
        <Pressable
          accessibilityRole="button"
          onPress={sumItems}
          style={{ alignSelf: "flex-end", padding: 8, marginTop: -13 }}
        >
          <Text style={s.sumLink}>상품 합계로 채우기 ↗</Text>
        </Pressable>
        <Text style={s.totalNote}>
          할인·세금은 상품별 가격에 반영해 합계를 맞춰 주세요.
        </Text>
      </View>
      <View style={s.consent} testID="share-notice">
        <Text style={s.consentTitle}>
          {demo
            ? "시연 영수증은 가격 비교에 공유되지 않아요"
            : "이 영수증은 주변 가격 비교에 공유돼요"}
        </Text>
        <Text style={s.consentText}>
          {demo
            ? "실제 영수증만 다른 여행자의 가격 비교 데이터가 돼요."
            : "매장명·주소·상품명·개당 가격·구매일만 공유해요. 지도 위치는 시연용으로 신주쿠역 근처의 가상 좌표를 써요. 사진, 개인 결제정보, 원화 환산액은 공유하지 않아요."}
        </Text>
      </View>
      {error ? (
        <Text accessibilityRole="alert" testID="receipt-error" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        title={initial ? "변경사항 저장" : "가계부에 저장하기"}
        icon="check"
        onPress={save}
        disabled={busy}
        testID="save-receipt"
      />
      {initial && (
        <View style={{ marginTop: 12 }}>
          <Button
            title={
              deleteConfirm
                ? "삭제할게요 · 가계부와 공유 가격에서 삭제"
                : "이 영수증 삭제"
            }
            icon="trash"
            variant="danger"
            onPress={() => {
              if (deleteConfirm) onDelete(initial.id);
              else setDeleteConfirm(true);
            }}
            testID="delete-receipt"
          />
        </View>
      )}
    </Sheet>
  );
}
const s = StyleSheet.create({
  loadingBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  loadingCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 10,
  },
  loadingImage: { width: 120, height: 120, marginBottom: 4 },
  loadingTitle: {
    color: colors.ink,
    fontSize: 17,
    fontWeight: "700",
    marginTop: 6,
  },
  loadingStep: { color: colors.primary, fontSize: 13, fontWeight: "600" },
  loadingDots: { flexDirection: "row", gap: 6, marginTop: 4 },
  loadingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#D8E3EC",
  },
  loadingDotActive: { backgroundColor: colors.primary },
  loadingNote: {
    color: colors.muted,
    fontSize: 11,
    textAlign: "center",
    lineHeight: 16,
    marginTop: 4,
  },
  row: { flexDirection: "row", gap: 12 },
  upload: {
    backgroundColor: "#F0F6FC",
    borderRadius: 17,
    padding: 17,
    marginBottom: 22,
  },
  uploadHeading: { flexDirection: "row", alignItems: "center", gap: 9 },
  uploadTitle: { color: colors.primary, fontWeight: "700", fontSize: 14 },
  uploadText: {
    color: "#7B92A7",
    fontSize: 11,
    lineHeight: 19,
    marginTop: 9,
    marginBottom: 16,
  },
  sampleText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  preview: { width: "100%", height: 150, borderRadius: 12, marginBottom: 15 },
  source: {
    fontSize: 11,
    lineHeight: 18,
    color: colors.primary,
    marginBottom: 18,
    backgroundColor: "#EAF4FD",
    padding: 12,
    borderRadius: 10,
  },
  chips: { flexDirection: "row", gap: 7, flexWrap: "wrap", marginBottom: 20 },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: -6,
    marginBottom: 20,
  },
  rateNote: { flex: 1, fontSize: 10, lineHeight: 16, color: colors.muted },
  rateNoteFailed: { color: "#C05A57" },
  itemsHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  itemsTitle: { color: colors.ink, fontSize: 15, fontWeight: "700" },
  itemsNote: { fontSize: 10, color: colors.muted },
  itemCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 15,
    padding: 15,
    marginBottom: 12,
  },
  itemNumberRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  itemNumber: {
    color: "#8BA2B7",
    letterSpacing: 1,
    fontSize: 9,
    fontWeight: "700",
  },
  sumLink: { color: colors.primary, fontSize: 11, fontWeight: "600" },
  totalNote: {
    fontSize: 10,
    color: colors.muted,
    lineHeight: 17,
    marginTop: 8,
  },
  consent: {
    backgroundColor: "#F3F7FA",
    borderRadius: 16,
    padding: 17,
    marginVertical: 22,
  },
  consentTitle: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  consentText: {
    color: "#8096A9",
    fontSize: 10,
    lineHeight: 18,
    marginTop: 12,
  },
  error: {
    fontSize: 12,
    lineHeight: 20,
    padding: 12,
    borderRadius: 10,
    color: "#B05445",
    backgroundColor: "#FFF1ED",
    marginBottom: 16,
  },
});
