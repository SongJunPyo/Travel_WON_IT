import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Sheet, Field, Button, colors } from "./ui";
import { validDate, parseMoney } from "../domain.mjs";
import type { TravelState } from "../types";

export function TripSettings({
  trip,
  onClose,
  onSave,
  onClear,
}: {
  trip: TravelState["trip"];
  onClose: () => void;
  onSave: (trip: TravelState["trip"]) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState(trip),
    [budget, setBudget] = useState(String(trip.budget)),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  function save() {
    try {
      if (!draft.city.trim()) throw new Error("여행 도시를 입력해 주세요.");
      if (
        !validDate(draft.start) ||
        !validDate(draft.end) ||
        draft.end < draft.start
      )
        throw new Error("여행 기간을 확인해 주세요.");
      onSave({
        ...draft,
        city: draft.city.trim(),
        budget: parseMoney(budget, "KRW"),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력값을 확인해 주세요.");
    }
  }
  return (
    <Sheet
      visible
      title="나의 여행 설정"
      subtitle="이번 여행에 맞게 예산과 기간을 정해요"
      onClose={onClose}
    >
      <Field
        label="여행 도시"
        value={draft.city}
        onChangeText={(city) => setDraft({ ...draft, city })}
        testID="trip-city"
      />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Field
          label="여행 시작일"
          value={draft.start}
          onChangeText={(start) => setDraft({ ...draft, start })}
          placeholder="YYYY-MM-DD"
        />
        <Field
          label="여행 종료일"
          value={draft.end}
          onChangeText={(end) => setDraft({ ...draft, end })}
          placeholder="YYYY-MM-DD"
        />
      </View>
      <Field
        label="전체 여행 예산 (원)"
        value={budget}
        onChangeText={setBudget}
        keyboardType="number-pad"
        testID="trip-budget"
      />
      <Text style={s.note}>
        원화 환산에는 각 영수증에 입력한 환율을 사용해요. 시연 환율 1 EUR =
        1,600원은 실시간 환율이 아니에요.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      <Button
        title="여행 설정 저장"
        icon="check"
        onPress={save}
        testID="save-settings"
      />
      <View style={s.divider} />
      <Text style={s.demoTitle}>나의 기록으로 시작하기</Text>
      <Text style={s.note}>
        시연 영수증만 삭제하고 직접 기록을 시작할 수 있어요. 직접 등록한
        영수증과 예산은 유지돼요.
      </Text>
      <Button
        title={confirm ? "시연 영수증을 삭제할게요" : "시연 영수증 지우기"}
        variant="outline"
        icon="trash"
        onPress={() => {
          if (confirm) onClear();
          else setConfirm(true);
        }}
        testID="clear-demo"
      />
    </Sheet>
  );
}
const s = StyleSheet.create({
  note: { fontSize: 11, color: colors.muted, lineHeight: 20, marginBottom: 20 },
  error: { fontSize: 12, color: "#B05445", marginBottom: 15 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 25 },
  demoTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 9,
  },
});
