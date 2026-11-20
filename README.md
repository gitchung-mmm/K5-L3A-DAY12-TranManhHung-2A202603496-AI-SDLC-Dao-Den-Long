# Đảo Đèn Lồng (K5-L3A-DAY12-TranManhHung-2A202603496)

> Game 3D góc nhìn thứ ba qua **3 Đêm** (*Đảo Bến*, *Đảo Cau*, *Đảo Chuông*): điều khiển Mây, người giữ đèn nhỏ tuổi đội nón lá, thu thập đom đóm để thắp sáng các Đèn Lồng Lớn, né Bóng Mực và Gió Lạc, tận dụng kỹ năng Lướt, Bục nhảy và Bùa Gió để đón Bình Minh.
> *(Video demo sẽ được bổ sung ở bản phát hành `v1.0.0` tại Phase 4.)*

---

## Cài đặt & Chạy game (3 lệnh)

Yêu cầu: **Node.js >= 20** (chạy đồng nhất trên macOS, Linux và Windows).

```bash
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Sau lệnh thứ 3, mở trình duyệt tới `http://127.0.0.1:4173`.

## Điều khiển

| Phím / Chuột | Hành động |
|---|---|
| `W A S D` hoặc Phím mũi tên | Di chuyển Mây theo hướng camera (`6.0 m/s`, tăng/dừng `<= 0.1s`, điều khiển trên không đầy đủ) |
| `Space` | Nhảy (`7.0 m/s`, trọng lực `-20 m/s²`) |
| `Shift` | **Lướt (`dash`)**: `14 m/s` trong `0.2s`, hồi chiêu `1.5s` (không hồi chiêu khi có Bùa Gió) |
| `E` hoặc `F` | Nạp đom đóm vào Đèn Lồng Lớn trong bán kính `2.0m` (mỗi đèn cần `10` đom đóm) |
| `R` hoặc Chuột phải | **Tỏa Sáng (`pulse`)**: tốn `3` đom đóm, bán kính `5m` 3D, đẩy lùi `4m` & choáng Bóng Mực `120` tick, xua/làm rơi đồ Gió Lạc |
| Giữ Chuột trái + kéo, hoặc `Q` / `C` | Xoay camera quanh Mây (độ nhạy chỉnh trong Cài đặt, lưu `localStorage`) |
| `Esc` hoặc `P` | Tạm dừng game (dừng hoàn toàn logic, mở menu Tiếp tục / Chơi lại / Cài đặt / Về menu) |

## Cách tính điểm (chuẩn hóa Contract v1.2 — "Đèn cạn dầu")

- Nạp 1 đom đóm vào đèn (thắp mới, thắp lại hoặc châm dầu): **+5 điểm**
- Thắp đèn lần đầu (`10` đom đóm): **+100 điểm** · Thắp lại đèn đã tắt (`5` đom đóm): **+40 điểm**
- Tỏa Sáng trúng 1 Bóng Mực: **+5 điểm** (tổng **+15 điểm** nếu Bóng Mực đang hút dầu `drain`)
- Thưởng Bình Minh (chỉ khi sống sót tới hết giờ với số đèn sáng `>= ceil(0.6 × tổng đèn)` — Đêm 1: `3/5`, Đêm 2: `4/6`, Đêm 3: `5/7`): **+`50 + floor(fuel)` mỗi đèn đang sáng** + **`50 × Ngọn Lửa còn lại`** (bỏ thưởng thời gian).
- Sức chứa tăng dần trong Đêm: `10 + 2 × số lần thắp thành công` (tối đa `20`).
- Hỗ trợ **Chế độ mù màu ("Bảng màu dễ phân biệt")** trong Cài đặt (lưu `localStorage`).

## Chạy kiểm thử & Chế độ Headless (Test Contract v1.1)

Chạy toàn bộ unit test, scenario headless cho 3 Đêm, kiểm tra tất định 3 Đêm và benchmark `21.600` ticks (`<= 30s`):

```bash
npm run verify
```

Chạy trực tiếp chế độ headless (60 tick/giây, không cửa sổ, hỗ trợ `--night 1 | 2 | 3`):

```bash
node dist/cli/headless.js --seed 42 --night 1 --ticks 600 --out out.jsonl --snapshot-every 10
```

Tùy chọn thêm: `--scenario <file.json>` và `--inputs <file.json>`. File sai định dạng thoát mã `2` và in lỗi ra `stderr`.

## Sáng tạo của tôi

Mọi yếu tố sáng tạo chạy hoàn toàn ở lớp hiển thị Web 3D (`src/game/creative.ts`, `src/game/festival.ts`, `src/game/memories.ts`) và **tắt hoàn toàn khi chạy headless**, đảm bảo không thay đổi bất kỳ số liệu chuẩn hay đầu ra Test Contract nào:

1. **Đêm hội của những điều bị lãng quên:**
   - **Tàn** — linh thú nhỏ đồng hành bay bên cạnh Mây, biết co người khi Bóng Mực đến gần và xoay vòng ăn mừng khi thắp đèn.
   - **5 cảnh ký ức** (*Bến đợi, Sân chơi, Quán cũ, Vườn nhà, Đêm hội*) nở sáng tương ứng khi thắp từng Đèn Lồng.
   - **Đèn Lạc** tinh nghịch bỏ chạy khi Mây lại gần và phản ứng khi gặp Tỏa Sáng; **Cá Voi Mây** bay ngang trời khi thắp đủ 3 đèn; **chiếc thuyền hành khách rời bến** khi hoàn thành Đêm 1.
2. **Nhân vật phụ Ông Lái Đò & Kẻ thù trang trí Sương Giăng (Đêm 1):** Cầu cảng gỗ, thuyền dập dềnh, thoại Ông Lái Đò theo tiến độ, và Sương Giăng mang mặt nạ sứ với dải lụa tím.
3. **Âm thanh procedural Web Audio API:** Nhạc nền đêm ngũ cung nhẹ nhàng + đầy đủ 10 hiệu ứng âm thanh chuẩn Ticket-02 + âm thanh cốt truyện (không dùng file nhạc bản quyền ngoài).

## Tài liệu & Bằng chứng SDLC

- Khai báo contract v1.2: [game.contract.json](game.contract.json)
- Spec, ADR & Acceptance Criteria: [docs/notes/spec-assumptions.md](docs/notes/spec-assumptions.md), [docs/notes/spec-phase2.md](docs/notes/spec-phase2.md), [docs/notes/adr-001-lantern-fuel.md](docs/notes/adr-001-lantern-fuel.md)
- Nhật ký dùng AI & token: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Bằng chứng từng phase: [docs/proof/phase-1.md](docs/proof/phase-1.md), [docs/proof/phase-2.md](docs/proof/phase-2.md), [docs/proof/phase-3.md](docs/proof/phase-3.md)
- Harness AI: [AGENTS.md](AGENTS.md), [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md), [.github/workflows/ci.yml](.github/workflows/ci.yml)
