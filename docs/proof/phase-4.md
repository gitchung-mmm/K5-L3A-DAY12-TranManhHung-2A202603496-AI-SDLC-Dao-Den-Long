# Bằng chứng nghiệm thu Phase 4 — TICKET-04 "Bình minh: phát hành v1.0.0"

- **Tag:** `phase-4` & `v1.0.0` · **Contract:** `v1.3` ([game.contract.json](../../game.contract.json))
- **Sinh viên:** Trần Mạnh Hùng (`2A202603496`, lớp `L3A`)

## 1. Benchmark 30s (`bench.json`)
- Lệnh: `node dist/cli/bench.js --seed 42 --duration 30 --out bench.json` (và cảnh Web 3D `?bench=1`, `1280×720`, 200 Bóng Mực `wander` + 100 đom đóm + 3 đèn L1–L3 sáng, tắt decor & yếu tố sáng tạo, 3s warmup + 30s đo).
- Kết quả thực tế trong [bench.json](../../bench.json):
  - `avg_fps`: **430.2** (ngưỡng >= 30)
  - `p1_low_fps`: **154.9** (ngưỡng >= 20)
  - `frame_ms_p95`: **4.4 ms**
  - `frames`: **12,908**
  - `load_ms`: **1,130 ms** (ngưỡng <= 5,000 ms)
  - `vsync_off`: `true` (chạy Chromium với `--disable-gpu-vsync`; `peak_mem_mb: null` có giải thích trong [README.md](../../README.md) do hạn chế sandbox trình duyệt).

## 2. Soak Test 10 Đêm (`soak.json`)
- Lệnh: `node dist/cli/soak.js --nights 10 --out soak.json`
- Kết quả thực tế trong [soak.json](../../soak.json):
  - `nights`: **10** (xoay vòng Đêm 1 → 2 → 3)
  - `crashes`: **0**
  - `mem_start_mb`: **49.2 MB** → `mem_end_mb`: **57.5 MB** (ổn định, không rò rỉ)
  - `duration_s`: **0.11 s**

## 3. Bảng xếp hạng, Tiếp cận (Accessibility), Menu & Nâng cấp 3D
- **Bảng xếp hạng cục bộ (`src/core/leaderboard.ts`):** Top 10 lưu `localStorage`, hỗ trợ 3–12 ký tự tiếng Việt có dấu, xuất JSON qua `node dist/cli/run.js --export-leaderboard`.
- **Accessibility (`src/main.ts`, `src/game/interface.css`):** Gán lại 9 phím điều khiển (kiểm tra trùng phím + khôi phục mặc định), phụ đề trực quan + mũi tên chỉ hướng Bóng Mực mới, Reduced Motion, chữ chuẩn `>= 18px` + phóng to `×1.25`, chế độ mù màu `#00B3FF`.
- **Làm mới Menu & Nhạc nền (`docs/proof/phase-4-ui.md`):** Màn hình chính mới kèm 3 thẻ chọn Đêm, nhạc nền ngũ cung 32 bước Web Audio API, kiểm chứng trên `1280×720` và `390×844` ([menu-refresh.jpg](menu-refresh.jpg)).
- **Nâng cấp Model 3D & Hệ sinh thái (`src/game/models.ts`, `decor.ts`, `creative.ts`, `festival.ts`):** Nâng cấp toàn bộ nhân vật/vật phẩm theo [models-reference.txt](../notes/models-reference.txt), làm mới Sương Giăng, Đèn Lạc, Gió Lạc, 4 loài cây và hơn 1.200 khóm cỏ `InstancedMesh` đung đưa theo gió (đạt `120 FPS`, 0 lỗi console/WebGL).

## 4. Cổng kiểm chứng tự động (`npm run verify`)
- `tsc --noEmit` & `vite build` & `tsc -p tsconfig.cli.json`: **PASS**.
- `npm test`: **24/24** unit & scenario tests **PASS** (bao gồm kiểm tra `contract v1.3`, `soak`, `leaderboard`).
- Headless determinism 3 Đêm (6.000 ticks, seed 42): **khớp byte-identical 100%** trước và sau mọi nâng cấp đồ họa.
- Benchmark hiệu năng Night 3 (18.000 ticks headless): **~0.16 s** (`<= 30s`).
