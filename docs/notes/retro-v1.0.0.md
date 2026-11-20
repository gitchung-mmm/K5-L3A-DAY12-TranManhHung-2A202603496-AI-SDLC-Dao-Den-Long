# Retrospective Phát Hành v1.0.0 — Dự án "Đảo Đèn Lồng"

## 1. Tổng quan hành trình 4 Phase
Dự án đi qua 4 cột mốc rõ ràng:
- **Phase 1 (`phase-1`, Contract v1.0):** Xây dựng lõi mô phỏng 60 tick/s tách biệt hoàn toàn với renderer Three.js, đạt chuẩn tất định (determinism) ngay từ đầu.
- **Phase 2 (`phase-2`, Contract v1.1 — "Ba hòn đảo"):** Đồng bộ bảng hằng số chuẩn, bổ sung cơ chế Lướt (`dash`), Gió Lạc (`Drifter`), Bùa Gió, Bục nhảy, địa hình 3 Đêm (*Đảo Bến*, *Đảo Cau*, *Đảo Chuông*), và 10 hiệu ứng âm thanh procedural.
- **Phase 3 (`phase-3`, Contract v1.2 — "Đèn cạn dầu"):** Thực hiện Change Request thay đổi luật thắng thua sang giữ đèn tới bình minh; xử lý nhiên liệu bằng số nguyên `1/60` (`0..6000`) loại bỏ hoàn toàn sai số số thực; ghi nhận quyết định qua [adr-001-lantern-fuel.md](adr-001-lantern-fuel.md).
- **Phase 4 (`phase-4` / `v1.0.0`, Contract v1.3 — "Bình minh"):** Hoàn thiện Benchmark 30s (`bench.json`), Soak Test 10 Đêm (`soak.json`), Bảng xếp hạng cục bộ, 4 tính năng Accessibility, làm mới Menu/Nhạc ngũ cung, và nâng cấp toàn bộ model 3D + hệ sinh thái 4 loài cây & thảm cỏ đung đưa theo gió.

## 2. Những điểm làm tốt
1. **Kiến trúc "Core thuần TypeScript + Presentation tách biệt":** Giúp chạy 21.600 ticks headless chỉ mất `~0.15s`, kiểm chứng byte-identical determinism 100%, và tự do nâng cấp đồ họa 3D (Sương Giăng, Đèn Lạc, Mây, Bóng Mực, cây cỏ) mà không bao giờ làm vỡ Test Contract.
2. **Contract-First & Cổng `npm run verify`:** Mọi thay đổi đều đi qua `typecheck → build → 24 unit/scenario tests → 3-night determinism → 18k-tick perf`, phát hiện lỗi ngay lập tức.
3. **Tối ưu hóa đồ họa WebGL:** Gom hình học dùng chung (`geoCache`, `matCache` trong `models.ts`) và dùng `InstancedMesh` cho hơn 1.200 khóm cỏ giúp giữ ổn định `120 FPS` trong gameplay thường và `430.2 FPS` trung bình trong Benchmark 200 Bóng Mực.

## 3. Bài học kinh nghiệm & Điểm cần cải thiện nếu phát triển tiếp
- **Quản lý dung lượng bundle JS:** Bundle Vite hiện đạt `~633 kB` do gộp Three.js vào chunk chính; trong phiên bản sau có thể tách `three` qua `manualChunks` để tối ưu tốc độ tải lần đầu.
- **Tách riêng UI/CSS sớm hơn:** Việc tách CSS ra `src/game/interface.css` ở Phase 4 giúp chỉnh sửa giao diện và hỗ trợ chữ lớn `×1.25` sạch hơn nhiều so với viết inline trong `index.html`.
- **Kiểm thử chéo trên trình duyệt thật:** Luôn kết hợp test headless với kiểm tra trực quan ở `1280×720` và `390×844` giúp phát hiện sớm các lỗi bố cục HUD (như mũi tên chỉ hướng chồng đồng hồ) và kiểm tra shader WebGL thực tế.
