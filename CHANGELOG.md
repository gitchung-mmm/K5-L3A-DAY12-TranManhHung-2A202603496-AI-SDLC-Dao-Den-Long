# Changelog

## [phase-1] - 2026-11-20
- Khởi tạo dự án **Đảo Đèn Lồng** bằng TypeScript + Node.js (core/headless) + Three.js/Vite (Web 3D).
- Cài đặt đầy đủ simulation 60Hz tất định trong `src/core/`, tuân thủ Test Contract v1.0 (`game.contract.json`, `dist/cli/headless.js`).
- Xây dựng màn chơi Đêm 1 – Đảo Bến với Mây (nón lá + đèn nhỏ), 5 Đèn Lồng Lớn, đom đóm, Bóng Mực, HUD và nút chơi lại.
- Bổ sung phần sáng tạo Web 3D (`src/game/creative.ts`): nhân vật phụ Ông Lái Đò ở bến thuyền và kẻ thù mới Sương Giăng (tắt hoàn toàn khi chạy headless).
- Thiết lập harness AI (`AGENTS.md`, skill `verify-phase`, GitHub Actions CI) và bộ kiểm thử tự động (`npm run verify`).
