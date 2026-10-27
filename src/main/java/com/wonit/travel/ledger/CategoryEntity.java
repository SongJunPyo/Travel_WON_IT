package com.wonit.travel.ledger;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 음식·쇼핑·교통·숙박·관광·기타. 서버 시작 시 CategorySeeder가 채웁니다. */
@Entity
@Table(name = "categories")
public class CategoryEntity {
    @Id private Integer id;
    @Column(nullable = false, unique = true, length = 20) private String name;

    protected CategoryEntity() {}
    CategoryEntity(Integer id, String name) { this.id = id; this.name = name; }

    public Integer getId() { return id; }
    public String getName() { return name; }
}
