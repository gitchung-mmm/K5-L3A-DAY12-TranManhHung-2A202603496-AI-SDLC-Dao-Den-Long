# ADR-001: Chuyển mô hình Đèn Lồng sang Nhiên liệu (Fuel) & Luật Thắng Sinh Tồn Bình Minh (Phase 3)

- **Ngày:** 2026-11-20
- **Trạng thái:** Đã áp dụng (Contract `v1.2`, Tag `phase-3`)
- **Bối cảnh:** Ở Phase 1–2, đèn thắp xong sẽ sáng vĩnh viễn và game kết thúc thắng ngay khi đủ 100% đèn (`all_lit`), khiến nửa sau Đêm thiếu kịch tính. TICKET-03 yêu cầu thay đổi cốt lõi sang cơ chế **đèn cạn dầu**, **Bóng Mực hút dầu (`drain`)**, **sức chứa tăng dần**, và **thắng bằng cách giữ đảo sáng tới bình minh (`dawn_survived`)**.

## 1. Quyết định thiết kế

### A. Mô hình trạng thái Đèn Lồng (dùng đơn vị nguyên `1/60`)
- Thay vì chỉ lưu boolean `lit`, mỗi đèn trong `LanternState` bổ sung:
  - `fuelUnits: number` (số nguyên `0..6000`, đại diện cho `0.0..100.0` với bước `1/60` để loại bỏ sai số số thực cộng dồn qua 18.000 tick).
  - `everLit: boolean` (nhớ đèn đã từng sáng → thắp lại chỉ tốn `5` đom đóm thay vì `10`).
  - `relitCount: number` (đếm số lần thắp lại trong Đêm).
- Khi xuất JSONL: làm tròn 1 chữ số thập phân (`Math.round((fuelUnits / 60) * 10) / 10`, đèn tắt luôn `fuel: 0`).
- **Tách điều kiện Vùng An Toàn:** Trước đây `hasSafeZone(l) = l.lit`. Từ v1.2, `hasSafeZone(l) = l.lit && l.fuelUnits >= 1800` (`fuel >= 30`). Khi châm dầu đưa đèn từ `< 30` lên `>= 30`, áp dụng đúng cơ chế `safePushTicks = 30` đẩy Bóng Mực ra mép `6m` không gây sát thương (tái sử dụng code từ lúc vừa thắp đèn).

### B. Trạng thái mới `drain` của Bóng Mực
- Thêm trạng thái `"drain"` vào `ShadeBehaviorState` cùng `targetLanternId` và `drainTickCounter` (phát sự kiện `fuel_drain` mỗi `60` tick đang hút).
- Chỉ Bóng Mực ở `"wander"` mới tìm đèn sáng yếu (`fuel < 30`, tie-break theo `id` nhỏ hơn); khi vào `<= 2m` thì chuyển `"drain"` và hút `5` đơn vị/tick (cộng dồn nhiều con).
- Thoát `"drain"` sang `"chase"` nếu Mây lại gần `<= 6m`, sang `"stunned"` nếu trúng Tỏa Sáng (thưởng tổng `+15` điểm), hoặc sang `"wander"` nếu đèn tắt / được châm lên `>= 30` / cách đèn `> 2m`. Hết `"stunned"` luôn quay về `"wander"`.

### C. Luật thắng/thua & Sức chứa tăng dần
- Bỏ điều kiện thắng sớm `all_lit`. Thời lượng 3 Đêm rút gọn về `240s / 270s / 300s`.
- Tại Bước 11 mỗi tick:
  1. `flames <= 0` → thua ngay (`no_flames`), kể cả đúng tick bình minh.
  2. `timeLeftS <= 0` → kiểm tra `litCount >= Math.ceil(0.6 * lanterns.length)` (`3/5`, `4/6`, `5/7`): đạt thì thắng (`dawn_survived`, cộng `+50 + floor(fuel)` mỗi đèn sáng và `+50 * flames`), không đạt thì thua (`dawn`).
- Sức chứa của Mây tính động: `capacity = Math.min(20, 10 + 2 * successfulLights)` (đặt lại 0 đầu Đêm; đèn đặt sẵn bằng scenario không tăng `successfulLights`).

## 2. Ảnh hưởng đến Test cũ (Migration có lý do)
- `tests/unit/engine.test.ts`:
  - **Cập nhật** test thắng `all_lit` cũ → thành test **không thắng sớm khi thắp đủ đèn** và **thắng tại bình minh (`dawn_survived`)** với công thức điểm mới (`+5`/mote, `+100` thắp lần đầu, `+40` thắp lại, `+50 + floor(fuel)`/đèn sáng + `50 * flames`).
  - **Cập nhật** test `pulse` → xác minh `+5` cho Bóng Mực thường, `+15` cho Bóng Mực đang `drain`, và hết choáng quay về `wander`.
- Toàn bộ test không bị thay thế của Phase 1–2 (di chuyển, nhảy, dash, bục nhảy Đêm 2, gió mạnh Đêm 3, Gió Lạc, Bùa Gió, tạm dừng, rơi & hồi sinh, exit code `2`) giữ nguyên và tiếp tục chạy hồi quy.
