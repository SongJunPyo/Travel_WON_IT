package com.wonit.travel.ocr;

import com.wonit.travel.Money;
import com.wonit.travel.api.DomainException;
import com.wonit.travel.api.ErrorCode;
import com.wonit.travel.ledger.LedgerService;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** 사진 검사와, 읽은 값(문자열)을 앱이 쓰는 최소 단위 초안으로 바꾸는 일을 맡습니다. */
public class ReceiptDraftMapper {

    private static final Set<String> IMAGE_TYPES = Set.of("image/jpeg", "image/png", "image/webp");
    private static final long MAX_FILE_BYTES = 10L * 1024 * 1024;

    public void validateFile(String contentType, long size) {
        if (contentType == null || !IMAGE_TYPES.contains(contentType) || size < 1 || size > MAX_FILE_BYTES) {
            throw new DomainException(ErrorCode.INVALID_FILE);
        }
    }

    public ReceiptDraft recognize(ReceiptReader reader, byte[] image, String contentType) {
        validateFile(contentType, image.length);
        RecognizedReceipt recognized;
        try {
            recognized = reader.read(image, contentType);
        } catch (DomainException e) {
            throw e;
        } catch (RuntimeException e) {
            throw new DomainException(ErrorCode.OCR_FAILED);
        }
        return toDraft(recognized);
    }

    /** 통화·총액·상품이 하나도 없으면 가계부에 쓸 수 없으므로 OCR_FAILED입니다. */
    public ReceiptDraft toDraft(RecognizedReceipt r) {
        if (r == null) throw new DomainException(ErrorCode.OCR_FAILED);
        String currency = r.currency() == null ? null : r.currency().strip().toUpperCase(Locale.ROOT);
        long total = Money.parseMinor(r.total(), currency);
        List<ReceiptDraft.Item> items = new ArrayList<>();
        if (r.items() != null) {
            for (RecognizedReceipt.Item item : r.items()) {
                if (item == null || item.name() == null || item.name().isBlank() || item.name().strip().length() > 160) continue;
                int quantity = item.quantity() == null ? 1 : item.quantity();
                long unit = Money.parseMinor(item.unitPrice(), currency);
                if (quantity < 1 || quantity > 999 || unit < 1) continue;
                String nameKo = item.nameKo() == null || item.nameKo().isBlank() || item.nameKo().strip().length() > 160
                        ? null : item.nameKo().strip();
                items.add(new ReceiptDraft.Item(item.name().strip(), nameKo, quantity, unit));
            }
        }
        if (!Money.supported(currency) || total < 1 || items.isEmpty() || items.size() > 100) {
            throw new DomainException(ErrorCode.OCR_FAILED);
        }
        String category = r.category() != null && LedgerService.LEDGER_CATEGORIES.contains(r.category().strip())
                ? r.category().strip() : "기타";
        return new ReceiptDraft(store(r.store()), address(r.address()), date(r.date()), currency, category, total, List.copyOf(items));
    }

    private static String store(String store) {
        if (store == null || store.isBlank() || store.strip().length() > 120) return null;
        return store.strip();
    }

    /** 매장 주소는 DB stores.address(250자)에 들어가므로 길이를 넘으면 버립니다. */
    private static String address(String address) {
        if (address == null || address.isBlank()) return null;
        String value = address.strip().replaceAll("\\s*\\n\\s*", ", ");
        return value.length() > 250 ? null : value;
    }

    private static String date(String date) {
        if (date == null) return null;
        try {
            return LocalDate.parse(date.strip()).toString();
        } catch (DateTimeParseException e) {
            return null;
        }
    }
}
