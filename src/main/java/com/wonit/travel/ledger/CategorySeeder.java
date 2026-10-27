package com.wonit.travel.ledger;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** 카테고리 6개를 고정 id(1~6)로 채웁니다. 이미 있으면 건너뜁니다. */
@Component
public class CategorySeeder implements ApplicationRunner {
    private final CategoryRepository categories;
    public CategorySeeder(CategoryRepository categories) { this.categories = categories; }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (int i = 0; i < LedgerService.CATEGORIES.size(); i++) {
            int id = i + 1;
            if (!categories.existsById(id)) categories.save(new CategoryEntity(id, LedgerService.CATEGORIES.get(i)));
        }
    }
}
