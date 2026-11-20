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

---

## Phase 3 (TICKET-03 — "Đèn cạn dầu" / Contract v1.2, 30 phút)
- **Chiến lược & Tiết kiệm Token:**
  - Viết ngay [adr-001-lantern-fuel.md](adr-001-lantern-fuel.md) và cập nhật `AGENTS.md` + `game.contract.json` (`v1.2`) trước khi sửa `src/core/`, dùng đơn vị nguyên `1/60` cho dầu (`0..6000`) ngay từ đầu để tránh bug sai số số thực.
  - Sửa tập trung vào `src/core/` và chạy `npm run verify` (21/21 tests pass ngay lần đầu) trước khi chỉnh lớp Web 3D (`scene.ts`, `index.html`, `main.ts`) để kịp tiến độ 30 phút.
- **Xử lý thay đổi phá vỡ tương thích:** Cập nhật rõ lý do các unit test cũ (`all_lit` → `dawn_survived`, điểm `+5`/mote, `+15` khi pulse Bóng Mực đang `drain`, hết choáng về `wander`), không tắt test âm thầm.
- **Ước tính token Phase 3:** ~40k tokens.

---

## Phase 4 (TICKET-04 — "Bình minh: phát hành v1.0.0" / Contract v1.3)
- **Chiến lược & Kiến trúc:**
  - Tách riêng `src/core/bench-sim.ts` & `src/core/leaderboard.ts` (thuần TypeScript, kiểm thử được qua CLI) khỏi UI Web 3D (`src/main.ts`, `src/game/scene.ts`).
  - Mọi phần mở rộng hiển thị (thiên nhiên `src/game/decor.ts`, nâng cấp rig `src/game/models.ts`, sáng tạo `creative.ts` / `festival.ts`) đều nằm gọn trong `src/game/` và tự động tắt trong chế độ `headless` / `bench`, đảm bảo mã băm SHA256 đầu ra headless 3 Đêm không đổi một byte nào.
- **Lỗi phát hiện & khắc phục:**
  1. `src/cli/soak.ts`: Thiếu kiểu trả về cho hàm đọc input gây lỗi TS7022 → bổ sung chú thích kiểu `: boolean` rõ ràng.
  2. Mũi tên chỉ đèn ngoài màn hình (`src/main.ts`) bị đè lên đồng hồ đếm ngược khi phóng to chữ `×1.25` → kẹp biên `py` trong `[120, h - 130]`.
  3. Dùng `THREE.InstancedMesh` + `onBeforeCompile` vertex wind shader cho thảm cỏ `1.200+` khóm để giữ chỉ `2` draw call, duy trì `120 FPS` trên trình duyệt.
- **Ước tính token Phase 4 (bao gồm nâng cấp 3D & UI):** ~110k tokens.
