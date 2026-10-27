package com.wonit.travel;

import org.junit.jupiter.api.Test;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;

// mysql 프로필은 DB_URL·DB_USERNAME·DB_PASSWORD로 연결하고, 테이블은 docs/db-schema-mysql.sql로만 만든다.
// 실제 MySQL 대신 H2 메모리 DB에 같은 프로필을 적용해 확인합니다.
class MysqlProfileTest {
    @Test void mysql_프로필은_접속정보를_환경값으로_받고_테이블을_자동_생성하지_않는다() {
        try (var context = new SpringApplicationBuilder(TravelWonhaeApplication.class).profiles("mysql")
                .run("--server.port=0", "--DB_URL=jdbc:h2:mem:mysql-profile-check", "--DB_USERNAME=profile-user",
                        "--DB_PASSWORD=profile-check", "--spring.datasource.driver-class-name=org.h2.Driver",
                        "--app.openai-api-key=")) {
            var env = context.getEnvironment();
            assertThat(env.getProperty("spring.datasource.url")).isEqualTo("jdbc:h2:mem:mysql-profile-check");
            assertThat(env.getProperty("spring.datasource.username")).isEqualTo("profile-user");
            assertThat(env.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("none");
            var tables = context.getBean(JdbcTemplate.class).queryForObject(
                    "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE UPPER(TABLE_NAME) IN ('SHARED_PRICES', 'DEVICES', 'RECEIPTS')", Integer.class);
            assertThat(tables).isZero();
        }
    }
}
