# Mini game "Đập chuột" (Whack-a-Mole) — Tài liệu yêu cầu

> Trạng thái: chỉ là tài liệu yêu cầu, chưa có code.
> Nền tảng: trình duyệt web (desktop và mobile), không cần cài đặt, không cần backend.

## 1. Tổng quan

Người chơi bấm vào con chuột xuất hiện ngẫu nhiên trên lưới 3×3 ô. Mỗi lượt chơi kéo dài 30 giây; mục tiêu là ghi nhiều điểm nhất có thể.

## 2. Luật chơi

1. Lưới gồm **9 ô** (3 hàng × 3 cột), mỗi ô là một "hang chuột".
2. Khi bấm **Bắt đầu**, lượt chơi chạy và đồng hồ đếm ngược từ **30 giây**.
3. Chuột xuất hiện ở **một ô ngẫu nhiên** tại một thời điểm (tối đa 1 con trên lưới).
4. Mỗi con chuột hiện trong khoảng **800 ms** (giá trị cấu hình được) rồi tự biến mất nếu không bị bấm.
5. Sau khi chuột biến mất hoặc bị đập, con tiếp theo xuất hiện sau khoảng nghỉ ngắn (**300–600 ms**, ngẫu nhiên) ở ô **khác** ô vừa rồi.
6. Người chơi bấm (click / chạm) vào ô đang có chuột để đập.
7. Hết 30 giây, lượt chơi kết thúc, chuột ngừng xuất hiện và hiện màn hình kết quả.
8. Người chơi có thể chơi lại không giới hạn số lần.

## 3. Cách tính điểm

| Tình huống | Điểm |
|---|---|
| Bấm trúng ô có chuột | **+1** |
| Bấm vào ô trống | 0 (không trừ điểm) |
| Chuột tự biến mất mà không bị bấm | 0 |

- Mỗi con chuột chỉ tính điểm **một lần**: sau khi bị đập, các cú bấm tiếp theo vào ô đó không được tính.
- Điểm bắt đầu từ 0 ở mỗi lượt và không thể âm.
- **Điểm cao nhất (High score)** được lưu trong `localStorage` của trình duyệt và hiển thị cùng điểm hiện tại.
- Các cú bấm sau khi hết giờ không được tính.

## 4. Màn hình

### 4.1 Màn hình bắt đầu
- Tiêu đề game.
- Nút **Bắt đầu**.
- Dòng hướng dẫn ngắn: "Bấm vào chuột để ghi điểm. Bạn có 30 giây!"
- Hiển thị điểm cao nhất (nếu có).

### 4.2 Màn hình chơi
- **Thanh trạng thái** phía trên: Điểm hiện tại, Thời gian còn lại (giây), Điểm cao nhất.
- **Lưới 3×3** ở giữa, các ô vuông bằng nhau, có khoảng cách đều; ô có chuột hiển thị hình/emoji chuột (🐭).
- Phản hồi khi đập trúng: con chuột biến mất ngay, điểm tăng, có hiệu ứng ngắn (nhấp nháy/phóng nhỏ, tùy chọn âm thanh).
- Khi còn ≤ 5 giây, đồng hồ đổi màu cảnh báo.

### 4.3 Màn hình kết thúc
- Thông báo "Hết giờ!".
- Điểm của lượt vừa chơi và điểm cao nhất; nếu phá kỷ lục thì có dòng chúc mừng "Kỷ lục mới!".
- Nút **Chơi lại** (bắt đầu ngay lượt mới, điểm về 0, đồng hồ về 30 giây).

### 4.4 Giao diện chung
- Responsive: hiển thị tốt từ chiều rộng 320 px trở lên; lưới luôn vuông và nằm gọn trong màn hình.
- Mỗi ô đủ lớn để chạm bằng ngón tay (tối thiểu 64×64 px).
- Hỗ trợ chuột và cảm ứng; không bị zoom/cuộn khi chạm liên tục trên mobile.
- Văn bản giao diện bằng tiếng Việt.

## 5. Yêu cầu phi chức năng

- Là một trang web tĩnh (HTML + CSS + JavaScript), mở được trực tiếp trên trình duyệt hiện đại (Chrome, Safari, Firefox, Edge bản mới).
- Không phụ thuộc thư viện ngoài (khuyến khích).
- Đồng hồ chính xác (không lệch quá ~1 giây trong 30 giây); không bị lỗi khi chuyển tab rồi quay lại.
- Phản hồi khi bấm dưới 100 ms.

## 6. Tiêu chí hoàn thành

Game được coi là hoàn thành khi đáp ứng **tất cả** các mục sau:

- [ ] Hiển thị lưới đúng 3×3 = 9 ô.
- [ ] Bấm **Bắt đầu** thì đồng hồ đếm ngược từ 30 giây về 0, điểm về 0.
- [ ] Tại mỗi thời điểm có tối đa 1 con chuột, xuất hiện ở ô ngẫu nhiên, khác ô trước đó.
- [ ] Chuột tự biến mất sau thời gian hiển thị quy định nếu không bị bấm.
- [ ] Bấm trúng chuột: +1 điểm, chuột biến mất ngay, điểm trên màn hình cập nhật tức thì.
- [ ] Bấm ô trống hoặc bấm lặp lại vào chuột đã bị đập: không đổi điểm.
- [ ] Khi đồng hồ về 0: chuột ngừng xuất hiện, không nhận thêm điểm, hiện màn hình kết quả đúng điểm.
- [ ] Điểm cao nhất được lưu và vẫn còn sau khi tải lại trang.
- [ ] Nút **Chơi lại** bắt đầu lượt mới sạch (điểm 0, 30 giây, không còn bộ đếm cũ chạy song song).
- [ ] Bấm **Bắt đầu**/**Chơi lại** nhiều lần liên tiếp không làm đồng hồ hoặc chuột chạy nhân đôi.
- [ ] Chơi được bằng chuột trên desktop và bằng cảm ứng trên điện thoại (320 px trở lên), không lỗi bố cục.
- [ ] Không có lỗi trong console của trình duyệt trong suốt một lượt chơi.

## 7. Ngoài phạm vi (phiên bản đầu)

Đăng nhập, bảng xếp hạng online, nhiều mức độ khó, vật phẩm đặc biệt, chế độ nhiều người chơi.
