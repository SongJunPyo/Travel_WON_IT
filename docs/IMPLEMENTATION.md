# 개발·검증 기록

기준: `docs/sub_SPEC.md`. 기존 `my-hackathon`은 서비스 이름·색상·아이콘과 UI 흐름만 참고했고 수정하지 않았습니다.

## 적용한 개편

1. 기존 네 페이지를 가계부와 주변 가격 비교 두 탭으로 축소했습니다.
2. 영수증 입력을 가계부에 통합하고 상품별 이름·수량·개당 가격을 저장합니다.
3. 카메라·사진 선택을 실제 OCR API에 연결하고, 저장 전에 인식 결과를 수정합니다.
4. 영수증 상품명·용량을 정규화하고 공유에 동의한 상품만 공개 가격 저장소에 연결합니다.
5. 현재 위치·매장 좌표로 반경과 거리를 계산하고, 최신 구매기록을 가격순으로 표시합니다.
6. 가상 평균 비교·소비 비중 요약·예산 관리와 기기 저장을 제공합니다.

챗봇·ATM·환급·별도의 나의 여행 페이지는 포함하지 않았습니다. 환급 관련 상태도 새 데이터 모델에 넣지 않았습니다.

## 검증 범위

| 항목                      | 결과                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm test`                | 모바일 계산·상품 정규화·공유 동의·공개 필드 제한 14개 통과                                                              |
| `./gradlew test`          | JUnit 5 API·JPA·H2·OCR 구조화 출력 테스트 14개 통과                                                                     |
| `npm run typecheck`       | TypeScript 검사 통과                                                                                                    |
| `npm run build:web`       | 웹 번들 생성 성공                                                                                                       |
| iOS·Android `expo export` | 두 플랫폼 Hermes 번들 생성 성공                                                                                         |
| `expo-doctor`             | 20개 검사 통과                                                                                                          |
| Chrome 사용자 흐름        | 35개 통과: 예산, 등록·중복 방지·수정·삭제·복원, 검색·위치 유지, 공유·철회, 사진 선택·결과 검토, 320·390·768px 화면 검증 |

실제 영수증 이미지의 OCR 정확도와 과금되는 외부 API 호출은 검증하지 않았습니다. `.env`가 비어 있어 실제 키 대신 테스트 응답을 사용했습니다. 실제 기기의 카메라·앨범·위치 권한과 서명된 설치 파일은 실기기에서 별도로 확인해야 합니다. 이 환경에는 Xcode가 설치되어 있지 않아 iOS 시뮬레이터는 실행하지 않았습니다.

브라우저 검증은 실제 Java 서버·JPA·테스트용 H2를 사용합니다. 사진은 실제 입력 흐름으로 선택하고, OpenAI 네트워크 종단만 로컬 대체 응답으로 연결해 서버 요청 형식까지 확인했습니다. 참고 저장소의 로컬 체크아웃(`/Users/programming/ITStudy/05_springAI`, origin `https://github.com/WONIT-A/05_springAI.git`)에서 기술 구성과 관련 소스를 확인했습니다.

`npm audit`에서는 Expo CLI가 사용하는 Zod 3의 의존성 경로에 high 3건(원인 1건)이 보고됩니다. 런타임의 가계부·API는 Zod를 사용하지 않습니다. Expo CLI의 요구 범위를 벗어나는 강제 메이저 변경은 적용하지 않았으며, Expo의 호환 패치로 해소할 항목입니다.

## 보존한 파일

- `AGENTS.md`, `.agents/skills/`, `skills-lock.json`, 명세 원본은 수정하지 않았습니다.
- 기존 `.env`를 변경하지 않았으며, Git에서 제외했습니다.
- `img/여행푸딩_투명ver.png`를 변경하지 않았습니다. 앱에서 사용하는 `assets/travel-pudding.png`는 원본과 SHA-256이 같습니다.
- 기존 `my-hackathon`의 파일을 변경하지 않았습니다.

## 변경·추가 파일

- 모바일 앱: `App.tsx`, `index.ts`, `app.config.ts`, `src/screens/`, `src/components/`, `src/api.ts`, `src/types.ts`, `src/domain.mjs`, `assets/travel-pudding.png`
- Java 서버: `build.gradle`, `settings.gradle`, `gradlew`, `gradlew.bat`, `gradle/wrapper/`, `src/main/java/`, `src/main/resources/application.properties`
- 검증: `src/test/java/`, `tests/domain.test.mjs`, `scripts/browser-check.mjs`, `docs/screenshots/`
- 실행·문서: `package.json`, `package-lock.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`, `SPEC.md`, `docs/IMPLEMENTATION.md`

보호 파일은 **안 고침**. 작업 중 사용자가 추가한 `AGENTS.md`의 변경은 그대로 보존했습니다.

## 운영 전 남은 작업

- 실제 기기에서 촬영·권한·복귀·네트워크 재연결 확인
- 실제 영수증별 OCR·할인·세금 처리 정확도 확인
- 운영용 인증·DB·삭제 정책 및 HTTPS·네트워크 배포 구성
- 실제 이용자 데이터로 도시·기간별 평균을 산출할 충분한 표본 확보
- iOS·Android 서명·앱 배포 구성
