# Nhật ký dùng AI — Phase 1

## 1. Chiến lược & Tiết kiệm Token
- **Cách chia việc:** Yêu cầu AI dựng kiến trúc tách `src/core/` (thuần TypeScript, không phụ thuộc Three.js/DOM) trước, viết test hợp đồng (`tests/unit/`, `tests/scenarios/`) rồi mới dựng lớp hiển thị 3D (`src/game/`).
- **Cách tiết kiệm token:**
  - Chọn đồ họa **procedural 3D** bằng Three.js thay vì nạp model/asset nặng.
  - Giữ `AGENTS.md` ngắn gọn (~25 dòng) chỉ chứa lệnh chạy và ranh giới kiến trúc.
  - Gom toàn bộ bước kiểm tra vào 1 lệnh `npm run verify` để AI kiểm chứng nhanh thay vì chạy từng lệnh rời rạc nhiều vòng.
- **Ước tính token Phase 1:** Khoảng ~45k–60k tokens (bao gồm đọc tài liệu lab, phân tích Test Contract v1.0, sinh code core/CLI/3D/tests và chạy kiểm chứng).

## 2. Những lần AI gặp lỗi / điểm đã sửa trong Phase 1
1. **Lỗi tương thích lệnh trên Windows trong `scripts/verify.mjs`:** Khi gọi `spawnSync(process.execPath, ...)` với `shell: true`, đường dẫn `C:\Program Files\nodejs\node.exe` bị tách tại khoảng trắng. **Cách sửa:** chỉ bật `shell: true` khi gọi `npm` trên Windows (`cmd === "npm" && process.platform === "win32"`), giữ `shell: false` cho `process.execPath`.
2. **Định hướng camera và phím `WASD`:** Kiểm tra toán học ma trận xoay `rotateMoveByYaw` so với vị trí camera Three.js để đảm bảo `W` luôn tiến về phía trước màn hình và `A/D` khớp trái/phải theo góc nhìn.

## 3. Cập nhật Harness
- Tạo [AGENTS.md](../../AGENTS.md) với quy tắc cấm `src/core/` import `three`/DOM và bắt buộc `src/core/tuning.ts` khớp `game.contract.json`.
- Tạo skill [.agents/skills/verify-phase/SKILL.md](../../.agents/skills/verify-phase/SKILL.md) và CI workflow [.github/workflows/ci.yml](../../.github/workflows/ci.yml).
