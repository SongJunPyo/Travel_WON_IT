import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Sheet, Field, Button, Chip, Label, colors } from "./ui";
import { validDate, parseMoney } from "../domain.mjs";
import type { TravelState } from "../types";

type Trip = TravelState["trip"];
const countries = ["대한민국", "일본", "미국", "프랑스", "태국", "베트남"];

function TripForm({ trip, onSave, initial = false }: {
  trip: Trip;
  onSave: (trip: Trip) => void;
  initial?: boolean;
}) {
  const [draft, setDraft] = useState(trip);
  const [budget, setBudget] = useState(trip.budget ? String(trip.budget) : "");
  const [error, setError] = useState("");

  function save() {
    try {
      if (!draft.country?.trim()) throw new Error("여행 국가를 선택하거나 입력해 주세요.");
      if (!draft.city.trim()) throw new Error("여행 도시를 입력해 주세요.");
      if (!validDate(draft.start) || !validDate(draft.end) || draft.end < draft.start)
        throw new Error("여행 기간을 YYYY-MM-DD 형식으로 확인해 주세요.");
      onSave({ ...draft, country: draft.country.trim(), city: draft.city.trim(), budget: parseMoney(budget, "KRW") });
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력값을 확인해 주세요.");
    }
  }

  return (
    <>
      <Label>여행 국가</Label>
      <View style={s.countries}>
        {countries.map((country) => (
          <Chip key={country} title={country} active={draft.country === country}
            onPress={() => setDraft({ ...draft, country })} testID={`country-${country}`} />
        ))}
      </View>
      <Field label="국가 직접 입력" value={draft.country || ""}
        onChangeText={(country) => setDraft({ ...draft, country })}
        placeholder="목록에서 선택하거나 직접 입력" testID="trip-country" />
      <Field label="여행 도시" value={draft.city}
        onChangeText={(city) => setDraft({ ...draft, city })}
        placeholder="예: 도쿄" testID="trip-city" />
      <View style={s.dateRow}>
        <Field label="여행 시작일" value={draft.start}
          onChangeText={(start) => setDraft({ ...draft, start })}
          placeholder="YYYY-MM-DD" testID="trip-start" />
        <Field label="여행 종료일" value={draft.end}
          onChangeText={(end) => setDraft({ ...draft, end })}
          placeholder="YYYY-MM-DD" testID="trip-end" />
      </View>
      <Field label="전체 여행 예산 (원)" value={budget} onChangeText={setBudget}
        keyboardType="number-pad" placeholder="예: 1000000" testID="trip-budget" />
      <Text style={s.note}>이번 여행에서 기록할 지출의 총예산을 입력해 주세요.</Text>
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      <Button title={initial ? "여행 시작하기" : "여행 설정 저장"}
        icon={initial ? "arrow" : "check"} onPress={save} testID="save-settings" />
    </>
  );
}

export function TripSetup({ trip, onSave }: { trip: Trip; onSave: (trip: Trip) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={s.setupOuter} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.setupScroll, { paddingTop: Math.max(insets.top, 24), paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={s.setupCard}>
          <View style={s.brandRow}>
            <Image source={require("../../assets/travel-pudding.png")} style={s.mascot} resizeMode="contain" />
            <Text style={s.brand}>여행<Text style={{ color: colors.primary }}>WON</Text>해</Text>
          </View>
          <Text style={s.eyebrow}>YOUR JOURNEY STARTS HERE</Text>
          <Text style={s.title}>어디로 떠나시나요?</Text>
          <Text style={s.description}>여행 정보를 입력하고 나만의 여행 가계부를 시작해요. 설정은 언제든 바꿀 수 있어요.</Text>
          <TripForm trip={trip} onSave={onSave} initial />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function TripSettings({ trip, onClose, onSave, onClear }: {
  trip: Trip;
  onClose: () => void;
  onSave: (trip: Trip) => void;
  onClear: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Sheet visible title="나의 여행 설정" subtitle="이번 여행에 맞게 예산과 기간을 정해요" onClose={onClose}>
      <TripForm trip={trip} onSave={onSave} />
      <View style={s.divider} />
      <Text style={s.demoTitle}>나의 기록으로 시작하기</Text>
      <Text style={s.note}>시연 영수증만 삭제하고 직접 기록을 시작할 수 있어요. 직접 등록한 영수증과 예산은 유지돼요.</Text>
      <Button title={confirm ? "시연 영수증을 삭제할게요" : "시연 영수증 지우기"}
        variant="outline" icon="trash" onPress={() => confirm ? onClear() : setConfirm(true)} testID="clear-demo" />
    </Sheet>
  );
}

const s = StyleSheet.create({
  setupOuter: { flex: 1, backgroundColor: colors.bg },
  setupScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  setupCard: { width: "100%", maxWidth: 500, backgroundColor: "#fff", borderRadius: 26, padding: 24, borderWidth: 1, borderColor: colors.line },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 24 },
  mascot: { width: 34, height: 40 },
  brand: { fontSize: 20, fontWeight: "800", color: colors.ink },
  eyebrow: { fontSize: 10, color: colors.primary, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  title: { fontSize: 25, fontWeight: "800", color: colors.ink, marginBottom: 8 },
  description: { fontSize: 13, color: colors.muted, lineHeight: 21, marginBottom: 25 },
  countries: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 12 },
  dateRow: { flexDirection: "row", gap: 12 },
  note: { fontSize: 11, color: colors.muted, lineHeight: 20, marginBottom: 20 },
  error: { fontSize: 12, color: "#B05445", marginBottom: 15 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 25 },
  demoTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", marginBottom: 9 },
});
