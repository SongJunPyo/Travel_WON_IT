# travel_WONIT 구현 검토 결과

- 검토일: 2026-10-27
- 검토 대상: `travel_WONIT` 전체 (Expo 모바일 앱 + Java 서버). 이전 프로젝트인 `my-hackathon`은 검토하지 않았습니다.
- 검토 기준
  1. 2026-10-27에 정리한 서비스 요구사항 (1장)
  2. AGENTS.md가 지정한 참고 저장소 [WONIT-A/05_springAI](https://github.com/WONIT-A/05_springAI.git)의 구조 (4장)
- 변경 사항: 코드는 고치지 않았고 이 문서만 추가했습니다. `SPEC.md`는 승인된 명세이므로 수정하지 않았습니다.

## 요약

현재 코드는 `docs/sub_SPEC.md`의 **위치 기반 주변 상품 가격 비교**를 기준으로 만들어졌습니다. 그 기준에서는 완성도가 높고 기존 테스트 28개가 모두 통과합니다. 하지만 이번 요구사항과는 PAGE 2의 성격이 다릅니다. 이번 요구사항의 PAGE 2는 **카테고리 탐색과 AI 상품 추천**입니다.

| #   | 요구사항                                                         | 판정                                                 |
| --- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| R1  | 기능 2개를 화면 2개로 구성                                       | 충족                                                 |
| R2  | 좌우 스와이프로 화면 전환                                        | **미구현**                                           |
| R3  | PAGE 1 홈 = 가계부 (`img/image (1).png` 참고)                    | 부분 충족                                            |
| R4  | 영수증 OCR로 거래 데이터 적재                                    | 부분 충족 (기기에 저장하고, 동의한 일부만 서버 적재) |
| R5  | 첫 사용자 빈 화면                                                | 보류 (사용자 요청)                                   |
| R6  | PAGE 2 구조 = 검색창 + 카테고리 둘러보기 (참고 스크린샷)         | 부분 충족 (검색창만 있음)                            |
| R7  | "도리토스" 검색 → 다른 사용자의 해당 상품 지출 (언제·어디서·얼마) | 부분 충족 (조건이 많음)                              |
| R8  | 검색 없이 카테고리 선택 → 해당 카테고리 거래 목록                | **미구현**                                           |
| R9  | 수집 데이터 기반 AI 상품 추천                                    | **미구현**                                           |
| A   | 05_springAI 구조(3-tier) 준수                                    | 대체로 준수. 개선이 필요한 차이 9건                  |

**핵심 차이 3가지**

1. **PAGE 2의 목적이 다릅니다.** 현재 PAGE 2는 지도·반경 3km 기반의 가격 비교 화면입니다. 카테고리 탐색과 AI 추천은 없습니다.
2. **서버 데이터로는 새 기능을 만들 수 없습니다.** 서버의 공유 테이블(`shared_prices`)에는 카테고리 칸이 없습니다. 공유 동의를 하고 매장 주소와 위치까지 확인한 영수증의 상품만 저장됩니다.
3. **검색을 서버가 아니라 앱이 합니다.** `GET /prices`가 전체 기록을 내려 주면, 앱이 상품명·통화·거리로 걸러 냅니다. 3-tier 구조에 맞추려면 검색 조건을 서버 API로 옮겨야 합니다.

---

## 1. 검토 기준: 이번 요구사항

| 구분            | 내용                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| 서비스          | ① 영수증 OCR 기반 가계부 작성 ② 사용자 가계부 데이터 기반, 카테고리별 AI 상품 추천                           |
| 화면            | 기능 1개당 화면 1개, 총 2개. 좌우 스와이프로 전환                                                            |
| PAGE 1 (홈)     | `img/image (1).png`처럼 사용자의 가계부 기록 표시                                                            |
| 첫 사용자       | 거래 기록이 없는 경우는 이후에 보완 (이번 검토에서 제외)                                                     |
| PAGE 2 구조     | `img/스크린샷 2026-10-27 오후 6.21.39.png` 참고: 큰 제목 "검색", 검색창, "카테고리 둘러보기" 2열 타일 그리드 |
| PAGE 2 카테고리 | 식당, 명소, 화장품, 의류, 뷰티·웰니스, 숙박, 액티비티, 렌트 등                                               |
| PAGE 2 검색     | 다른 사용자가 영수증으로 적재한 데이터 중 검색한 상품의 지출만 표시: 구매일, 매장, 가격                      |
| PAGE 2 카테고리 | 검색 없이 카테고리를 고르면 그 카테고리의 거래 목록 표시                                                     |
| AI              | 서비스가 모은 데이터를 바탕으로 AI가 상품을 추천                                                             |

## 2. 현재 구현 개요

| 영역   | 기술                                           | 주요 파일                                                                                               |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 앱     | Expo 58, React Native 0.88, React 19.3, TS 6.0 | [App.tsx](../App.tsx), [Ledger.tsx](../src/screens/Ledger.tsx), [Compare.tsx](../src/screens/Compare.tsx), [domain.mjs](../src/domain.mjs), [api.ts](../src/api.ts) |
| 서버   | Java 21, Spring Boot 4.1.1, Spring AI 2.0.1    | [TravelController.java](../src/main/java/com/wonit/travel/api/TravelController.java), [OcrService.java](../src/main/java/com/wonit/travel/ocr/OcrService.java), [PriceService.java](../src/main/java/com/wonit/travel/price/PriceService.java) |
| 저장소 | 앱: AsyncStorage / 서버: JPA + H2 파일 DB      | [PriceEntity.java](../src/main/java/com/wonit/travel/price/PriceEntity.java), [PriceRepository.java](../src/main/java/com/wonit/travel/price/PriceRepository.java) |

**데이터 흐름**

```text
[PAGE 1 가계부] ── 사진(base64) ──▶ POST /ocr ─▶ OcrService ─▶ OpenAiReceiptGateway ─▶ OpenAI Responses API
      │
      ├─ 영수증 전체 ─▶ AsyncStorage (이 기기에만 저장)
      │
      └─ 조건을 모두 갖춘 영수증의 상품만 ─▶ PUT /prices ─▶ PriceService ─▶ shared_prices (H2 파일 DB)
         (공유 동의 + 시연 아님 + 매장 주소 + 매장 위치 확인)

[PAGE 2 가격 비교] ◀── GET /prices (전체 기록) ── 앱에서 상품명·통화·반경 3km로 거르고 매장별 최신가 1건 표시
```

---

## 3. 요구사항별 검토

### R1. 기능 2개, 화면 2개 — 충족

- 탭이 두 개입니다: `ledger`(여행 가계부), `compare`(주변 가격 비교). [App.tsx:41](../App.tsx#L41), [App.tsx:297](../App.tsx#L297)
- 챗봇·ATM·환급 등 다른 페이지는 없습니다.
- 단, 두 번째 화면의 기능은 R6–R9의 요구와 다릅니다.

### R2. 좌우 스와이프 전환 — 미구현

- 하단 탭 버튼(`Pressable`)을 눌러야만 화면이 바뀝니다. [App.tsx:293-330](../App.tsx#L293-L330)
- 두 화면은 하나의 세로 `ScrollView` 안에서 `display: none`으로 바뀌어 보일 뿐입니다. [App.tsx:259](../App.tsx#L259), [App.tsx:274](../App.tsx#L274)
- 코드 전체에 `PanResponder`, `pagingEnabled`, 제스처 처리가 없습니다.
- PAGE 2는 처음 방문할 때 만들어집니다(`visitedCompare`). 스와이프로 바꾸면 옆 화면이 미리 보여야 하므로 이 방식도 바꿔야 합니다.

**보완 방향**

- React Native 기본 컴포넌트(`ScrollView horizontal pagingEnabled` 또는 `PanResponder`)로 만들 수 있어 새 라이브러리가 필요 없습니다.
- `react-native-pager-view`, `react-native-gesture-handler`를 쓰려면 AGENTS.md에 따라 먼저 승인을 받아야 합니다.
- 가계부의 카테고리 필터 칩은 이미 가로로 스크롤됩니다. [Ledger.tsx:263-277](../src/screens/Ledger.tsx#L263-L277) 이 스크롤이 화면 스와이프와 충돌하지 않게 처리해야 합니다.
- 웹에서는 마우스로 스와이프하기 어려우므로 하단 탭도 함께 유지하는 것을 권장합니다.

### R3. PAGE 1 홈 = 가계부 (참고 이미지) — 부분 충족

| 참고 이미지 요소                                                                                  | 현재 구현                                                                                                         | 판정                    |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 제목 "AI 여행 가계부"와 설명 문구                                                                 | "MY TRAVEL NOTE / 여행의 순간을, 차곡차곡." [Ledger.tsx:48-50](../src/screens/Ledger.tsx#L48-L50)                 | 문구 다름               |
| 여행 기간 카드 (파리 여행 2026.10.10 - 2026.10.27)                                                | "파리 여행 10.24 – 10.30" 줄. 누르면 설정 시트 [Ledger.tsx:53-69](../src/screens/Ledger.tsx#L53-L69)              | 충족 (연도 생략)        |
| 도넛 차트, 가운데 총액 "665,117 KRW"                                                               | 도넛 차트, 가운데 "67만원" [Ledger.tsx:142-186](../src/screens/Ledger.tsx#L142-L186)                              | 부분: 만원 단위로 반올림 |
| 범례: 6개 카테고리별 비율                                                                         | 6개 카테고리별 비율 [Ledger.tsx:187-198](../src/screens/Ledger.tsx#L187-L198)                                     | 충족                    |
| "평균과 비교해보면" 표가 항상 보이고 ▲/▼ 배지 표시                                                 | 버튼을 눌러야 펼쳐지는 표. 배지 없이 글자색만 다름 [Ledger.tsx:200-243](../src/screens/Ledger.tsx#L200-L243)      | 부분                    |
| 여행 예산 사용률 카드: 막대, 사용·남은·전체 예산, 사용한 금액·남은 금액 상자                        | 파란 카드 안의 예산, 사용률, 막대, 남은 금액 [Ledger.tsx:70-120](../src/screens/Ledger.tsx#L70-L120)              | 충족 (배치 다름)        |
| 나의 영수증: "총 5개", 행마다 매장·구매일·"1개 영수증 합산"·카테고리·상태 배지·외화 금액·× 삭제 | 개수 배지, 카테고리 필터, 행마다 매장·월.일·카테고리·원화와 외화 금액. 눌러야 상세·삭제 [Ledger.tsx:256-323](../src/screens/Ledger.tsx#L256-L323) | 부분                    |
| 상태 배지(기한 만료·해당 없음·세관 확인 필요)와 상태 기준일                                      | 없음. sub_SPEC에서 환급 기능을 빼면서 함께 제외                                                                   | 의도적 제외 (재확인 필요) |
| 넓은 화면의 2열 배치 (도넛 \| 평균 비교)                                                          | 모바일 1열. 넓은 웹 화면에서는 왼쪽 소개와 오른쪽 휴대폰 틀 [App.tsx:179-214](../App.tsx#L179-L214)               | 다름                    |

참고 이미지에 없지만 구현에 있는 요소도 있습니다: 영수증 스캔 카드, 카테고리 필터 칩, "나의 소비 인사이트". 인사이트는 AI가 아니라 비율 기반 규칙 문장이며, 화면에도 "비율 기반 요약"이라고 표시됩니다. [domain.mjs:144-150](../src/domain.mjs#L144-L150)

### R4. 영수증 OCR로 거래 데이터 적재 — 부분 충족

**동작하는 부분**

- 사진 선택·촬영 → `POST /ocr` → 매장·구매일·통화·카테고리·상품별 이름·수량·단가 추출 → 사용자 수정 → 저장 흐름이 있습니다. ([ReceiptEditor.tsx](../src/components/ReceiptEditor.tsx), [OcrService.java](../src/main/java/com/wonit/travel/ocr/OcrService.java))
- 키가 없거나 인식에 실패하면 이유를 보여 주고 직접 입력할 수 있습니다.

**요구사항과 다른 부분**

- 가계부는 **기기의 AsyncStorage에만** 저장됩니다. [App.tsx:98-108](../App.tsx#L98-L108)
- 서버에는 아래 조건을 **모두** 갖춘 영수증의 상품만 올라갑니다. [domain.mjs:202-225](../src/domain.mjs#L202-L225)
  - 공유 동의 (기본값은 꺼짐)
  - 시연 영수증이 아님
  - 매장 주소 입력
  - 매장에 있을 때 위치 확인
- 그래서 PAGE 2가 쓸 수 있는 "다른 사용자의 가계부 데이터"가 매우 적습니다.
- 서버 기록에는 **카테고리와 수량이 없습니다.** [PriceRecord.java](../src/main/java/com/wonit/travel/price/PriceRecord.java)
- 현재 `.env`에 `OPENAI_API_KEY`가 없습니다. 이 상태에서 사진 분석을 요청하면 서버가 503(키 미설정)을 반환합니다.

### R5. 첫 사용자 — 보류

요청에 따라 이번 검토에서 제외했습니다. 참고로 현재는 처음 실행할 때 시연 영수증 6건을 자동으로 넣습니다. [App.tsx:38](../App.tsx#L38), [domain.mjs:227](../src/domain.mjs#L227) 기록이 없을 때의 빈 화면 문구는 이미 있습니다. [Ledger.tsx:318-321](../src/screens/Ledger.tsx#L318-L321)

### R6. PAGE 2 구조 (참고 스크린샷) — 부분 충족

| 참고 스크린샷 요소                 | 현재 구현                                                                                                   | 판정      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------- |
| 큰 제목 "검색"                     | "같은 상품, 더 좋은 가격."                                                                                  | 문구 다름 |
| 검색창                             | 검색창과 검색 버튼 [Compare.tsx:105-127](../src/screens/Compare.tsx#L105-L127)                              | 충족      |
| "카테고리 둘러보기" 2열 타일 그리드 | 없음. 대신 빠른 검색 링크 2개(코카콜라, 에비앙) [Compare.tsx:128-139](../src/screens/Compare.tsx#L128-L139) | **미구현** |
| (스크린샷에 없음)                  | 통화 선택 칩, 위치 줄, OpenStreetMap 지도, 매장 카드 목록                                                   | 추가 요소 |

### R7. "도리토스" 검색 — 부분 충족

[`comparePrices`](../src/domain.mjs#L162-L201)의 실제 동작을 따라가 보면, "도리토스"를 검색해 다른 사용자의 기록이 보이려면 아래 조건이 모두 맞아야 합니다.

| #   | 조건·제약                                                                                                                                                                                                                         | 근거                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1   | 처음에는 **시연 모드**입니다. 시연 데이터는 코카콜라·에비앙 6건뿐이라 "도리토스"를 검색하면 항상 빈 결과가 나옵니다.                                                                                                             | [Compare.tsx:36](../src/screens/Compare.tsx#L36), [domain.mjs:268-310](../src/domain.mjs#L268-L310)        |
| 2   | 실제 공유 데이터는 **"내 위치" 버튼으로 위치 권한을 허용해야만** 보입니다. 위치를 거부하면 다른 사용자의 기록을 볼 방법이 없습니다.                                                                                             | [Compare.tsx:58-94](../src/screens/Compare.tsx#L58-L94)                                                    |
| 3   | **반경 3km 안**이면서 **선택한 통화와 같은** 기록만 보입니다. 다른 도시나 다른 통화로 산 기록은 빠집니다.                                                                                                                        | [domain.mjs:173-179](../src/domain.mjs#L173-L179)                                                          |
| 4   | 같은 매장·주소·상품·통화는 **가장 최근 기록 1건만** 보입니다. 같은 상품을 언제 얼마에 샀는지의 이력은 볼 수 없습니다.                                                                                                            | [domain.mjs:180-196](../src/domain.mjs#L180-L196)                                                          |
| 5   | 상품명 정규화는 코카콜라, 에비앙, 리터→ml 변환만 지원합니다. 해외 영수증에 찍힌 "DORITOS NACHO 150G"는 "도리토스"로 검색되지 않습니다. 그램(g) 용량 정규화도 없습니다.                                                          | [domain.mjs:56-65](../src/domain.mjs#L56-L65), [OpenAiReceiptGateway.java:38-39](../src/main/java/com/wonit/travel/ocr/OpenAiReceiptGateway.java#L38-L39) |
| 6   | 서버 응답에 소유자 구분이 없어서 내 기록도 함께 보입니다. "다른 사용자의 기록"만 보는 기능은 아닙니다.                                                                                                                            | [PriceEntity.java:33-36](../src/main/java/com/wonit/travel/price/PriceEntity.java#L33-L36)                 |
| 7   | 검색은 앱에서 합니다. `GET /prices`가 최대 30,000건을 한 번에 내려 줍니다.                                                                                                                                                         | [PriceService.java:24](../src/main/java/com/wonit/travel/price/PriceService.java#L24), [TravelController.java:28](../src/main/java/com/wonit/travel/api/TravelController.java#L28) |

**충족하는 부분:** 결과가 있을 때는 매장명, 상품명, 구매일, 가격, 거리, 지도 링크가 표시됩니다. 즉 "언제·어디서·얼마"는 보여 줍니다. [Compare.tsx:234-317](../src/screens/Compare.tsx#L234-L317)

### R8. 카테고리 선택 → 거래 목록 — 미구현

- PAGE 2에 카테고리를 고르는 화면 요소가 없습니다.
- 서버 공유 기록에 카테고리 칸이 없습니다. [PriceRecord.java](../src/main/java/com/wonit/travel/price/PriceRecord.java), [PriceEntity.java](../src/main/java/com/wonit/travel/price/PriceEntity.java)
- 앱이 서버로 보내는 공유 기록에도 카테고리가 없습니다. [domain.mjs:210-224](../src/domain.mjs#L210-L224)
- **카테고리 체계가 서로 맞지 않습니다.** 가계부와 OCR은 6개 카테고리를 영수증 단위로 씁니다. [domain.mjs:1-8](../src/domain.mjs#L1-L8), [OcrService.java:12](../src/main/java/com/wonit/travel/ocr/OcrService.java#L12)

| 요구 카테고리 (PAGE 2) | 현재 가계부 카테고리에서 대응 | 구분 가능 여부 |
| ---------------------- | ----------------------------- | -------------- |
| 식당                   | 음식                          | 가능           |
| 명소                   | 관광                          | 가능           |
| 화장품                 | 쇼핑                          | 불가           |
| 의류                   | 쇼핑                          | 불가           |
| 뷰티·웰니스            | 쇼핑·관광·기타 중 하나        | 불가           |
| 숙박                   | 숙박                          | 가능           |
| 액티비티               | 관광                          | 불가           |
| 렌트                   | 교통                          | 불가           |
| (해당 없음)            | 교통(대중교통), 기타          | -              |

→ **결정이 필요합니다.** 영수증 하나에 화장품과 의류가 섞일 수 있으므로 상품 단위 카테고리가 자연스럽습니다. 반면 숙박·렌트·명소·액티비티는 상품보다 매장·서비스 단위에 가깝습니다. 가계부 차트(6개)와 PAGE 2 카테고리(8개 이상)를 따로 둘지도 정해야 합니다.

### R9. AI 상품 추천 — 미구현

- 앱과 서버 어디에도 추천 로직이나 API가 없습니다.
- AI는 OCR 한 곳에서만 씁니다.
- 참고 저장소에 그대로 쓸 수 있는 패턴이 있습니다. "숫자는 DB가 계산하고, 문장은 AI가 만든다"는 방식입니다. `ReportService`가 집계하고, `BankTools`를 도구로 넘기고, `ChatClient`가 답을 만듭니다. AI가 실패하면 대체 응답을 돌려줍니다. 추천도 같은 구조로 만들 수 있습니다. 예를 들어 DB가 카테고리별로 많이 산 상품과 가격 분포를 집계하고, AI는 추천 문장과 순서만 만듭니다.

---

## 4. 05_springAI 구조(3-tier) 준수 검토

**참고 기준:** 원격 `main`의 `56a979b`. 2026-10-27에 `git ls-remote`로 원격 최신 커밋과 같은지 확인했습니다. 로컬 체크아웃(`/Users/programming/ITStudy/05_springAI`)은 학습용 브랜치 `my-day4-1`이고, `main`과는 CORS, 보안 설정, 프런트 API 주소 3개 파일만 다릅니다. 이 3개 파일은 `main` 기준으로 다시 확인했습니다.

### 4.1 참고 저장소 구조

```text
src/main/java/com/example/wonit/
  controller/   REST 컨트롤러 (리소스별: Account, Transaction, Report, Ai ...)
  service/      업무 로직과 @Transactional
  repository/   JpaRepository, 파생 쿼리와 JPQL (예: searchByCategoryOrMemo, spendingByCategory)
  model/        @Entity
  dto/          record + from() 변환
  common/       GlobalExceptionHandler(ErrorResponse code·message), WebConfig(CORS /api/**)
  exception/    도메인 예외
  ai/           BankTools(도구), BankDocs(RAG)
frontend/       React 19 + Vite
  src/api/      bank.js — 모든 호출을 request() 하나로
  src/components/, src/hooks/, src/contexts/
```

### 4.2 계층별 비교

| 계층·항목    | 05_springAI                                                                                   | travel_WONIT                                                                                                     | 판정       |
| ------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| 표현         | React + Vite 웹, `frontend/`                                                                  | Expo·React Native 모바일. SPEC.md 2장에 변경 근거가 있음                                                        | 의도적 차이 |
| 표현: API 호출 | `api/bank.js`의 `request()` 하나로 모음                                                     | `src/api.ts`의 `request()` 하나로 모음                                                                           | 준수       |
| 표현: 상태   | `hooks/`, `contexts/`로 분리                                                                  | 상태·저장·동기화가 [App.tsx](../App.tsx)(532줄)에 몰려 있음                                                     | 부분       |
| 컨트롤러     | 리소스별 컨트롤러, `/api` 접두사                                                              | `TravelController` 하나에 `/health`, `/prices`, `/ocr`. 접두사 없음                                              | 부분       |
| 서비스       | 업무 로직, `@Transactional`                                                                   | `PriceService`(검증·해시·트랜잭션), `OcrService`(입력·응답 검증)                                                 | 준수       |
| 저장소       | 파생 쿼리와 JPQL로 **서버에서 검색**                                                          | `PriceRepository`에는 `deleteByOwnerHash`만 있음. 검색은 `findAll()` 후 앱에서                                   | **부분**   |
| 엔티티·DTO   | `model/` 엔티티, `dto/` record + `from()`                                                     | `PriceEntity.publicRecord()`로 허용 필드만 반환. `PriceRecord`를 요청·응답에 함께 사용                          | 대체로 준수 |
| AI           | `spring-ai-starter-model-openai` + `ChatClient`, 프로필로 제공사 전환, Tool Calling            | `spring-ai-model`의 `BeanOutputConverter`(스키마 생성)만 쓰고 OpenAI API는 `java.net.http`로 직접 호출           | **부분**   |
| 예외         | `exception/` 도메인 예외, `common/GlobalExceptionHandler`가 `{code, message}` 반환            | `api/ApiException`(상태 코드 숫자) 하나, `ApiExceptionHandler`가 `{error}` 반환                                  | 부분       |
| CORS·설정    | `/api/**`, 허용 origin 명시, 키는 환경변수                                                    | `/**`, 허용 origin을 환경변수로 받음, 키는 환경변수                                                              | 준수       |
| 데이터       | H2 메모리(+MySQL 프로필), 거래를 서버 DB에 저장                                               | H2 파일. 공유 가격만 서버 DB, 가계부는 기기에 저장                                                               | 부분       |
| 테스트       | `@SpringBootTest` + `@AutoConfigureMockMvc`, controller·service·repository·model별 테스트     | JUnit 5에 맞춰 컨텍스트를 직접 띄우는 API 테스트 12개와 출력 변환 테스트 2개. 저장소·서비스 단위 테스트는 없음 | 부분       |
| 패키지 구성  | 계층별 (controller/service/repository/...)                                                    | 기능별 (api/ocr/price)                                                                                           | 다름       |
| 버전         | Java 21, Boot 4.1.1, Spring AI BOM 2.0.1                                                       | 같음 (SPEC.md 2장에 근거 기록)                                                                                   | 준수       |

### 4.3 지키고 있는 점

- 앱 → REST 컨트롤러 → 서비스 → JPA 저장소 → H2의 3계층 분리 자체는 지켜집니다.
- 컨트롤러가 얇고, 검증과 트랜잭션은 서비스가 맡습니다. ([PriceService.replace](../src/main/java/com/wonit/travel/price/PriceService.java#L25-L37))
- 엔티티를 그대로 내보내지 않고 허용 필드만 반환합니다. 참고 저장소의 `TransactionResponse.from()`과 목적이 같습니다.
- 서버 호출을 한 함수로 모았습니다. 참고 저장소의 `bank.js`와 같은 패턴입니다.
- AI가 실패해도 서비스는 계속 동작합니다(직접 입력으로 대체). 참고 저장소에서 AI 분류가 실패하면 "기타"로 대체하는 것과 같은 원칙입니다.
- API 키를 파일에 쓰지 않고 환경변수로 읽습니다.

### 4.4 차이와 개선이 필요한 점

| #   | 중요도 | 내용                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 높음   | **검색이 앱에 있습니다.** 참고 저장소는 `/transactions/select?category=&memo=` → `TransactionService` → `TransactionRepository.searchByCategoryOrMemo`(JPQL)로 서버가 검색합니다. 새 PAGE 2의 "상품명 검색"과 "카테고리 목록"은 이 패턴과 거의 같으므로 그대로 옮기는 것을 권장합니다.                                                                                               |
| 2   | 높음   | **Spring AI 사용 방식이 다릅니다.** 참고 저장소는 `ChatClient`로 제공사를 프로필로 바꾸고 Tool Calling을 씁니다. 현재는 OpenAI API를 직접 호출해서 제공사를 바꿀 수 없습니다. [OpenAiReceiptGateway.java:52](../src/main/java/com/wonit/travel/ocr/OpenAiReceiptGateway.java#L52) AI 추천을 추가할 때 `ChatClient`로 맞추는 것을 권장합니다. `spring-ai-starter-model-openai` 추가는 새 라이브러리이므로 승인이 필요합니다. |
| 3   | 보통   | **하위 계층이 상위 계층 패키지에 의존합니다.** `PriceService`와 `OcrService`가 `api.ApiException`을 가져옵니다. [PriceService.java:3](../src/main/java/com/wonit/travel/price/PriceService.java#L3), [OcrService.java:3](../src/main/java/com/wonit/travel/ocr/OcrService.java#L3) `OcrService`는 `PriceService.CURRENCIES`도 참조합니다. 참고 저장소처럼 `exception/`에 도메인 예외를 두고 예외 처리기에서 HTTP 상태로 바꾸는 것을 권장합니다. |
| 4   | 보통   | **컨트롤러 안에 업무 로직이 있습니다.** OCR 요청 한도(IP당 시간당 20회) 계산이 `TravelController` 안에 있습니다. [TravelController.java:34-39](../src/main/java/com/wonit/travel/api/TravelController.java#L34-L39) 필터나 서비스로 옮기는 것을 권장합니다.                                                                                                                              |
| 5   | 보통   | **컨트롤러 하나가 모든 경로를 맡습니다.** 기능이 늘어나므로 OCR, 공유 기록·검색, 추천처럼 리소스별로 나누는 것을 권장합니다.                                                                                                                                                                                                                                                              |
| 6   | 보통   | **가계부가 서버 DB에 없습니다.** 참고 저장소는 거래를 서버 DB에 저장합니다. "사용자 거래 데이터 적재"를 서버 기준으로 생각했다면 데이터 계층 설계를 바꿔야 합니다. 개인정보·동의 정책과 함께 결정이 필요합니다.                                                                                                                                                                        |
| 7   | 낮음   | **API 경로와 오류 형식이 다릅니다.** 참고 저장소는 `/api/**` 접두사와 `{code, message}` 형식을 씁니다. 현재는 `/prices`, `/ocr`와 `{error}` 형식입니다.                                                                                                                                                                                                                                   |
| 8   | 낮음   | **앱 상태 관리가 한곳에 몰려 있습니다.** 저장·동기화 로직을 `hooks/`로 나누면 참고 저장소 구조에 가까워집니다.                                                                                                                                                                                                                                                                           |
| 9   | 낮음   | **계층별 테스트가 없습니다.** 참고 저장소는 controller·service·repository·model별 테스트가 있습니다. 새 검색 쿼리를 추가하면 저장소 테스트부터 두는 것을 권장합니다.                                                                                                                                                                                                                     |

**프런트엔드 기술에 대해:** AGENTS.md는 React + Vite 구성을 "참고하되 필요한 부분만 적용"하라고 합니다. 모바일 앱 요구에 따라 Expo·React Native를 고른 근거가 SPEC.md 2장에 있으므로 허용 범위 안이라고 판단했습니다.

---

## 5. 검증 실행 결과 (2026-10-27)

| 명령                               | 결과                                                         |
| ---------------------------------- | ------------------------------------------------------------ |
| `npm test`                         | 14개 통과, 0개 실패                                          |
| `npm run typecheck`                | 통과 (오류 0)                                                |
| `./gradlew test --rerun --offline` | 14개 통과 (TravelApiTest 12, ReceiptOutputTest 2), 0개 실패 |
| `npm run test:browser`             | 실행하지 않음                                                |
| `expo export`, `expo-doctor`       | 실행하지 않음                                                |

통과한 테스트는 모두 기존 sub_SPEC 기능(가격 비교, 공유 동의, OCR 형식)을 검증합니다. 새 요구사항(R2, R6–R9)을 검증하는 테스트는 아직 없습니다.

## 6. 문서 정합성

- `SPEC.md`, `README.md`, `docs/IMPLEMENTATION.md`는 모두 sub_SPEC(주변 가격 비교)을 기준으로 쓰여 있어 이번 요구사항과 맞지 않습니다. 이번 요구사항이 승인되면 `SPEC.md` 1장(요구사항)과 4장(작업 목록)을 먼저 고쳐야 합니다.
- 서비스 이름이 문서마다 다릅니다: 요구사항은 "travel_WONIT", 앱은 "여행WON해", sub_SPEC은 "TravelBack AI".
- `docs/IMPLEMENTATION.md`의 테스트 개수(JS 14개, Java 14개)는 이번 실행 결과와 같습니다.

## 7. 보완 작업 제안

### P0 — 요구사항의 핵심

1. **SPEC 확정:** PAGE 2를 "검색 + 카테고리 둘러보기 + AI 추천"으로 다시 정의합니다. 지도·반경을 유지할지, 카테고리 체계를 어떻게 할지도 함께 정합니다. (8장 질문)
2. **데이터 모델 확장:** 공유 기록에 카테고리(필요하면 수량)를 추가합니다. OCR 결과에 상품별 카테고리를 넣고, 공유 조건(위치 필수 여부)을 다시 정합니다.
3. **서버 검색 API:** 예: `GET /api/purchases?q=도리토스`, `GET /api/purchases?category=화장품`. 컨트롤러 → 서비스 → 저장소(JPQL)로 처리하고 페이지 단위로 내려 줍니다. 참고: `TransactionController.select`.
4. **PAGE 2 화면:** 큰 제목 "검색", 검색창, "카테고리 둘러보기" 2열 타일, 결과 목록(구매일·매장·가격).
5. **스와이프 전환:** React Native 기본 컴포넌트로 구현하고 하단 탭은 유지합니다.

### P1 — 품질과 차별점

6. **상품명 별칭 정규화:** "Doritos"와 "도리토스", 그램(g) 단위. OCR 프롬프트에 한글 브랜드명을 함께 적게 하거나 정규화 사전을 둡니다. 앱(`domain.mjs`)과 서버(`PriceService.normalize`)가 같은 규칙을 써야 합니다.
7. **AI 추천 API:** DB가 카테고리별 인기 상품과 가격 분포를 집계하고, AI(`ChatClient`)는 추천 문장과 순서를 만듭니다. AI가 실패하면 집계 결과만 보여 줍니다.
8. **PAGE 1을 참고 이미지에 맞추기:** 제목 문구, 평균 비교 표 상시 노출과 ▲/▼ 배지, 도넛 가운데 전체 금액, 행별 삭제 버튼.

### P2 — 구조 정리

9. 도메인 예외 패키지 분리, `/api` 접두사, 요청 한도 로직 이동, 리소스별 컨트롤러, 계층별 테스트.
10. 첫 사용자 빈 화면 (보류 항목).

**새 라이브러리:** 스와이프는 추가 없이 만들 수 있습니다. `ChatClient`를 쓰려면 `spring-ai-starter-model-openai`를 추가해야 하므로 AGENTS.md에 따라 먼저 승인을 받아야 합니다.

## 8. 결정이 필요한 질문

1. PAGE 2에 지도와 반경 3km 필터를 남길까요? 이번 요구사항에는 위치 이야기가 없습니다.
2. 카테고리는 상품 단위인가요, 영수증(매장) 단위인가요? 가계부 차트 카테고리와 PAGE 2 카테고리를 하나로 합칠까요?
3. 가계부 전체를 서버 DB에 적재할까요? 지금처럼 기기에 저장하고 동의한 상품만 공유할까요?
4. 공유 동의의 기본값과 조건(매장 주소·위치 필수 여부)은 어떻게 할까요?
5. 검색 결과에 같은 상품의 구매 이력을 모두 보여 줄까요, 매장별 최신 1건만 보여 줄까요?
6. 참고 이미지의 환급 상태 배지(기한 만료·해당 없음·세관 확인 필요)가 필요한가요? sub_SPEC에서는 제외했습니다.

## 9. 확인하지 못한 것

- Chrome 사용자 흐름 테스트(`npm run test:browser`), iOS·Android 번들, `expo-doctor`는 이번에 다시 실행하지 않았습니다. 결과는 `docs/IMPLEMENTATION.md`의 기록뿐입니다.
- 실제 OCR 호출: `.env`에 키가 없어 확인하지 못했습니다.
- 실기기 화면과 제스처 동작.
- 참고 저장소 프런트엔드의 `hooks/`, `contexts/`는 구조만 확인했고 세부 동작은 보지 않았습니다.

---

## 10. 후속 결정과 반영 (2026-10-27)

### 10.1 결정 사항

| 항목                 | 결정                                                                   | 반영                                         |
| -------------------- | ---------------------------------------------------------------------- | -------------------------------------------- |
| 화면 전환 (R2)       | 좌우 스와이프 대신 하단 탭 유지                                        | 변경 없음. 요구사항에서 제외                 |
| 가계부 제목          | "여행 순간을 차곡차곡"                                                 | [Ledger.tsx:49](../src/screens/Ledger.tsx#L49) |
| 지도                 | Mapbox 사용, 반경 3km                                                  | Mapbox 타일 적용, 반경은 기존과 같은 3km     |
| 카테고리             | 영수증 단위                                                            | PAGE 2 카테고리 8개를 영수증 단위로 정의     |
| PAGE 2 필터          | 카테고리 안에서 가격순·구매수 등으로 조회. 거리순은 필터만 두고 구현 보류 | 가격순·구매수·최신순 구현, 거리순은 비활성   |
| DB                   | 가계부 등 적재용 DB는 나중에 설계 (접속 정보는 추후 전달)              | 변경 없음                                    |
| 상품명 검색 (R7)     | 실제 데이터가 쌓인 뒤 다시 진행                                        | 변경 없음                                    |
| 공유 동의 조건       | 보류                                                                   | 변경 없음                                    |

### 10.2 변경 내용

- **PAGE 2 카테고리 둘러보기** ([Compare.tsx](../src/screens/Compare.tsx))
  - 검색창 아래에 "카테고리 둘러보기" 2열 타일 그리드를 추가했습니다: 식당, 명소, 화장품, 의류, 뷰티·웰니스, 숙박, 액티비티, 렌트.
  - 타일을 누르면 지도와 목록이 그 카테고리의 기록으로 바뀝니다. 같은 타일을 다시 누르거나 ✕를 누르면, 또는 상품을 검색하면 기존 상품 검색 화면으로 돌아갑니다.
  - 목록은 매장·상품별로 묶어 최근 구매가격, 최근 구매일, 구매 횟수를 보여 줍니다.
  - 정렬: 가격순(기본), 구매수, 최신순. 거리순은 "준비 중"으로 비활성입니다.
  - 통화와 반경 3km 필터는 기존 상품 검색과 같습니다.
- **조회 로직** ([domain.mjs](../src/domain.mjs))
  - `browseCategory`, `BROWSE_CATEGORIES`, `BROWSE_SORTS`를 추가했습니다.
  - 매장·주소·상품·통화로 묶는 기준과 최신 기록 판단은 기존 `comparePrices`와 같은 함수를 함께 씁니다.
- **시연 데이터:** `DEMO_PURCHASES`를 추가했습니다. 카테고리마다 가상 매장 2–3곳, 모두 시연 위치 반경 3km 안입니다. 실제 공유 기록에는 아직 카테고리가 없어서 "내 위치"를 켠 실제 모드에서는 빈 화면이 나옵니다. DB 설계 때 기록에 카테고리를 넣어야 합니다.
- **Mapbox 지도** ([PriceMap.tsx](../src/components/PriceMap.tsx))
  - `EXPO_PUBLIC_MAPBOX_TOKEN`이 있으면 Mapbox `streets-v12` 타일을, 없으면 기존 OpenStreetMap 타일을 씁니다.
  - 저작권 표시는 "© Mapbox © OpenStreetMap"입니다.
  - 토큰은 `.env`에만 저장했습니다. `.env`는 Git에서 제외됩니다. `.env.example`에는 키 이름만 넣었습니다.
- **공통 UI** ([ui.tsx](../src/components/ui.tsx)): `Chip`에 비활성 상태를 추가하고, 카테고리 아이콘 5개(landmark, shirt, leaf, mountain, car)를 추가했습니다.
- **문서:** `SPEC.md`(요구사항·지도·테스트·작업 목록), `README.md`(구현 범위·지도·환경변수)를 고쳤습니다.

### 10.3 검증

| 명령·방법                                    | 결과                                                                                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm test`                                   | 18개 통과(기존 14 + 카테고리 4), 0개 실패                                                                                                              |
| `npm run typecheck`                          | 통과                                                                                                                                                   |
| `./gradlew test --rerun --offline`           | 14개 통과, 0개 실패 (Java 코드 변경 없음)                                                                                                              |
| `npm run build:web`                          | 성공. 번들에 Mapbox 타일 주소가 들어간 것을 확인                                                                                                       |
| 임시 Chrome 확인 (390px·320px, API 서버 없이) | 24개 통과: 제목 변경, 카테고리 8개, 가로 넘침 없음, 식당 3곳 가격순, 구매수·최신순 정렬, 거리순 비활성, Mapbox 타일·저작권 표시, 해제 후 검색 화면 복귀, 런타임 오류 없음 |
| `npm run test:browser`                       | **실행 안 함.** 8787 포트에서 이미 서버가 실행 중이었고, 스크립트가 이 포트를 고정으로 씁니다. 카테고리 흐름 확인 6개를 스크립트에 추가해 두었습니다. |

### 10.4 iPhone 실기기 시연 (영수증 촬영 → OCR)

**지금 코드로 가능합니다.** 영수증 등록 화면에 버튼이 두 개 있습니다.

- **"촬영하기":** 앱 안에서 iPhone 카메라를 엽니다(`ImagePicker.launchCameraAsync`).
- **"사진 선택":** 카메라 앱으로 미리 찍은 사진을 사진 보관함에서 고릅니다.

사진은 서버의 `POST /ocr`로 전송됩니다. 서버가 OpenAI로 매장·구매일·상품·수량·단가를 추출하면, 사용자가 결과를 확인·수정한 뒤 저장합니다. 카메라·사진 권한 문구는 [app.config.ts](../app.config.ts)에 이미 설정돼 있습니다.

**준비할 것**

1. `.env`에 `OPENAI_API_KEY`를 직접 넣고 `npm run server`로 서버를 켭니다. 지금은 키가 없어 503이 반환됩니다.
2. iPhone이 서버에 접속할 수 있어야 합니다. 둘 중 하나를 고릅니다.
   - **같은 Wi-Fi:** `EXPO_PUBLIC_API_URL=http://<Mac의 LAN IP>:8787`. macOS 방화벽에서 Java의 연결 수신을 허용해야 합니다.
   - **HTTPS 주소:** 서버를 배포하거나 터널링 도구를 씁니다. 셀룰러에서도 동작하고 iOS 보안 정책(ATS) 문제를 피할 수 있습니다. 터널링 도구는 새 도구이므로 승인이 필요합니다.
3. 설치 방법을 고릅니다.

| 방법                             | 준비                                                     | 특징                                                                                          |
| -------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Expo Go                          | 무료. App Store에서 Expo Go 설치(SDK 58 지원 버전)        | 가장 빠릅니다. `npm start` 후 QR을 스캔합니다. 아이콘은 Expo Go이고, Mac의 개발 서버가 켜져 있어야 합니다. |
| EAS Build 내부 배포 (ad hoc)     | Apple Developer Program(유료), `eas-cli`(새 도구, 승인 필요) | "여행WON해" 아이콘의 독립 앱으로 설치됩니다. 시연할 기기의 UDID를 등록해야 합니다.              |
| TestFlight                       | Apple Developer Program, App Store Connect 등록           | 링크로 여러 기기에 설치할 수 있습니다. 외부 테스터에게 배포하려면 베타 심사가 필요합니다.       |

**주의할 점**

- **독립 앱의 HTTP 접속:** 평문 HTTP 주소는 iOS 보안 정책에 막힐 수 있습니다. HTTPS 주소를 권장합니다. LAN 주소를 쓰려면 `app.config.ts`에 예외 설정이 필요합니다. LAN 주소에 처음 접속할 때 iOS가 "로컬 네트워크" 권한을 묻습니다.
- **사진 크기:** 서버 한도는 약 6MB입니다. 앱 안 카메라로 찍은 사진은 보통 이 범위 안입니다. 하지만 카메라 앱에서 24MP·48MP로 찍은 사진을 "사진 선택"으로 고르면 한도를 넘을 수 있습니다. 실기기에서 확인이 필요하며, 넘으면 사진 크기 줄이기 기능(새 라이브러리)을 검토합니다.
- **OCR 위치:** 지금처럼 서버에서 AI로 추출하는 방식이면 기기 쪽 추가 작업이 필요 없습니다. iPhone 자체 OCR(Apple Vision)을 쓰려면 네이티브 모듈과 개발 빌드가 필요하므로 권장하지 않습니다.

### 10.5 남은 일

- 거리순 정렬 (현재 위치 연동 후)
- 앱을 새 API로 전환. DB 설계·생성과 서버 전환은 끝났습니다([db-design.md](db-design.md)).
- `npm run test:browser`는 이전 API(`PUT /prices`)를 기준으로 짜여 있어, 앱 전환 때 함께 고칩니다.
- 상품명 검색(도리토스)을 실제 데이터로 확인
- 실기기 시연 방식 결정과 빌드 설정
- 포트를 비운 상태에서 `npm run test:browser` 실행, 화면 캡처(`docs/screenshots/`) 갱신
