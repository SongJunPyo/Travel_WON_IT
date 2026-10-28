import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
  Share,
} from "react-native";
import Svg, { Circle } from "react-native-svg";
import {
  CATEGORIES,
  ledgerCsv,
  ledgerCsvName,
  summarize,
  spendingInsight,
  insightRequest,
  won,
  money,
  toWon,
  storeLabel,
  tripReady,
} from "../domain.mjs";
import { colors, Icon, Chip, Empty } from "../components/ui";
import { fetchInsight } from "../api";
import type { Insight, Receipt, TravelState } from "../types";

export function Ledger({
  state,
  deviceToken,
  onAdd,
  onSettings,
  onReceipt,
}: {
  state: TravelState;
  // 기기 저장소를 읽은 뒤에 채워집니다. 그 전에는 소비 인사이트를 요청하지 않습니다.
  deviceToken: string;
  onAdd: () => void;
  onSettings: () => void;
  onReceipt: (r: Receipt) => void;
}) {
  const [filter, setFilter] = useState("전체"),
    [comparison, setComparison] = useState(false);
  const summary = summarize(state.receipts, state.trip.budget);
  // 소비 인사이트: 가계부 요약이 바뀌면 잠시 기다렸다가 서버에 분석을 요청합니다.
  // 서버에 연결하지 못하면 기기 안의 규칙 기반 문장(spendingInsight)을 보여 줍니다.
  // 여행(도시·국가·기간)을 정하기 전에는 서버가 분석하지 않으므로 요청하지 않습니다.
  const [insight, setInsight] = useState<Insight | null>(null),
    [insightLoading, setInsightLoading] = useState(false);
  const ready = tripReady(state.trip);
  const insightKey = JSON.stringify(insightRequest(state));
  useEffect(() => {
    if (!deviceToken || !ready) {
      setInsight(null);
      setInsightLoading(false);
      return;
    }
    let active = true;
    setInsightLoading(true);
    const timer = setTimeout(() => {
      fetchInsight(JSON.parse(insightKey), deviceToken)
        .then((result) => {
          if (active) setInsight(result);
        })
        .catch(() => {
          if (active) setInsight(null);
        })
        .finally(() => {
          if (active) setInsightLoading(false);
        });
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [insightKey, deviceToken, ready]);
  const [exportMessage, setExportMessage] = useState("");
  // 가계부 CSV 내보내기: 웹은 파일로 내려받고, 앱은 공유 시트로 보냅니다(새 라이브러리 없이 RN Share 사용).
  async function exportCsv() {
    const today = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
    }).format(new Date());
    const csv = ledgerCsv(state),
      name = ledgerCsvName(state.trip, today);
    try {
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(
          new Blob([csv], { type: "text/csv;charset=utf-8" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = name;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        await Share.share({ title: name, message: csv });
      }
      setExportMessage(`${name} 파일로 내보냈어요.`);
    } catch {
      setExportMessage("내보내지 못했어요. 다시 시도해 주세요.");
    }
  }
  const filtered = state.receipts
    .filter((r) => filter === "전체" || r.category === filter)
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        b.recordedAt.localeCompare(a.recordedAt),
    );
  let cursor = 0;
  return (
    <View style={s.content}>
      <View style={s.pageHeading}>
        <View>
          <Text style={s.eyebrow}>MY TRAVEL NOTE</Text>
          <Text style={s.title}>여행 순간을 차곡차곡</Text>
          <Text style={s.subtitle}>기록은 가볍게, 여행은 더 즐겁게</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="여행 및 예산 설정"
        onPress={onSettings}
        testID="trip-settings"
        style={s.trip}
      >
        <View style={s.tripIcon}>
          <Icon name="globe" size={18} color={colors.primary} />
        </View>
        <Text style={s.tripCity}>
          {tripReady(state.trip)
            ? `${state.trip.city} 여행`
            : "첫 영수증을 올리면 여행이 정해져요"}
        </Text>
        {tripReady(state.trip) && (
          <Text style={s.tripDate}>
            {state.trip.start.slice(5).replace("-", ".")} –{" "}
            {state.trip.end.slice(5).replace("-", ".")}
          </Text>
        )}
        <Icon name="down" size={15} color={colors.muted} />
      </Pressable>
      <View style={s.hero}>
        <View style={s.heroTop}>
          <View style={s.whitePill}>
            <View style={s.liveDot} />
            <Text style={s.whitePillText}>나의 여행 지출</Text>
          </View>
          <Pressable
            accessibilityLabel="예산 수정"
            onPress={onSettings}
            style={{ padding: 6 }}
          >
            <Icon name="edit" color="#D2E9FA" size={17} />
          </Pressable>
        </View>
        <Text style={s.total} testID="total-spent">
          {summary.total.toLocaleString("ko-KR")}
          <Text style={s.totalUnit}> 원</Text>
        </Text>
        <Text style={s.heroCaption}>소중한 경험으로 채워가는 여행</Text>
        <Image
          source={require("../../assets/travel-pudding.png")}
          style={s.mascot}
          resizeMode="contain"
          accessibilityLabel="여행푸딩 마스코트"
        />
        <View style={s.budget}>
          <View style={s.budgetLabels}>
            <Text style={s.budgetText}>
              {state.trip.budget
                ? `예산 ${won(state.trip.budget)}`
                : "예산 미설정"}
            </Text>
            <Text style={s.budgetPercent}>
              {state.trip.budget ? `${summary.percent.toFixed(1)}% 사용` : ""}
            </Text>
          </View>
          <View style={s.progressTrack}>
            <View
              style={[
                s.progress,
                {
                  width: `${Math.min(100, summary.percent)}%`,
                  backgroundColor:
                    state.trip.budget && summary.remaining < 0
                      ? "#FFBF99"
                      : "#A8DEFF",
                },
              ]}
            />
          </View>
          <Text style={s.remaining}>
            {!state.trip.budget
              ? "여행 설정에서 예산을 정하면 남은 금액을 보여 드려요."
              : summary.remaining < 0
                ? `예산을 ${won(-summary.remaining)} 초과했어요`
                : `앞으로 ${won(summary.remaining)} 더 사용할 수 있어요`}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onAdd}
        testID="add-receipt"
        style={({ pressed }) => [s.scanCard, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={s.scanIcon}>
          <Icon name="scan" color={colors.primary} size={25} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.scanTitle}>영수증 한 장으로, 기록 끝!</Text>
          <Text style={s.scanText}>AI가 상품부터 금액까지 정리해요</Text>
        </View>
        <View style={s.scanArrow}>
          <Icon name="plus" color={colors.primary} size={20} />
        </View>
      </Pressable>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>어디에 사용했을까요?</Text>
        <Text style={s.smallCaption}>카테고리별 소비</Text>
      </View>
      <View style={s.card}>
        <View style={s.chartRow}>
          <View style={s.donut}>
            <Svg width={148} height={148} viewBox="0 0 148 148">
              <Circle
                cx={74}
                cy={74}
                r={59}
                stroke="#EEF3F8"
                strokeWidth={17}
                fill="none"
              />
              {summary.categories
                .filter((c) => c.amount > 0)
                .map((c) => {
                  const part = (c.ratio / 100) * 370.708,
                    offset = -cursor;
                  cursor += part;
                  return (
                    <Circle
                      key={c.name}
                      cx={74}
                      cy={74}
                      r={59}
                      stroke={c.color}
                      strokeWidth={17}
                      fill="none"
                      strokeDasharray={`${Math.max(0, part - 3)} ${370.708 - Math.max(0, part - 3)}`}
                      strokeDashoffset={offset}
                      transform="rotate(-90 74 74)"
                    />
                  );
                })}
            </Svg>
            <View style={s.donutCenter}>
              <Text style={s.donutLabel}>총 지출</Text>
              <Text style={s.donutValue}>
                {summary.total
                  ? Math.round(summary.total / 10000).toLocaleString()
                  : "0"}
                <Text style={{ fontSize: 13 }}>만원</Text>
              </Text>
            </View>
          </View>
          <View style={s.legend}>
            {summary.categories.map((c) => (
              <View key={c.name} style={s.legendRow}>
                <View style={[s.dot, { backgroundColor: c.color }]} />
                <Text style={s.legendName}>{c.name}</Text>
                <Text style={s.legendPercent}>
                  {Math.round(c.ratio)}
                  <Text style={{ fontSize: 10, color: colors.muted }}>%</Text>
                </Text>
              </View>
            ))}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: comparison }}
          onPress={() => setComparison(!comparison)}
          testID="toggle-comparison"
          style={s.compareButton}
        >
          <Icon name="wallet" size={17} color={colors.primary} />
          <Text style={s.compareButtonText}>다른 여행자의 소비와 비교하기</Text>
          <Icon
            name={comparison ? "close" : "chevron"}
            color={colors.primary}
            size={16}
          />
        </Pressable>
        {comparison && (
          <View testID="comparison-table" style={s.comparison}>
            <Text style={s.comparisonNotice}>
              시연 평균 · 같은 도시·여행 기간을 가정한 가상 데이터
            </Text>
            <View style={s.tableRow}>
              <Text style={[s.tableText, { flex: 1.2 }]}>카테고리</Text>
              <Text style={s.tableText}>나</Text>
              <Text style={s.tableText}>시연 평균</Text>
              <Text style={s.tableText}>차이</Text>
            </View>
            {summary.categories.map((c) => (
              <View key={c.name} style={s.tableRow}>
                <Text style={[s.tableValue, { flex: 1.2 }]}>{c.name}</Text>
                <Text style={s.tableValue}>{Math.round(c.ratio)}%</Text>
                <Text style={s.tableValue}>{c.average}%</Text>
                <Text
                  style={[
                    s.tableValue,
                    { color: c.delta > 0 ? colors.primary : colors.muted },
                  ]}
                >
                  {c.delta > 0 ? "+" : ""}
                  {Math.round(c.delta)}%p
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={s.insight} testID="insight-card">
        <View style={s.insightHeading}>
          <Icon name="sparkles" color={colors.primary} size={17} />
          <Text style={s.insightTitle}>나의 소비 인사이트</Text>
          <Text style={[s.ruleBadge, insight?.ai && s.aiBadge]}>
            {insightLoading
              ? "분석 중"
              : insight
                ? insight.ai
                  ? "AI 분석"
                  : "데이터 요약"
                : "비율 기반 요약"}
          </Text>
        </View>
        {insight ? (
          <>
            <Text style={s.insightHeadline}>{insight.headline}</Text>
            <Text style={s.insightText}>{insight.body}</Text>
            {insight.tip ? (
              <View style={s.insightTip}>
                <Icon name="info" color={colors.primary} size={14} />
                <Text style={s.insightTipText}>{insight.tip}</Text>
              </View>
            ) : null}
            {insight.facts.length ? (
              <View style={s.insightFacts} testID="insight-facts">
                {insight.facts.map((fact) => (
                  <Text key={fact} style={s.insightFact}>
                    {fact}
                  </Text>
                ))}
              </View>
            ) : null}
            {insight.facts.length ? (
              <Text style={s.insightNote}>
                {insight.basis
                  ? `비교 기준: ${insight.basis}의 영수증${insight.sampleData ? " (시연 가데이터 포함)" : ""}.`
                  : "비교할 여행자 기록이 아직 적어 내 가계부만으로 분석했어요."}
                {insight.ai ? " 문장은 AI가 위 숫자만으로 썼어요." : ""}
              </Text>
            ) : null}
          </>
        ) : (
          <>
            <Text style={s.insightText}>{spendingInsight(summary)}</Text>
            <Text style={s.insightNote}>
              비교 기준은 가상 평균이에요. 실제 여행자 통계가 아니에요.
            </Text>
          </>
        )}
      </View>
      <View style={s.sectionHead}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Text style={s.sectionTitle}>나의 영수증</Text>
          <Text style={s.count}>{state.receipts.length}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={s.smallCaption}>최근 구매일 순</Text>
          {state.receipts.length ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="가계부 CSV로 내보내기"
              onPress={() => {
                void exportCsv();
              }}
              testID="export-csv"
              style={s.csvButton}
            >
              <Text style={s.csvButtonText}>CSV 내보내기</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {exportMessage ? (
        <Text style={s.exportMessage} testID="export-message">
          {exportMessage}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 15, marginHorizontal: -24 }}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 7 }}
      >
        {["전체", ...CATEGORIES.map((c) => c.name)].map((name) => (
          <Chip
            key={name}
            title={name}
            active={filter === name}
            onPress={() => setFilter(name)}
          />
        ))}
      </ScrollView>
      <View style={s.receipts}>
        {filtered.length ? (
          filtered.map((r) => {
            const cat = CATEGORIES.find((c) => c.name === r.category)!;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                accessibilityLabel={`${storeLabel(r)} 영수증 상세`}
                onPress={() => onReceipt(r)}
                style={s.receiptRow}
                testID={`receipt-${r.id}`}
              >
                <View
                  style={[s.receiptIcon, { backgroundColor: cat.color + "16" }]}
                >
                  <Icon name={cat.icon} color={cat.color} size={21} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={s.store}>
                    {storeLabel(r)}
                  </Text>
                  <Text style={s.receiptMeta}>
                    {r.date.slice(5).replace("-", ".")} · {r.category}
                    {r.demo ? "  ·  시연" : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 5 }}>
                  <Text style={s.receiptPrice}>
                    {won(toWon(r.totalMinor, r.currency, r.rate))}
                  </Text>
                  <Text style={s.foreign}>
                    {money(r.totalMinor, r.currency)}
                  </Text>
                </View>
                <Icon name="chevron" size={14} color="#B6C4D1" />
              </Pressable>
            );
          })
        ) : (
          <Empty
            title="아직 기록이 없어요"
            detail="영수증을 추가해 여행의 첫 소비를 기록해 보세요."
          />
        )}
      </View>
      <View style={s.footer}>
        <Icon name="info" size={12} color={colors.muted} />
        <Text style={s.footerText}>
          {state.receipts.some((r) => r.demo) ? "시연 기록이 포함돼요. " : ""}
          적용 환율은 직접 수정할 수 있어요.
        </Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  content: { padding: 24, paddingTop: 14, paddingBottom: 28 },
  pageHeading: { marginBottom: 20 },
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
  subtitle: { fontSize: 12, color: colors.muted, marginTop: 8 },
  trip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 18,
  },
  tripIcon: { padding: 5, backgroundColor: "#E5F0FA", borderRadius: 8 },
  tripCity: { fontSize: 13, fontWeight: "700", color: colors.ink },
  tripDate: { marginLeft: "auto", fontSize: 11, color: colors.muted },
  hero: {
    borderRadius: 23,
    backgroundColor: colors.primary,
    padding: 22,
    overflow: "hidden",
    minHeight: 235,
    boxShadow: "0px 8px 22px #0067AC18",
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  whitePill: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 5, height: 5, backgroundColor: "#A5DFFF", borderRadius: 4 },
  whitePillText: { color: "#D4EDFF", fontSize: 12, fontWeight: "500" },
  total: {
    fontSize: 35,
    letterSpacing: -1.2,
    fontWeight: "800",
    color: "#fff",
    marginTop: 12,
    zIndex: 1,
  },
  totalUnit: { fontSize: 20, fontWeight: "500" },
  heroCaption: { color: "#BCDEEF", fontSize: 10, marginTop: 6, zIndex: 1 },
  mascot: {
    width: 98,
    height: 121,
    position: "absolute",
    top: 38,
    right: 4,
    transform: [{ rotate: "6deg" }],
    opacity: 0.94,
  },
  budget: {
    marginTop: 25,
    borderTopWidth: 1,
    borderTopColor: "#FFFFFF25",
    paddingTop: 15,
  },
  budgetLabels: { flexDirection: "row", justifyContent: "space-between" },
  budgetText: { fontSize: 10, color: "#CAE5F7" },
  budgetPercent: { fontSize: 10, color: "#fff", fontWeight: "600" },
  progressTrack: {
    height: 5,
    backgroundColor: "#FFFFFF25",
    borderRadius: 6,
    marginTop: 10,
    overflow: "hidden",
  },
  progress: { height: 5, borderRadius: 6 },
  remaining: { marginTop: 9, fontSize: 10, color: "#CAE5F7" },
  scanCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#DDEAF6",
    borderRadius: 18,
    padding: 15,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    marginTop: 14,
  },
  scanIcon: { backgroundColor: "#EAF4FD", padding: 10, borderRadius: 13 },
  scanTitle: {
    fontWeight: "700",
    color: colors.ink,
    fontSize: 13,
    letterSpacing: -0.4,
  },
  scanText: { fontSize: 10, color: colors.muted, marginTop: 5 },
  scanArrow: { padding: 6 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 28,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    letterSpacing: -0.6,
  },
  smallCaption: { color: colors.muted, fontSize: 10 },
  csvButton: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "#fff",
  },
  csvButtonText: { color: colors.primary, fontSize: 10, fontWeight: "700" },
  exportMessage: {
    color: colors.muted,
    fontSize: 10,
    marginTop: -6,
    marginBottom: 10,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 21,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    justifyContent: "center",
  },
  donut: { width: 148, height: 148 },
  donutCenter: {
    position: "absolute",
    inset: 0,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  donutLabel: { fontSize: 10, color: colors.muted },
  donutValue: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  legend: { flex: 1, maxWidth: 150, gap: 12 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 3 },
  legendName: { fontSize: 11, color: "#536C80", flex: 1 },
  legendPercent: { color: colors.ink, fontSize: 12, fontWeight: "700" },
  compareButton: {
    marginTop: 20,
    backgroundColor: "#F0F6FC",
    padding: 13,
    borderRadius: 11,
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
  },
  compareButtonText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "600",
    flex: 1,
  },
  comparison: { marginTop: 15 },
  comparisonNotice: {
    fontSize: 10,
    lineHeight: 17,
    color: colors.muted,
    marginBottom: 10,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4F8",
  },
  tableText: {
    flex: 1,
    fontSize: 10,
    color: colors.muted,
    textAlign: "center",
  },
  tableValue: {
    flex: 1,
    fontSize: 11,
    color: colors.ink,
    textAlign: "center",
    fontWeight: "500",
  },
  insight: {
    padding: 17,
    borderRadius: 16,
    backgroundColor: "#EAF3FC",
    marginTop: 12,
  },
  insightHeading: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    marginBottom: 10,
  },
  insightTitle: { fontSize: 12, color: colors.primary, fontWeight: "700" },
  ruleBadge: { marginLeft: "auto", color: "#7995AD", fontSize: 8 },
  aiBadge: {
    color: "#fff",
    backgroundColor: colors.primary,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: "700",
  },
  insightHeadline: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.ink,
    marginBottom: 6,
  },
  insightText: { fontSize: 12, lineHeight: 21, color: "#43657F" },
  insightTip: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  insightTipText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: colors.primary,
    fontWeight: "600",
  },
  insightFacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 10,
  },
  insightFact: {
    fontSize: 9,
    color: "#5E7B92",
    backgroundColor: "#DCEBF8",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  insightNote: { fontSize: 9, color: "#8098AD", marginTop: 8, lineHeight: 15 },
  count: {
    backgroundColor: "#E6EFF8",
    color: colors.primary,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: "700",
  },
  receipts: {
    backgroundColor: "#fff",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 15,
    overflow: "hidden",
  },
  receiptRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0F4F8",
  },
  receiptIcon: { padding: 11, borderRadius: 13 },
  store: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  receiptMeta: { color: colors.muted, fontSize: 9, marginTop: 7 },
  receiptPrice: { fontSize: 13, fontWeight: "700", color: colors.ink },
  foreign: { color: colors.muted, fontSize: 10 },
  footer: { marginTop: 20, flexDirection: "row", alignItems: "center", gap: 5 },
  footerText: { fontSize: 9, color: colors.muted, flex: 1, lineHeight: 15 },
});
