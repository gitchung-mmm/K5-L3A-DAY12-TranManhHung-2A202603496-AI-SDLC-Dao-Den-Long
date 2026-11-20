# Đảo Đèn Lồng — v1.0.0 (`K5-L3A-DAY12-TranManhHung-2A202603496`)

> Game 3D góc nhìn thứ ba qua **3 Đêm** (*Đảo Bến*, *Đảo Cau*, *Đảo Chuông*): điều khiển **Mây**, người giữ đèn nhỏ tuổi đội nón lá, thu thập đom đóm để thắp sáng và châm dầu giữ các **Đèn Lồng Lớn** sáng tới bình minh, đối mặt với **Bóng Mực** và **Gió Lạc**, tận dụng kỹ năng **Lướt**, **Bục nhảy** và **Bùa Gió**.

---

## 1. Cài đặt & Chạy game (3 lệnh)

Yêu cầu: **Node.js >= 20** (chạy đồng nhất trên macOS, Linux và Windows).

```bash
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Sau lệnh thứ 3, mở trình duyệt tới `http://127.0.0.1:4173`.

---

## 2. Điều khiển mặc định (hỗ trợ Gán lại phím — Key Rebinding)

Người chơi có thể đổi toàn bộ 9 phím điều khiển ngay trong **Cài đặt → Gán lại phím** (có kiểm tra trùng phím, lưu `localStorage`, nút **Khôi phục mặc định**):

| Hành động | Phím mặc định | Phím phụ / Chuột | Mô tả |
|---|---|---|---|
| Tiến / Lùi / Trái / Phải | `W` `S` `A` `D` | Phím mũi tên | Di chuyển Mây theo hướng camera (`6.0 m/s`, tăng/dừng `<= 0.1s`, điều khiển trên không đầy đủ) |
| Nhảy | `Space` | — | Vận tốc `7.0 m/s`, trọng lực `-20 m/s²` (chỉ nhảy khi chạm đất) |
| **Lướt (`dash`)** | `Shift` | — | `14 m/s` trong `0.2s`, hồi chiêu `1.5s` (hồi chiêu `0s` khi có Bùa Gió) |
| **Nạp / Châm dầu** | `E` | `F` | Nạp đom đóm vào Đèn Lồng trong bán kính `2.0m` (thắp mới `10`, thắp lại `5`, châm dầu `+10/mote`) |
| **Tỏa Sáng (`pulse`)** | `R` | Chuột phải | Tốn `3` đom đóm, bán kính `5m` 3D, đẩy lùi `4m` & choáng Bóng Mực `120` tick, xua Gió Lạc |
| Xoay camera | `Q` / `C` | Giữ Chuột trái + kéo | Xoay camera quanh Mây (chỉnh độ nhạy trong Cài đặt) |
| Tạm dừng | `Esc` | `P` | Dừng hoàn toàn `sim_tick` & thời gian, mở menu Tiếp tục / Chơi lại / Cài đặt / Về menu |

---

## 3. Luật chơi & Cách tính điểm (Contract v1.3)

- **Mục tiêu ("Đèn cạn dầu"):** Giữ ít nhất `ceil(0.6 × tổng đèn)` đèn sáng cho tới khi hết giờ đón **Bình Minh** (Đêm 1: `3/5`, Đêm 2: `4/6`, Đêm 3: `5/7`).
- **Nhiên liệu đèn:** Tối đa `100`, hao `1.0/giây`, dưới `30` mất vùng an toàn `6m` và nhấp nháy cảnh báo `1 Hz`. Bóng Mực `wander` sẽ tiến tới đèn yếu để hút `5 fuel/giây` (`drain`).
- **Sức chứa đom đóm:** Khởi đầu `10`, tăng `+2` sau mỗi lần thắp đèn thành công (tối đa `20`).
- **Điểm số:**
  - Nạp `1` đom đóm vào đèn (thắp mới, thắp lại hoặc châm dầu): **+5 điểm**
  - Thắp đèn lần đầu (`10` đom đóm): **+100 điểm** · Thắp lại đèn đã tắt (`5` đom đóm): **+40 điểm**
  - Tỏa Sáng trúng Bóng Mực: **+5 điểm** (tổng **+15 điểm** nếu Bóng Mực đang hút dầu `drain`)
  - Thưởng Bình Minh: **`50 + floor(fuel)`** cho mỗi đèn đang sáng + **`50 × Ngọn Lửa còn lại`**

---

## 4. Benchmark, Soak Test, Bảng xếp hạng & Headless CLI (Contract v1.3)

Toàn bộ lệnh xác minh chính thức chạy qua một cổng duy nhất:

```bash
npm run verify
```

### Lệnh CLI theo `game.contract.json` (`v1.3`)

1. **Chế độ Benchmark (`bench_cmd`):**
   ```bash
   node dist/cli/bench.js --seed 42 --duration 30 --out bench.json
   ```
   - Cảnh Web 3D chuẩn (`?bench=1` / `1280×720`, 200 Bóng Mực `wander` + 100 đom đóm + 3 đèn L1–L3 sáng, tắt hiệu ứng sáng tạo & decor, camera quay vòng `R=30m, Y=15m`, 3s warmup + 30s đo).
   - **Lưu ý VSync & Bộ nhớ trên Web:** Trình duyệt không cho phép JS tắt VSync cứng ở cấp driver, nên bản web đo bằng Chromium với flag `--disable-gpu-vsync` (`vsync_off: true`); trường `peak_mem_mb` ghi `null` trên bản web do trình duyệt không cung cấp RSS tiến trình đáng tin cậy qua JS chuẩn (trong khi CLI Node đo trực tiếp `process.memoryUsage().rss`).
   - Kết quả đo thực tế trong [bench.json](bench.json): `avg_fps: 430.2`, `p1_low_fps: 154.9`, `frame_ms_p95: 4.4 ms`, `load_ms: 1130 ms`.

2. **Chế độ Soak Test (`soak_cmd`):**
   ```bash
   node dist/cli/soak.js --nights 10 --out soak.json
   ```
   - Chạy liên tục 10 Đêm xoay vòng `1 → 2 → 3 → 1` không rò rỉ bộ nhớ, `crashes: 0`. Kết quả ghi tại [soak.json](soak.json) (`mem_start_mb: 49.2`, `mem_end_mb: 57.5`, `duration_s: 0.11`).

3. **Chế độ Headless (`headless_cmd`) & Xuất Bảng xếp hạng (`run_cmd`):**
   ```bash
   node dist/cli/headless.js --seed 42 --night 1 --ticks 600 --out out.jsonl --snapshot-every 10
   node dist/cli/run.js --export-leaderboard
   ```
   - Bảng xếp hạng lưu **Top 10** cục bộ (`localStorage`), hỗ trợ tên 3–12 ký tự (bao gồm tiếng Việt có dấu), xếp hạng theo điểm giảm dần và ưu tiên thành tích sớm hơn khi bằng điểm.

---

## 5. Tiếp cận (Accessibility) & Nâng cấp 3D

- **Kích thước chữ chuẩn:** Mọi chữ giao diện tối thiểu `18px`, hỗ trợ nút **Chữ lớn (`×1.25`)** trong Cài đặt.
- **Chế độ mù màu:** Đổi màu viền/mắt Bóng Mực sang `#00B3FF`, kết hợp vết rách giấy trên đèn tắt và biểu tượng ngọn lửa/thanh dầu.
- **Phụ đề trực quan (Visual Captions) & Chỉ hướng:** Hộp phụ đề hiển thị các sự kiện âm thanh quan trọng (*"Đèn tắt!"*, *"Đèn sắp tắt!"*, *"Bóng Mực mới!"*, *"Gió mạnh!"*) kèm mũi tên chỉ hướng Bóng Mực vừa xuất hiện ngoài tầm nhìn.
- **Giảm chuyển động (Reduced Motion):** Tắt rung camera, hạt bay, đung đưa cây cỏ/đèn và sóng mặt nước.
- **Sáng tạo Web 3D & Model nâng cấp** (tắt hoàn toàn khi chạy `headless` và `bench`):
  - **Đêm hội của những điều bị lãng quên:** *Tàn* (linh thú đồng hành), *5 cảnh ký ức*, *Đèn Lạc* (lồng đèn ngọc lam đội nón tí hon ôm đốm sáng), *Cá Voi Mây*, *Ông Lái Đò & Bến thuyền*, *Sương Giăng* (linh hồn mặt nạ sứ với 6 dải lụa đa đốt và cổ trận 2 vòng).
  - **Hệ sinh thái 3 Đảo:** 4 loài cây (Cây Đa tán mây, Thông 4 tầng thùy, Cau cong có buồng cau, Khóm Trúc), khóm hoa dương xỉ, vũng nước có lá súng/bông sen và **~1.200+ khóm cỏ 3D `InstancedMesh`** đung đưa theo gió.
  - **Âm thanh procedural Web Audio API:** Nhạc nền ngũ cung 32 bước + đầy đủ hiệu ứng âm thanh chuẩn, có nút bật/tắt nhạc và thanh âm lượng tổng.

---

## 6. Tài liệu & Bằng chứng SDLC

- Khai báo Contract v1.3: [game.contract.json](game.contract.json)
- Spec, ADR & Tham chiếu Model: [docs/notes/spec-assumptions.md](docs/notes/spec-assumptions.md), [docs/notes/spec-phase2.md](docs/notes/spec-phase2.md), [docs/notes/adr-001-lantern-fuel.md](docs/notes/adr-001-lantern-fuel.md), [docs/notes/models-reference.txt](docs/notes/models-reference.txt)
- Nhật ký AI & Retrospective: [docs/notes/ai-log.md](docs/notes/ai-log.md), [docs/notes/retro-v1.0.0.md](docs/notes/retro-v1.0.0.md)
- Bằng chứng nghiệm thu từng phase: [docs/proof/phase-1.md](docs/proof/phase-1.md), [docs/proof/phase-2.md](docs/proof/phase-2.md), [docs/proof/phase-3.md](docs/proof/phase-3.md), [docs/proof/phase-4-ui.md](docs/proof/phase-4-ui.md), [docs/proof/phase-4.md](docs/proof/phase-4.md)
- Harness AI & CI: [AGENTS.md](AGENTS.md), [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md), [.github/workflows/ci.yml](.github/workflows/ci.yml)
