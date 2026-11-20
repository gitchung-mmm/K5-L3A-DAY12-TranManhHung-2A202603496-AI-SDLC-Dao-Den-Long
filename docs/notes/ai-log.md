# Nhật ký dùng AI

## Phase 1 (PRD-0 / Contract v1.0)
- **Chiến lược:** Tách `src/core/` thuần TypeScript khỏi `src/game/` (Three.js/Web) ngay từ đầu, viết `npm run verify` làm cổng kiểm chứng tự động.
- **Lỗi AI phát hiện & khắc phục:**
  1. `scripts/verify.mjs` gọi `process.execPath` với `shell: true` trên Windows gây lỗi tách đường dẫn tại khoảng trắng → sửa chỉ bật `shell: true` cho lệnh `npm` trên Windows.
  2. Kiểm tra toán học ma trận `rotateMoveByYaw` so với camera Three.js để phím `WASD` đúng hướng nhìn.
- **Ước tính token Phase 1:** ~50k tokens.

---

## Phase 2 (TICKET-02 — "Ba hòn đảo" / Contract v1.1)
- **Chiến lược & Tiết kiệm Token:**
  - Cập nhật `AGENTS.md`, `game.contract.json` (`v1.1`) và viết `docs/notes/spec-phase2.md` trước khi sửa code để khóa chặt 12 bước/tick và bảng hằng số chuẩn.
  - Tách riêng `src/core/maps.ts` chứa hình học và truy vấn địa hình 3 Đêm để dùng chung cho cả simulation và renderer, tránh trùng lặp logic.
  - Chạy `npm run verify` ngay sau khi xong `src/core/` & `src/cli/` (18/18 tests pass ngay lần đầu) rồi mới nâng cấp Web 3D.
- **Lỗi phát hiện & cách sửa nhờ kiểm chứng thật:**
  1. **Kiểm tra quy ước góc XZ:** Đối chiếu tọa độ đèn Đêm 1 và tầng 1 Đêm 3 (`z > 0` tại góc `20°..160°`) để xác nhận công thức `x = r·cos(θ), z = r·sin(θ)`, tránh sai dấu trục Z.
  2. **Kiểm tra trực quan trên trình duyệt (`1280×720`):** Phát hiện mũi tên chỉ hướng đèn ngoài màn hình (`▲`) bị chồng lên đồng hồ đếm ngược trên giữa, và điểm spawn Đêm 3 `(0,0,-12)` đứng hơi sát vách tầng 2 → sửa biên `py >= 108px`, lùi điểm spawn Đêm 3 ra `(0,0,-24)` và thêm hiển thị `FPS` trực tiếp trên HUD.
  3. **Benchmark `21.600` ticks:** Lần đầu benchmark Đêm 3 dừng ở tick `11.134` do người chơi đứng yên bị Bóng Mực đánh thua → bổ sung scenario `random_shades: false` trong `scripts/verify.mjs` để chạy trọn vẹn đủ `21.600` ticks thật sự (`0.121s <= 30s`).
- **Cập nhật Harness:** Nâng cấp `AGENTS.md` (thêm quy tắc 12 bước/tick, trạng thái Bóng Mực chuẩn, điểm khi nạp đèn) và skill `.agents/skills/verify-phase/SKILL.md` (bổ sung check 3 Đêm & benchmark `21.600` ticks).
- **Ước tính token Phase 2:** ~75k tokens.
