# Changelog

## [phase-2] - 2026-11-20
- Chuẩn hóa toàn bộ thông số game và Test Contract lên **`v1.1`** (`game.contract.json`, `src/core/tuning.ts`), tuân thủ thứ tự 12 bước/tick.
- Mở rộng thành **3 Đêm** với địa hình chuẩn (`src/core/maps.ts`): **Đêm 1 – Đảo Bến**, **Đêm 2 – Đảo Cau** (2 đảo, cầu tre, 2 bục nhảy), **Đêm 3 – Đảo Chuông** (3 tầng, vách đứng, 2 dốc 3m, bục nhảy lên tầng 2, tháp chuông, gió mạnh định kỳ).
- Bổ sung cơ chế mới: **Lướt (`dash`)**, **Rơi khỏi đảo & hồi sinh**, **Đom đóm rơi có TTL 480 tick**, **Gió Lạc (`drifters`)**, **Bùa Gió (`charms`)**, **Tạm dừng (`pause`/`Esc`/`P`)**, và 5 trạng thái Bóng Mực chuẩn (`spawning`, `wander`, `chase`, `recoil`, `stunned`).
- Nâng cấp Web 3D theo bảng màu chuẩn, ánh sáng môi trường `0.15 + 0.55 × (đèn sáng / tổng đèn)`, chuỗi 3 Đêm + màn hình Bình Minh, Cài đặt lưu `localStorage`, nhạc nền đêm + 10 SFX, HUD đầy đủ (thanh 10 ô đom đóm, mũi tên chỉ đèn ngoài màn hình, đồng hồ đỏ nhấp nháy `<= 30s`).
- Giữ nguyên toàn bộ phần sáng tạo (*Tàn, 5 ký ức, Đèn Lạc, Cá Voi Mây, Ông Lái Đò & Sương Giăng*) tách biệt khỏi `src/core/`.
- Bổ sung đầy đủ test hồi quy Phase 1 + scenario headless cho từng tính năng mới (18/18 tests pass) + benchmark 21.600 ticks (`<= 30s`).

## [phase-1] - 2026-11-20
- Khởi tạo dự án **Đảo Đèn Lồng** bằng TypeScript + Node.js (core/headless) + Three.js/Vite (Web 3D).
- Cài đặt simulation 60Hz tất định trong `src/core/`, tuân thủ Test Contract v1.0.
- Xây dựng màn chơi Đêm 1 – Đảo Bến, harness AI (`AGENTS.md`, skill `verify-phase`, CI) và bộ kiểm thử tự động.
