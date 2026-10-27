package com.wonit.travel.rate;

import com.wonit.travel.api.DomainException;
import com.wonit.travel.api.ErrorCode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.json.JsonMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class ExchangeRateServiceTest {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final LocalDate TUESDAY = LocalDate.of(2026, 10, 27);
    // 2026-10-27 실제 응답에서 앱이 쓰는 통화만 남긴 것 (쉼표·JPY(100) 형식 그대로)
    private static final String PUBLISHED = """
            [{"result":1,"cur_unit":"EUR","deal_bas_r":"1,477.87","cur_nm":"유로"},
             {"result":1,"cur_unit":"JPY(100)","deal_bas_r":"839.83","cur_nm":"일본 옌"},
             {"result":1,"cur_unit":"THB","deal_bas_r":"39.16","cur_nm":"태국 바트"},
             {"result":1,"cur_unit":"USD","deal_bas_r":"1,322.6","cur_nm":"미국 달러"}]""";

    @Mock RateSource source;
    private final MutableClock clock = new MutableClock(at(TUESDAY, 23));

    private ExchangeRateService service() { return new ExchangeRateService(source, JsonMapper.builder().build(), clock); }
    private static Instant at(LocalDate day, int hour) { return LocalDateTime.of(day, LocalTime.of(hour, 0)).atZone(SEOUL).toInstant(); }
    private static void unavailable(Runnable call) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(DomainException.class,
                e -> assertThat(e.errorCode()).isEqualTo(ErrorCode.RATE_UNAVAILABLE));
    }

    @Test void 쉼표를_지우고_엔화는_100엔_고시를_1엔당_원화로_바꾼다() {
        given(source.fetch(TUESDAY)).willReturn(PUBLISHED);
        var rates = service();
        assertThat(rates.krwPer("EUR").rate()).isEqualByComparingTo("1477.87");
        assertThat(rates.krwPer("USD").rate()).isEqualByComparingTo("1322.6");
        assertThat(rates.krwPer("THB").rate()).isEqualByComparingTo("39.16");
        var jpy = rates.krwPer("JPY");
        assertThat(jpy.rate()).isEqualByComparingTo("8.3983");
        assertThat(jpy.date()).isEqualTo("2026-10-27");
        assertThat(jpy.source()).isEqualTo("한국수출입은행 매매기준율");
    }
    @Test void 고시가_없는_주말에는_가장_최근_고시일_값과_그_기준일을_준다() {
        LocalDate sunday = LocalDate.of(2026, 10, 25);
        clock.set(at(sunday, 15));
        given(source.fetch(sunday)).willReturn("[]");
        given(source.fetch(sunday.minusDays(1))).willReturn("[]");
        given(source.fetch(sunday.minusDays(2))).willReturn(PUBLISHED);
        var eur = service().krwPer("EUR");
        assertThat(eur.date()).isEqualTo("2026-10-23");
        assertThat(eur.rate()).isEqualByComparingTo("1477.87");
    }
    @Test void 고시일_응답은_캐시해_다시_부르지_않는다() {
        given(source.fetch(TUESDAY)).willReturn(PUBLISHED);
        var rates = service();
        rates.krwPer("EUR");
        rates.krwPer("JPY");
        rates.krwPer("EUR");
        verify(source, times(1)).fetch(any());
    }
    @Test void 오늘_고시_전_빈_응답이면_전날_값을_쓰고_10분_뒤에_오늘을_다시_조회한다() {
        clock.set(at(TUESDAY, 9));
        given(source.fetch(TUESDAY)).willReturn("[]", PUBLISHED);
        given(source.fetch(TUESDAY.minusDays(1))).willReturn(PUBLISHED);
        var rates = service();
        assertThat(rates.krwPer("EUR").date()).isEqualTo("2026-10-26");
        clock.set(clock.instant().plus(Duration.ofMinutes(5)));
        assertThat(rates.krwPer("EUR").date()).isEqualTo("2026-10-26");
        verify(source, times(1)).fetch(TUESDAY);
        clock.set(clock.instant().plus(Duration.ofMinutes(10)));
        assertThat(rates.krwPer("EUR").date()).isEqualTo("2026-10-27");
        verify(source, times(2)).fetch(TUESDAY);
    }
    @Test void 원화는_API를_부르지_않고_1이다() {
        assertThat(service().krwPer("KRW").rate()).isEqualByComparingTo("1");
        verifyNoInteractions(source);
    }
    @Test void 인증키_오류처럼_result가_1이_아니거나_읽을_수_없는_응답은_RATE_UNAVAILABLE이다() {
        given(source.fetch(TUESDAY)).willReturn("[{\"result\":3,\"cur_unit\":null,\"deal_bas_r\":null}]", "<html>", "{}");
        var rates = service();
        unavailable(() -> rates.krwPer("EUR"));
        unavailable(() -> rates.krwPer("EUR"));
        unavailable(() -> rates.krwPer("EUR"));
    }
    @Test void 일주일_안에_고시가_없으면_RATE_UNAVAILABLE이다() {
        given(source.fetch(any())).willReturn("[]");
        unavailable(() -> service().krwPer("EUR"));
        verify(source, times(8)).fetch(any());
    }
    @Test void 키가_없으면_외부에_보내지_않고_RATE_UNAVAILABLE이다() {
        var noKey = new KoreaEximRateSource(" ", "https://example.invalid/never-called");
        unavailable(() -> noKey.fetch(TUESDAY));
    }

    /** 시간을 옮길 수 있는 테스트용 시계 */
    private static final class MutableClock extends Clock {
        private Instant now;
        MutableClock(Instant now) { this.now = now; }
        void set(Instant now) { this.now = now; }
        @Override public ZoneId getZone() { return SEOUL; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
