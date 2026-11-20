# Giả định & Tiêu chí Nghiệm thu — Phase 1 (PRD-0)

## 1. Các chỗ mở trong PRD-0 và Giả định đã chọn

| Hạng mục | Điểm mơ hồ trong PRD-0 | Giả định của bài làm |
|---|---|---|
| Kích thước đảo & rơi khỏi đảo | Chỉ nêu "hòn đảo tròn" và có trường `fall_enabled` | Đảo tròn bán kính `40` m quanh `(0,0,0)`. Đặt `fall_enabled: false` với tường vô hình ở rìa đảo để tránh lỗi vật lý rơi ở Phase 1. |
| Vị trí 5 Đèn Lồng Lớn | Không quy định tọa độ cụ thể | Đặt 5 đèn (`L1`..`L5`) cách đều nhau trên vòng tròn bán kính `22` m quanh tâm `(0,0,0)` (trừ khi `scenario.lanterns` ghi đè). |
| Chi phí thắp đèn & sức chứa | Không ấn định số đom đóm | `carry_capacity: 5`, `lantern_cost: 3` (tổng 15 đom đóm cho 5 đèn), `pickup_radius: 1.5` m, `interact_radius: 2.5` m. |
| Máu, va chạm & đánh rơi | Không ấn định số máu và tỉ lệ rơi | `flames: 3`, `invuln_s: 1.5` s, `hit_drop_ratio: 0.5`. Số đom đóm rơi tính bằng `Math.floor(carried * 0.5)` và bị sương đen dập tắt ngay (trừ khỏi `carried`, không sinh lại thành đom đóm dưới đất để không làm nhiễu `motes_active` trong kịch bản test). |
| Tỏa sáng (Pulse) | Tốn ánh sáng và xua Bóng Mực | `pulse_cost: 1`, `pulse_radius: 6.0` m, `pulse_push_m: 4.0` m, `pulse_stun_s: 3.0` s, `pulse_cooldown_s: 2.0` s. Chỉ kích hoạt khi `carried >= 1` và hết hồi chiêu. |
| Vùng an toàn (`safe_radius`) | "Bóng Mực sợ những chiếc đèn" | `safe_radius: 5.0` m chỉ áp dụng cho **Đèn Lồng đã thắp (`lit: true`)**. Bóng Mực không thể bước vào hoặc bị đẩy vào trong bán kính này. |
| Thời lượng & Điểm số | Không ấn định điểm cụ thể | `night1_duration_s: 300` s; hết giờ chưa thắp đủ 5 đèn → thua (`reason: "dawn"`). Điểm: `10`/mote, `100`/đèn, `25`/stun, cộng thêm `2`/giây dư và `50`/máu dư khi thắng. |

## 2. Tiêu chí nghiệm thu kiểm chứng được (Phase 1)

1. `game.contract.json` khớp 100% với hằng số `DEFAULT_TUNING` trong `src/core/tuning.ts`.
2. `node dist/cli/headless.js` chạy 60 tick/s không cần cửa sổ, tạo JSONL đúng schema (`snapshot` ở tick 0 và mỗi `--snapshot-every`, `event`, `end`).
3. Hai lần chạy headless cùng `--seed`, `--scenario`, `--inputs` cho output giống hệt nhau từng byte.
4. File `--inputs` hoặc `--scenario` sai định dạng / `tick` không tăng nghiêm ngặt thoát với mã `2` và in thông báo ra `stderr`.
5. Game Web 3D mở được trên trình duyệt, điều khiển Mây chạy/nhảy/nhặt đom đóm/nạp đèn/tỏa sáng, hiển thị HUD và chơi lại được sau khi thắng/thua.
