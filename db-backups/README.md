# 4개 테이블 구조와 가데이터 보관

공용 `travel_won`의 확정 구조는 `devices`, `trips`, `receipts`, `receipt_items`입니다. 테이블 정의와 재생성 가능한 가데이터를 시점별로 묶어 보관합니다. 이 폴더의 도구는 **DB에 연결하지 않고 `.env`도 읽지 않습니다.**

## 이번에 보관한 기준

[`snapshots/2026-10-28-four-tables/`](snapshots/2026-10-28-four-tables/)에 다음 자료를 고정했습니다.

| 자료                                         | 위치                                        | 용도                                  |
| -------------------------------------------- | ------------------------------------------- | ------------------------------------- |
| 확정 4테이블 SQL·설계 설명                   | `docs/`                                     | 컬럼·타입·제약조건·관계를 복원할 기준 |
| 기기 300·여행 300·영수증 8,152·품목 17,262건 | `sample-data/*.csv`                         | 가상 데이터 원본                      |
| 재적재 SQL                                   | `restore/sample-data.sql.gz`                | CSV를 별도 변환하지 않고 적재         |
| 고정 시드 생성기·당시 도메인 규칙            | `scripts/sample-data.mjs`, `src/domain.mjs` | 동일 가데이터 재생성                  |
| 당시 DB 프로필 설정                          | `src/main/resources/`                       | 기본 H2와 MySQL의 DDL 설정 비교       |
| 생성·검증 도구                               | `scripts/db-snapshot.mjs`                   | 다른 브랜치에서도 보관본 독립 검증    |
| 행 수·열 정의·SHA-256·커밋·시각              | `manifest.json`                             | 누락·변경과 자료의 기준 시점 확인     |

프로젝트 바깥에도 같은 보관본이 있습니다.

```text
98_HACKATHON/
├── travel_WONIT/db-backups/snapshots/2026-10-28-four-tables/
└── travel_WONIT-db-backups/2026-10-28-four-tables/
```

바깥 사본은 `travel_WONIT`의 브랜치 전환·정리 작업과 경로가 분리됩니다. 같은 디스크에 있으므로 디스크 장애에 대비한 원격 백업은 별도로 두세요. `.env`, 비밀번호, API 키, DB 접속 주소의 실제 값은 보관 대상에 넣지 않습니다.

## 검증·새 보관본 만들기

프로젝트 루트에서 실행합니다. 검증은 체크섬 외에도 CSV 외래키·기기당 여행 1개·구매일·상품 합계·공유 좌표·상품 정규화와 재적재 SQL의 일치를 검사합니다.

```bash
npm run db:verify -- db-backups/snapshots/2026-10-28-four-tables
npm run db:snapshot
```

`db:snapshot`은 한국 시각 이름의 새 폴더를 만들고 프로젝트 바깥에도 복사합니다. 이름을 직접 정하려면 `npm run db:snapshot -- 2026-10-29-before-merge`처럼 실행합니다. 같은 이름의 보관본을 덮어쓰지 않습니다. 기존 보관본은 그대로 두고 변경 시 새 보관본을 만드세요.

브랜치를 바꿔 검증 명령이 없어졌다면 **바깥 사본에 들어 있는 당시 스크립트**를 사용할 수 있습니다.

```bash
node ../travel_WONIT-db-backups/2026-10-28-four-tables/scripts/db-snapshot.mjs \
  verify ../travel_WONIT-db-backups/2026-10-28-four-tables
```

가데이터를 다시 생성하려면 바깥 사본의 `scripts/sample-data.mjs`를 실행합니다. 그 사본의 `sample-data/`를 갱신하므로, 별도 작업 폴더에 사본을 복사한 뒤 실행하고 기존 보관본과 체크섬을 비교하세요.

## 다른 브랜치로 공용 DB에 연결하기 전

현재 `mysql` 프로필은 `ddl-auto=none`입니다. 확인한 로컬 `origin/kde` 참조(`b19ff0c`)는 DB 환경변수로 바로 접속하고 `ddl-auto=update`를 사용하며 MySQL 전용 프로필도 없었습니다. 원격 브랜치가 이후 갱신되었는지는 별도로 확인해야 합니다. `docs/db-design.md`에는 2026-10-27 밤에 5개 테이블과 기존 테이블 컬럼이 추가되었다가 4테이블로 복원한 이력이 있습니다.

안전 실행 명령을 추가했습니다.

```bash
npm run server:mysql:safe
```

내부적으로 다음처럼 **검증만 하는 Hibernate 설정을 실행 인자로 고정**하고 Spring의 기본 SQL 파일 초기화도 끕니다.

```bash
./gradlew bootRun --args='--spring.profiles.active=mysql --spring.jpa.hibernate.ddl-auto=validate --spring.sql.init.mode=never'
```

- 엔티티가 요구하는 테이블·컬럼이 없으면 시작에 실패하며, Hibernate가 테이블을 새로 만들거나 바꾸지 않습니다.
- `validate`는 불필요한 추가 테이블을 찾아 삭제하거나 정확히 네 개만 존재하는지 검사하지는 않습니다. [check-current-schema.sql](check-current-schema.sql)로 실제 테이블 목록·열·제약조건을 비교하세요. 점검 SQL 역시 읽기 전용이며 이번 작업에서 실행하지 않았습니다.
- 다른 브랜치에 npm 명령이 없으면 실행 인자를 포함한 전체 Gradle 명령을 사용하세요. 해당 브랜치의 명시적 SQL 실행 코드·별도 마이그레이션 도구까지 이 설정이 차단하지는 않습니다.
- DB 계정에서 `CREATE`·`ALTER`·`DROP` 같은 DDL 권한을 제거하고 앱 전용 권한을 주면 DB 자체에서도 변경을 막을 수 있습니다. 현재 공용 관리자 계정의 권한은 이 작업에서 바꾸지 않았습니다.

## 복구 순서

1. 공용 DB를 사용하는 서버와 DDL 작업을 멈추고 팀원들과 복구할 시점을 정합니다.
2. 현재 DB의 전체 덤프를 먼저 별도로 확보합니다. 문제가 생겼어도 새 영수증과 변경 이력을 보존하기 위해서입니다.
3. **새 이름의 빈 복구용 DB**를 준비합니다. 이 보관본의 SQL에는 `USE`·`CREATE DATABASE`가 없으므로 실행 대상 DB를 직접 지정해야 합니다.
4. 아래 스키마와 데이터를 그 빈 DB에 순서대로 적재합니다. 공용 DB의 기존 테이블에 덮어쓰거나 테이블을 먼저 지우지 마세요.
5. 보관본 행 수, 제약조건, 영수증 합계와 PAGE2를 확인한 다음 연결 전환을 결정합니다. 실제 공용 DB 삭제·교체는 별도 작업입니다.

MySQL CLI를 사용하는 경우의 예입니다. `travel_restore` 로그인 경로와 빈 `travel_won_recovery` DB는 관리 도구에서 별도로 준비해야 합니다.

```bash
mysql --login-path=travel_restore travel_won_recovery \
  < db-backups/snapshots/2026-10-28-four-tables/docs/db-schema-mysql.sql

gzip -dc db-backups/snapshots/2026-10-28-four-tables/restore/sample-data.sql.gz \
  | mysql --login-path=travel_restore --default-character-set=utf8mb4 travel_won_recovery
```

SQL 생성기는 금액과 환율을 숫자 문자열 그대로 유지하고, 텍스트는 UTF-8 16진수 리터럴로 인코딩합니다. NULL·따옴표·일본어·줄바꿈을 보존합니다. 외래키를 끄지 않으며 기기 → 여행 → 영수증 → 품목 순서로 INSERT합니다. 스키마 DDL은 MySQL에서 자동 커밋되므로 복구 전체가 한 트랜잭션인 것은 아닙니다. 데이터 INSERT는 별도 트랜잭션으로 묶습니다.

현재 CSV에는 나중에 추가된 nullable 열 `receipts.store_name_ko`가 없습니다. 스키마에는 그 열을 보존하며, **가데이터 재적재 시 해당 값은 NULL**이 됩니다. 실제 DB에 입력된 한국어 매장명과 새 영수증을 보존하려면 아래의 라이브 덤프가 필요합니다.

## 실제 DB의 추가 데이터까지 보관할 때

이번 보관본은 **저장소에 있는 확정 스키마와 가데이터**입니다. `manifest.json`에도 `liveDatabaseDump: false`로 기록했습니다. 현재 DB에만 존재하는 새 영수증, 추가 컬럼 값, 트리거·권한·AUTO_INCREMENT 상태를 캡처한 라이브 덤프가 아닙니다.

실제 DB는 DB 관리 도구의 Export 또는 `mysqldump`로 별도 파일에 보관하세요. MySQL 8 CLI와 `travel_backup` 로그인 경로가 준비된 경우 다음처럼 프로젝트 바깥에 저장할 수 있습니다. 이 명령은 이번 작업에서 실행하지 않았습니다.

```bash
mysqldump --login-path=travel_backup --single-transaction --quick \
  --no-tablespaces --set-gtid-purged=OFF --column-statistics=0 \
  --default-character-set=utf8mb4 --skip-add-drop-table \
  travel_won > ../travel_WONIT-db-backups/live-2026-10-28.sql
```

실행할 때마다 새 파일명을 쓰세요. 덤프 중에는 다른 세션에서 테이블 구조를 바꾸지 않아야 합니다. `--single-transaction`으로도 동시 DDL로부터 덤프의 일관성을 보장할 수 없습니다. [MySQL 공식 백업 설명](https://dev.mysql.com/doc/refman/8.0/en/mysqldump.html)

생성된 라이브 덤프는 실제 사용 기록을 포함할 수 있으므로 Git에 넣지 않습니다. 현재 저장소의 `.env`도 그대로 두었습니다.
