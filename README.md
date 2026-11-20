# Đảo Đèn Lồng (K5-L3A-DAY12-TranManhHung-2A202603496)

> Game 3D góc nhìn thứ ba: điều khiển Mây, người giữ đèn nhỏ tuổi đội nón lá, thu thập đom đóm để thắp sáng 5 Đèn Lồng Lớn trên Đảo Bến và né Bóng Mực trong sương đen.
> *(Video demo sẽ được bổ sung ở bản phát hành `v1.0.0` tại Phase 4.)*

---

## Cài đặt & Chạy game (3 lệnh)

Yêu cầu: **Node.js >= 20** (đã thử nghiệm trên Node 22/24, chạy được trên macOS, Linux và Windows).

```bash
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Sau lệnh thứ 3, mở trình duyệt tới `http://127.0.0.1:4173`.

## Điều khiển

| Phím / Chuột | Hành động |
|---|---|
| `W A S D` hoặc Phím mũi tên | Di chuyển Mây theo hướng camera |
| `Space` | Nhảy |
| `E` hoặc `F` | Nạp đom đóm vào Đèn Lồng Lớn khi đứng gần |
| `Shift`, `R` hoặc Chuột phải | Tỏa sáng (`pulse`) đẩy lùi và làm choáng Bóng Mực (tốn 1 đom đóm) |
| Giữ Chuột trái + kéo, hoặc `Q` / `C` | Xoay camera quanh Mây |

## Cách tính điểm

- Nhặt 1 đom đóm: **+10 điểm**
- Thắp sáng 1 Đèn Lồng Lớn (đủ 3 đom đóm): **+100 điểm**
- Làm choáng 1 Bóng Mực bằng tỏa sáng: **+25 điểm**
- Thưởng khi thắng (thắp đủ 5 đèn): **+2 điểm / giây còn lại** và **+50 điểm / ngọn lửa (máu) còn lại**

## Chạy kiểm thử & Chế độ Headless (Test Contract v1.0)

Chạy toàn bộ unit test, scenario test và kiểm tra tính tất định:

```bash
npm run verify
```

Chạy trực tiếp chế độ headless (60 tick/giây, không cửa sổ, đọc cấu hình từ `game.contract.json`):

```bash
node dist/cli/headless.js --seed 42 --night 1 --ticks 600 --out out.jsonl --snapshot-every 10
```

Tùy chọn thêm: `--scenario <file.json>` và `--inputs <file.json>`. Nếu file `--inputs` hoặc `--scenario` sai định dạng, chương trình ghi lỗi ra `stderr` và thoát với mã `2`.

## Sáng tạo của tôi

Ngoài phần lõi của PRD-0, bản Phase 1 bổ sung các chi tiết gọn nhẹ chỉ chạy ở lớp hiển thị Web 3D (`src/game/`) để **không làm thay đổi bất kỳ đầu ra headless nào**:
1. **Nhân vật phụ — Ông Lái Đò & Bến thuyền (`src/game/creative.ts`):** Ở rìa nam của Đảo Bến có cầu cảng gỗ, chiếc thuyền nhỏ dập dềnh và Ông Lái Đò cầm đèn dầu; khi Mây đến gần sẽ hiện lời thoại hướng dẫn theo tiến độ thắp đèn.
2. **Kẻ thù mới — Sương Giăng (`src/game/creative.ts`):** 2 cụm sương tím hồng tuần tra quanh vòng Đèn Lồng; chạm phải sẽ làm Mây chậm lại tạm thời (`1.6s`) và có thể bị xua tan tạm thời (`4s`) bằng kỹ năng Tỏa sáng (`pulse`).
3. **Ánh sáng đảo chuyển sắc dần:** Khi số Đèn Lồng Lớn được thắp tăng từ 0/5 đến 5/5, sương đen mỏng dần và ánh sáng toàn đảo ấm dần lên.
4. **Hiệu ứng sóng tỏa sáng & vòng an toàn:** Hiển thị vòng sáng vàng cam lan tỏa trên mặt đất khi dùng `pulse` và vòng ranh giới an toàn quanh các đèn đã thắp.
5. **Âm thanh tổng hợp procedural (Web Audio API):** Tự tạo âm thanh nhẹ khi nhặt đom đóm, nạp đèn, thắp đèn, tỏa sáng và va chạm (không dùng file âm thanh ngoài, có nút Bật/Tắt trên HUD).

## Tài liệu & Bằng chứng SDLC

### Bản sáng tạo — Đêm hội của những điều bị lãng quên

`src/game/creative.ts` điều phối hai module mới `festival.ts` và `memories.ts`:

- **Tàn:** linh vật giấy với hai tai lệch, bay theo Mây, thu nhỏ khi Bóng Mực ở gần và xoay mừng khi thắp đèn.
- **Năm ký ức:** thuyền giấy, trẻ rước đèn, bàn trà, vườn hoa và sân hội hiện dần ở phía ngoài từng đèn được thắp.
- **Sương Giăng:** thêm mặt nạ sứ, đuôi lụa và vòng báo hiệu dưới đất; rung nhẹ khi Mây đến gần.
- **Đèn Lạc:** chiếc đèn xanh có chân bỏ chạy khi đến gần; Tỏa sáng làm nó thu nhỏ và hiện lời thoại, không gây sát thương hoặc thay đổi điểm.
- **Cá Voi Mây:** bay ngang phía trước camera trong 12 giây sau khi thắp đèn thứ ba, có đèn trên lưng và bóng dưới đất. Người chơi vẫn điều khiển bình thường.
- **Chuyến đò cuối:** khi thắng, camera theo thuyền và những hành khách mờ trong khoảng 11 giây trước khi hiện bảng điểm. Nút Chơi lại vẫn dùng được.
- **Đom đóm:** ba bảng màu và hình dáng; âm nhặt chạy qua năm nốt nhạc. Các sự kiện ký ức có âm thanh tổng hợp riêng, dùng chung nút Bật/Tắt.

Đây là bản hình khối đầu tiên. Các chi tiết nâng cao trong ý tưởng như Tàn đậu trên nón, dấu chân Đèn Lạc, hoa bung khi xua sương, hơi trà chuyển động và chuỗi đèn nối toàn đảo chưa được triển khai. Không thay đổi `src/core/` hoặc `game.contract.json`.

Kiểm tra bản sáng tạo: [docs/proof/phase-2.md](docs/proof/phase-2.md).

- Khai báo contract: [game.contract.json](game.contract.json)
- Giả định & tiêu chí nghiệm thu: [docs/notes/spec-assumptions.md](docs/notes/spec-assumptions.md)
- Nhật ký dùng AI & token: [docs/notes/ai-log.md](docs/notes/ai-log.md)
- Bằng chứng Phase 1: [docs/proof/phase-1.md](docs/proof/phase-1.md)
- Harness AI: [AGENTS.md](AGENTS.md), [.agents/skills/verify-phase/SKILL.md](.agents/skills/verify-phase/SKILL.md), [.github/workflows/ci.yml](.github/workflows/ci.yml)
