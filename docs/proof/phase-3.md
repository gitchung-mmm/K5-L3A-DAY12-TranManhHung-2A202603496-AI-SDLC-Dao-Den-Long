# Bằng chứng kiểm chứng — Phase 3 (TICKET-03: "Đèn cạn dầu", Contract v1.2)

## 1. Bảng truy vết yêu cầu → bằng chứng (Breaking Changes & Tính năng mới)

| Yêu cầu (TICKET-03 / Contract v1.2) | Cách kiểm chứng | Bằng chứng | Kết quả |
|---|---|---|---|
| `game.contract.json` v1.2 (thêm 8 khóa nhiên liệu/thắng/sức chứa, thời lượng 240/270/300s, điểm mới) | Unit test so sánh sâu `game.contract.json.tuning` với `DEFAULT_TUNING` | `tests/unit/contract-sync.test.ts` | **Đạt** |
| Nhiên liệu đèn tính theo đơn vị nguyên `1/60`, hao `1/s`, hết dầu tắt (`lantern_out`, `ever_lit: true`), thắp lại 5 đom đóm (`+40`), châm dầu (`refuel`, bỏ qua đèn đầy) | Unit test `lantern_out`, `relight`, `refuel` | `tests/unit/engine.test.ts` | **Đạt** |
| Bóng Mực hút dầu (`drain`, `5/s` + `1/s` = `6/s`, `fuel_drain` mỗi `60` tick), đèn `<30` mất vùng an toàn, châm lên `>=30` đẩy Bóng Mực ra mép trong `<=30` tick | Headless scenario `shade drains weak lantern` + unit test `safe_radius` | `tests/scenarios/headless.test.ts` + `tests/unit/engine.test.ts` | **Đạt** |
| Tỏa Sáng trúng Bóng Mực đang `drain` cộng tổng `+15` điểm, thường `+5`, hết choáng quay về `wander` | Unit test `pulse` v1.2 | `tests/unit/engine.test.ts` | **Đạt** |
| Luật thắng mới: không thắng sớm khi đủ đèn; thắng tại bình minh (`dawn_survived`) khi sống & đủ `>= ceil(0.6 × tổng đèn)` với công thức thưởng mới (`+50 + floor(fuel)`/đèn + `50 × flames`) | Headless scenario `dawn_survived` vs `dawn` + unit test tính điểm chính xác (`845` điểm) | `tests/scenarios/headless.test.ts` + `tests/unit/engine.test.ts` | **Đạt** |
| Sức chứa tăng dần `10 + 2 × successful_lights <= 20` (hiển thị `đang mang / sức chứa`) | Unit test kiểm tra `capacity` tăng từ `10 → 12` sau khi thắp đèn + HUD `#hud-capacity` | `tests/unit/engine.test.ts` + `src/main.ts` | **Đạt** |
| Chế độ mù màu ("Bảng màu dễ phân biệt", lưu `localStorage`): viền/mắt Bóng Mực `#00B3FF`, cảnh báo `#FFFFFF` + `⚠`, đèn tắt xẹp 20% + vết rách giấy, thanh dầu + nhấp nháy `1 Hz` khi `<30` | Kiểm tra build TypeScript/Vite + cấu hình CSS/Three.js (`setColorblind`, `tearGroup`, `fuelBarGroup`) | `src/game/scene.ts`, `index.html`, `src/main.ts` | **Đạt** |
| Hồi quy toàn bộ test Phase 1–2 không bị thay thế (di chuyển, nhảy, dash, bục nhảy, gió, Gió Lạc, Bùa Gió, tạm dừng, rơi, exit code `2`, sáng tạo) | Chạy toàn bộ `npm run verify` | **21/21 tests pass**, 3-night determinism khớp byte, `18.000` ticks Đêm 3 trong **`0.139s`** | **Đạt** |

## 2. Quy trình xử lý thay đổi (Change Request)
- **ADR quyết định thiết kế:** [docs/notes/adr-001-lantern-fuel.md](../notes/adr-001-lantern-fuel.md).
- **Changelog breaking changes:** [CHANGELOG.md](../../CHANGELOG.md).
- **Cập nhật test cũ có lý do:** Không bỏ qua (skip) bất kỳ test nào; các test `all_lit` và công thức điểm cũ trong `tests/unit/engine.test.ts` đã được viết lại theo luật mới của Ticket-03 kèm chú thích lý do rõ ràng.
