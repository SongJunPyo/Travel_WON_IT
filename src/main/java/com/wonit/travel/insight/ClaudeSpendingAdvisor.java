package com.wonit.travel.insight;

import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import com.wonit.travel.ai.StructuredClaude;
import java.time.Duration;
import java.util.Map;
import org.springframework.ai.chat.client.ChatClient;

/** Spring AI ChatClient로 Claude에게 서버가 계산한 숫자만 써서 소비 인사이트 문장을 쓰게 합니다. 8초 제한·동시 2건(StructuredClaude). */
public class ClaudeSpendingAdvisor implements SpendingAdvisor {

    private static final String INSTRUCTION = """
            You write a short spending insight for a Korean traveller in a travel budget app.
            Below are facts computed by the server, as JSON: from the traveller's own ledger and, when available,
            from other travellers who already finished a trip to the same city with the same currency.
            Fields (any value may be null):
            - trip: city, days (trip length), elapsedDays (days passed, including today), remainingDays, progressPct.
            - budget: budget, spent, usedPct, projectedTotal (spending at the current pace until the end of the trip),
              projectedPct (projectedTotal as % of budget), safeDailyBudget (budget left per remaining day), overBudget.
            - dailyAverage: mine and peersMedian.
            - categories: name, minePct, peersPct, diffPp (minePct - peersPct in percentage points).
            - peers: count, description of the comparison group, medianBudgetUsedPct. null when there are too few travellers.
            Task: write in natural, friendly Korean (해요체):
            - headline: the single most important finding, at most 30 characters.
            - body: two sentences, at most 120 characters, about the budget pace and the category that differs most
              from other travellers (or the largest category when peers is null).
            - tip: one concrete suggestion for the rest of the trip, at most 60 characters, or null if there is nothing useful.
            Rules:
            - Use only numbers that appear in the facts, written as given (e.g. "983,343원", "70%"). Do not calculate,
              round or convert to new numbers, and do not write dates.
            - Never invent prices, places, exchange rates or anything about other travellers that is not in the facts.
            - If peers is null, do not compare with other travellers.
            - Do not blame the traveller. Help them enjoy the trip within budget.
            """;

    private final StructuredClaude claude;

    /** 키가 없으면 AI를 부르지 않고, 인사이트는 규칙 기반 문장만 씁니다. */
    public ClaudeSpendingAdvisor(ChatClient.Builder builder, String apiKey) {
        this.claude = new StructuredClaude(builder, apiKey, Duration.ofSeconds(8), "spending-advisor");
    }

    @Override
    public boolean configured() { return claude.configured(); }

    @Override
    public Advice advise(Map<String, Object> facts) {
        AdviceFields fields = claude.ask(INSTRUCTION, facts, AdviceFields.class);
        return new Advice(fields.headline(), fields.body(), fields.tip());
    }

    /** 모델이 채울 JSON 구조 */
    record AdviceFields(
            @JsonPropertyDescription("The key finding in Korean, at most 30 characters") String headline,
            @JsonPropertyDescription("Two Korean sentences, at most 120 characters") String body,
            @JsonPropertyDescription("One concrete Korean suggestion, at most 60 characters, or null") String tip) {}
}
