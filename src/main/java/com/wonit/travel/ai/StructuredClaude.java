package com.wonit.travel.ai;

import java.time.Duration;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.converter.BeanOutputConverter;
import tools.jackson.databind.json.JsonMapper;

/**
 * 화면이 기다리는 짧은 AI 호출(추천순 재정렬, 소비 인사이트)의 공통 부분입니다.
 * 지시문 + 입력 JSON + 응답 JSON 스키마로 Claude를 부르고, 응답을 record로 바꿉니다.
 * 정해진 시간 안에 답이 없으면 포기하고, 동시에 2건(대기 4건)까지만 부릅니다. 넘치면 바로 실패로 돌려
 * 호출한 쪽이 AI 없이 만든 결과를 쓰게 합니다.
 */
public class StructuredClaude {

    private final ChatClient chatClient;
    private final Duration timeout;
    private final String name;
    private final JsonMapper json = JsonMapper.builder().build();
    private final ExecutorService pool;

    /** 키가 없으면 ChatClient를 만들지 않습니다(configured() == false). */
    public StructuredClaude(ChatClient.Builder builder, String apiKey, Duration timeout, String name) {
        this.chatClient = apiKey == null || apiKey.isBlank() ? null : builder.build();
        this.timeout = timeout;
        this.name = name;
        this.pool = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(4),
                task -> { Thread t = new Thread(task, name); t.setDaemon(true); return t; });
    }

    public boolean configured() { return chatClient != null; }

    /** 실패(키 없음·대기열 가득·시간 초과·응답 형식 오류)하면 IllegalStateException을 던집니다. */
    public <T> T ask(String instruction, Object input, Class<T> type) {
        if (chatClient == null) throw new IllegalStateException(name + ": 키 없음");
        Future<T> call;
        try {
            call = pool.submit(() -> call(instruction, input, type));
        } catch (RuntimeException e) {
            throw new IllegalStateException(name + ": 호출 대기열 가득");
        }
        try {
            return call.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (TimeoutException e) {
            call.cancel(true);
            throw new IllegalStateException(name + ": 시간 초과");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(name + ": 중단");
        } catch (ExecutionException e) {
            throw new IllegalStateException(name + ": 실패 " + e.getCause());
        }
    }

    private <T> T call(String instruction, Object input, Class<T> type) {
        BeanOutputConverter<T> converter = new BeanOutputConverter<>(type);
        ChatResponse response = chatClient.prompt()
                .user(instruction + "\n" + json.writeValueAsString(input) + "\n" + converter.getFormat())
                .call()
                .chatResponse();
        T value = converter.convert(lastText(response));
        if (value == null) throw new IllegalStateException("응답이 비어 있음");
        return value;
    }

    /** 응답 첫 블록이 빈 thinking일 수 있어 .entity() 대신 글이 든 마지막 블록을 고릅니다. 영수증 인식도 이 방식을 씁니다. */
    public static String lastText(ChatResponse response) {
        return response.getResults().stream()
                .map(generation -> generation.getOutput().getText())
                .filter(text -> text != null && !text.isBlank())
                .reduce((first, last) -> last)
                .orElseThrow(() -> new IllegalStateException("응답에 글이 없음"));
    }
}
