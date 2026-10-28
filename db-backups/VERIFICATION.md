# 보관본 확인 기록 · 2026-10-28

대상은 저장소의 확정 4개 테이블 스키마와 가데이터입니다. DB 접속 정보가 담긴 `.env`는 읽거나 복사하지 않았고, 실제 DB에 연결하거나 SQL을 실행하지 않았습니다.

- 프로젝트 안: `db-backups/snapshots/2026-10-28-four-tables/`
- 프로젝트 밖: `../travel_WONIT-db-backups/2026-10-28-four-tables/`
- 내용: 기기 300건, 여행 300건, 영수증 8,152건, 품목 17,262건, 스키마·설계·재적재 SQL·생성 코드·설정·체크섬

| 확인 | 결과 |
| --- | --- |
| `node --test tests/db-snapshot.test.mjs` | 신규 7개 통과·실패 0개 |
| `npm test` | 전체 23개 통과·실패 0개 |
| `npm run db:verify -- db-backups/snapshots/2026-10-28-four-tables` | 파일 SHA-256·행 수·관계·합계·재적재 SQL 일치 |
| 바깥 사본의 스크립트로 바깥 사본 검증 | 동일 검증 통과, 원 프로젝트 스크립트 없이 실행 가능 |
| `git diff --check` | 이번 변경의 공백 오류 없음 |

복원 SQL은 UTF-8 16진수 텍스트, NULL, 정수 금액, 소수 환율을 보존하도록 생성했으며 삭제·기존 데이터 비우기·외래키 검사 해제 구문을 생성하지 않습니다. **실제 MySQL의 빈 DB에 복원하는 과정은 실행하지 않았습니다.**

`server:mysql:safe`는 Hibernate DDL 검증과 SQL 자동 초기화 비활성화를 실행 인자로 지정한 명령입니다. 이 명령으로 실제 공용 DB에 서버를 연결하는 검증은 실행하지 않았습니다. DB 계정 권한도 변경하지 않았습니다.

## 이번 변경 파일

- `scripts/db-snapshot.mjs`, `tests/db-snapshot.test.mjs`: 보관·검증 도구와 테스트
- `db-backups/`: 기준 보관본, 복구·실행 안내, 읽기 전용 구조 점검 SQL, 이 기록
- `package.json`: `db:snapshot`, `db:verify`, `server:mysql:safe` 명령 추가
- `README.md`: 보관·복구 안내 링크 추가
- 프로젝트 바깥 `travel_WONIT-db-backups/`: 동일 보관본과 독립 사용 안내

보호 파일(`AGENTS.md`, `.agents/skills/`, `skills-lock.json`)은 **안 고침**. 원본 스키마와 가데이터 CSV도 변경하지 않았습니다. 작업 도중 앱·Java 코드에 생긴 다른 변경은 건드리지 않았습니다.
