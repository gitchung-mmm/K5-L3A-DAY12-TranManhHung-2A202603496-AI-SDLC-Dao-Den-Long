# Changelog

## [phase-3] - 2026-11-20 (Contract v1.2 — "Đèn cạn dầu")

### Breaking Changes (Thay đổi phá vỡ tương thích so với Phase 2 / v1.1)
- **Contract version:** Nâng từ `1.1` lên `1.2`; thêm 8 khóa tuning (`fuel_max`, `fuel_decay_per_s`, `fuel_per_mote`, `relight_cost`, `win_ratio`, `drain_per_s`, `low_fuel_threshold`, `capacity_max`).
- **Thời lượng Đêm:** Rút ngắn từ `300 / 330 / 360s` xuống **`240 / 270 / 300s`**.
- **Luật thắng [THAY THẾ]:** Bỏ thắng sớm `all_lit`. Chỉ thắng khi sống sót tới bình minh (`time_left_s <= 0`, `flames > 0`) với số đèn sáng `>= ceil(0.6 × tổng đèn)` (`3/5`, `4/6`, `5/7`), lý do mới: **`dawn_survived`**.
- **Nhiên liệu đèn [THAY THẾ]:** Đèn sáng tiêu hao `1.0 fuel/s`, cho phép châm dầu (`refuel`, `+10 fuel/mote`), hết dầu tắt (`lantern_out`, giữ `ever_lit: true`, thắp lại chỉ cần `5` đom đóm). Đèn có `fuel < 30` mất vùng an toàn `6m`.
- **Bóng Mực hút dầu [THAY THẾ]:** Thêm trạng thái **`drain`** (hút `5 fuel/s`, phát `fuel_drain` mỗi `60` tick); hết choáng (`stunned`) luôn về `wander`.
- **Công thức điểm [THAY THẾ]:** Bỏ thưởng thời gian; `+5`/đom đóm nạp hoặc châm dầu, `+100` thắp lần đầu, `+40` thắp lại, `+5` pulse (`+15` nếu đang `drain`), thắng bình minh cộng `+50 + floor(fuel)` mỗi đèn sáng và `+50 × Ngọn Lửa`.
- **Schema Snapshot/Event v1.2:** Đèn thêm `fuel`, `ever_lit`, `relit_count`; `player` thêm `capacity`; `lantern_lit` thêm `relight`; thêm sự kiện `refuel`, `lantern_out`, `fuel_drain`.

### Tính năng mới
- **Sức chứa tăng dần:** `10 + 2 × successful_lights` (tối đa `20`), hiển thị `đang mang / sức chứa` trên HUD.
- **Chế độ mù màu ("Bảng màu dễ phân biệt"):** Lưu trong Cài đặt; đổi viền/mắt Bóng Mực sang `#00B3FF`, cảnh báo UI sang `#FFFFFF` kèm `⚠`, đồng thời phân biệt đèn tắt/sáng không cần màu (đèn tắt xẹp 20% có vết rách giấy, đèn yếu dầu nhấp nháy `1 Hz` + thanh dầu).

## [phase-2] - 2026-11-20 (Contract v1.1 — "Ba hòn đảo")
- Chuẩn hóa thông số v1.1, mở rộng 3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông), Lướt, Gió Lạc, Bùa Gió, Tạm dừng, bảng màu & HUD chuẩn, nhạc nền + 10 SFX.

## [phase-1] - 2026-11-20 (Contract v1.0)
- Khởi tạo dự án **Đảo Đèn Lồng** (Đêm 1 – Đảo Bến), simulation 60Hz tất định, headless CLI, Web 3D Three.js và harness AI.
