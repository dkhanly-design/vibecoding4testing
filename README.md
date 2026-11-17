# Đập Chuột

Mini game chạy trên trình duyệt: lưới 3×3, mỗi lượt 30 giây, chuột xuất hiện nhanh dần, đập trúng bom bị trừ điểm, bảng Top 5 lưu trên máy.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `app/` | Code game: `index.html`, `style.css`, `game.js` |
| `design/` | Design system: `tokens.css` (màu, chữ, khoảng cách, bo góc) và trang xem trước |
| `docs/` | Tài liệu sản phẩm (mở `docs/index.html`) |
| `server.js` | Server Node.js nhỏ phục vụ `app/` và `design/` |
| `Dockerfile`, `compose.yaml` | Đóng gói và chạy bằng Docker |
| `YEU-CAU.md` | Yêu cầu ban đầu |

## Cách chạy bằng Docker

### Cần có

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) đã cài và **đang mở** (biểu tượng cá voi trên thanh menu không còn chạy hiệu ứng).

### Chạy game

Mở Terminal trong thư mục dự án và chạy:

```bash
docker compose up -d --build
```

Sau đó mở trình duyệt tại **http://localhost:3000**.

- `--build`: build lại image từ code mới nhất.
- `-d`: chạy nền, trả lại Terminal ngay.

### Các lệnh thường dùng

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái (cột STATUS phải có `healthy`) | `docker compose ps` |
| Xem log (thoát bằng Ctrl+C) | `docker compose logs -f app` |
| Dừng game | `docker compose down` |
| Cập nhật sau khi sửa code trong `app/` hoặc `design/` | `docker compose up -d --build` |

### Đổi cổng

Nếu cổng 3000 đã bị chương trình khác dùng (lỗi `port is already allocated`), sửa dòng `ports` trong `compose.yaml`, ví dụ `"8080:3000"`, rồi chạy lại `docker compose up -d --build` và mở http://localhost:8080.

### Gỡ lỗi nhanh

| Hiện tượng | Cách xử lý |
|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop chưa mở — mở ứng dụng Docker, đợi vài giây rồi chạy lại |
| Trang mở được nhưng không có màu / kiểu chữ | Kiểm tra http://localhost:3000/design/tokens.css có mở được không |
| Sửa code mà trang không đổi | Chạy lại `docker compose up -d --build`, rồi tải lại trang (Cmd+Shift+R) |

### Tham số test

Thêm vào cuối địa chỉ để test (xem `docs/05-ke-hoach-test.html`):

- `?debug=1` — hiện pha, tốc độ, tỉ lệ bom; kết quả không ghi vào Top 5.
- `?seed=42` — cố định chuỗi ngẫu nhiên để lặp lại đúng một lượt chơi.

## Chạy không cần Docker

Mở thẳng file `app/index.html` bằng trình duyệt, hoặc nếu máy có Node.js 20 trở lên:

```bash
npm start
```

rồi mở http://localhost:3000.
