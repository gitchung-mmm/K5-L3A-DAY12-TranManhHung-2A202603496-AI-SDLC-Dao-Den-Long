# Spec & Acceptance Criteria — Phase 2 (TICKET-02: "Ba hòn đảo", Contract v1.1)

## 1. Chuẩn hóa từ Phase 1 → Phase 2
- Thay thế toàn bộ thông số tự chọn ở Phase 1 bằng bộ số chuẩn của Ticket-02 (`game.contract.json` v1.1).
- Test cũ ở Phase 1 bị ảnh hưởng bởi luật mới (điểm +10 chuyển sang lúc nạp đèn thay vì lúc nhặt, `carry_capacity: 10`, `lantern_cost: 10`, `fall_enabled: true`, `pulse_cost: 3`, `per_stun: 5`, tên state Bóng Mực chuẩn) được **cập nhật có lý do rõ ràng** trong `tests/unit/engine.test.ts` (không tắt âm thầm).

## 2. Acceptance Criteria cho từng mục Phần 3

| Tính năng | Tiêu chí nghiệm thu kiểm chứng được (Acceptance Criteria) | Cách kiểm chứng |
|---|---|---|
| **Gió Lạc (`drifters`, Đêm 2 & 3)** | Tối đa 2 con (`D1`, `D2`), sinh ở tick `1200, 2400...`. Chuyển `idle (2m/s)` → `chase (7m/s)` khi Mây mang `>= 5` và cách `<= 15m`; chạm (`XZ <= 1.2m`) cướp `min(3, carried)` rồi `flee` `240` tick và `removed` (không mất máu, bỏ qua bất tử và safe zone). Pulse lúc `chase` → `flee` không cướp; Pulse lúc `flee` có đồ → thả `dropped` motes (`drifter_drop`) và biến mất sau `120` tick. | Headless scenario `drifter` + unit test |
| **Bùa Gió (`charms`, Đêm 2 & 3)** | `C1` ở Đêm 2 `(35,0,0)`; `C1, C2` ở Đêm 3 `(30,0,25)` & `(-30,0,25)`. Nhặt như đom đóm → emit `charm_picked`, hiệu lực `600` tick (`player_speed = 7.2 m/s`, Lướt không hồi chiêu), nhặt lại làm mới, hồi sinh sau `2700` tick. | Headless scenario `charm` + unit test |
| **Lướt (`dash`)** | Bấm `dash` (rising edge): tốc độ `14 m/s` trong `12` tick (`0.2s`), hồi chiêu `90` tick (`1.5s`) từ lúc bắt đầu (trừ khi có Bùa Gió), giữ nguyên độ cao trên không, không bất tử, emit `dash {}`. | Headless scenario `dash` + unit test |
| **Bản đồ Đêm 2 (Đảo Cau) & Bục nhảy** | 2 đảo `R=28m` nối bằng cầu tre `x∈[26,44], z∈[-2,2]`; 6 đèn `L1..L6`; chạm bục `(20,0,18)` hoặc `(50,0,-18)` phóng `velY=14, velXZ=24` về tâm đảo kia, không bị phím di chuyển ghi đè cho tới khi chạm đất (vẫn lướt được). | Headless scenario `night2-jumppad` |
| **Bản đồ Đêm 3 (Đảo Chuông), Dốc, Tháp, Gió** | 3 tầng (`Y=0`, vành `Y=3` `z>0` `R=12..24`, đĩa `Y=6` `R=8`), vách đứng, 2 dốc rộng `3m` ở `30°`/`150°`, bục nhảy `(0,3,13)` lên tầng 2, tháp chuông trụ `R=2m` ở tâm tầng 2, 7 đèn `L1..L7`, gió mạnh mỗi `30s` kéo dài `5s` (`2 m/s`, báo trước `2s`). | Headless scenario `night3-terrain-wind` |
| **Rơi khỏi đảo & Hồi sinh** | Khi `Y < -10`: bỏ qua bất tử, `-1` Ngọn Lửa, mất toàn bộ đom đóm (`player_hit` có `by:"fall"` & `lost`), chờ `60` tick (không nhặt/không bị chạm), hồi sinh tại `(0,0,0)` vận tốc `0` với `90` tick bất tử; hết Ngọn Lửa thua ngay. | Headless scenario `fall-respawn` |
| **Tạm dừng (`Esc/P` & `pause` input)** | Nhấn `pause` dừng hoàn toàn `sim_tick`, thời gian, hồi chiêu, spawn, TTL (`state: "paused"`, emit `paused`/`resumed`). Web có menu Tiếp tục / Chơi lại Đêm / Cài đặt / Về menu. | Headless scenario `pause` + kiểm tra Web UI |
| **Chuỗi 3 Đêm & Màn hình Bình Minh** | Menu chính → Giới thiệu Đêm (tên đảo + lời Ông Đăng) → Chơi → Kết quả → Đêm tiếp theo; thắng Đêm 3 hiện màn hình **Bình Minh** với tổng điểm các Đêm đã thắng; thua được chơi lại Đêm đó. | Kiểm tra thật trên trình duyệt |
| **Cài đặt lưu giữa các lần mở** | Thanh chỉnh âm lượng và độ nhạy chuột lưu vào `localStorage`, giữ nguyên khi tải lại trang. | Kiểm tra thật trên trình duyệt |
| **Âm thanh** | Có nhạc nền đêm + 10 SFX (nhặt, thắp đèn, tỏa sáng, bị đánh, nhảy, lướt, thắng, thua, Bóng Mực xuất hiện, đếm ngược 10s cuối). | Kiểm tra `src/game/audio.ts` + Web UI |
| **HUD đầy đủ & Bảng màu chuẩn** | Ngọn Lửa trên trái, đồng hồ `mm:ss` trên giữa (đỏ + nhấp nháy `<= 30s`), đèn `k/n` + điểm trên phải, thanh đom đóm 10 ô dưới giữa, hồi chiêu Lướt & Tỏa Sáng dưới phải, nhắc `"E — Nạp ánh sáng (x/10)"`, mũi tên chỉ đèn chưa sáng gần nhất ngoài màn hình; bảng màu khớp hex chuẩn `±10%` và ánh sáng môi trường `0.15 + 0.55 * (lit / total)`. | Kiểm tra thật trên trình duyệt `1280×720` |
| **Hiệu năng** | Headless `21.600` tick chạy xong `<= 30s`; Web 3D đạt `>= 30 FPS` trung bình ở `1280×720`. | `scripts/verify.mjs` + đo FPS trình duyệt |
