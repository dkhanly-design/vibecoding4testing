# Đập Chuột

Mini game chạy trên trình duyệt: lưới 3×3, mỗi lượt 30 giây, chuột xuất hiện nhanh dần, đập trúng bom bị trừ điểm, bảng Top 5 lưu trên máy. Người chơi đăng ký (họ tên, email, số điện thoại) trước lượt đầu tiên; ban tổ chức xem danh sách ở trang quản trị `/admin`.

## Cấu trúc thư mục

| Đường dẫn | Nội dung |
|---|---|
| `app/` | Code game: `index.html`, `style.css`, `game.js` |
| `admin/` | Trang quản trị: đăng nhập, danh sách, tìm kiếm, xoá, xuất CSV |
| `design/` | Design system: `tokens.css` (màu, chữ, khoảng cách, bo góc) và trang xem trước |
| `docs/` | Tài liệu sản phẩm (mở `docs/index.html`) |
| `server.js`, `src/` | Server Node.js: phục vụ trang, API, phiên đăng nhập admin |
| `migrations/` | Cấu trúc database (tự chạy khi server khởi động) |
| `Dockerfile`, `compose.yaml` | Đóng gói và chạy bằng Docker (dịch vụ `app` + `db` PostgreSQL) |
| `.env.example` | Mẫu file cấu hình bí mật |
| `YEU-CAU.md` | Yêu cầu ban đầu |

## Cách chạy bằng Docker

### Cần có

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) đã cài và **đang mở** (biểu tượng cá voi trên thanh menu không còn chạy hiệu ứng).

### Lần đầu: tạo file `.env`

File `.env` chứa mật khẩu admin và mật khẩu database. File này **không** được commit lên Git.

```bash
cp .env.example .env
```

Mở `.env` và thay hai chỗ `doi-mat-khau-nay-ngay`:

- `ADMIN_PASSWORD`: mật khẩu đăng nhập `/admin`, **tối thiểu 12 ký tự**. Tạo ngẫu nhiên: `openssl rand -base64 18`
- `POSTGRES_PASSWORD`: mật khẩu database, chỉ dùng chữ và số. Tạo ngẫu nhiên: `openssl rand -hex 24`

> Đổi `POSTGRES_PASSWORD` **sau khi** database đã được tạo sẽ không có tác dụng (PostgreSQL chỉ đọc biến này lần đầu). Muốn đổi thì phải tạo lại database (mất dữ liệu) — xem mục *Xoá toàn bộ dữ liệu*.

### Chạy game

```bash
docker compose up -d --build
```

- Game: **http://localhost:3000**
- Trang quản trị: **http://localhost:3000/admin** (đăng nhập bằng `ADMIN_USERNAME` / `ADMIN_PASSWORD` trong `.env`)

`--build` build lại image từ code mới nhất; `-d` chạy nền.

### Các lệnh thường dùng

| Việc cần làm | Lệnh |
|---|---|
| Xem trạng thái (cả `app` và `db` phải `healthy`) | `docker compose ps` |
| Xem log (thoát bằng Ctrl+C) | `docker compose logs -f app` |
| Dừng (giữ nguyên dữ liệu) | `docker compose down` |
| Cập nhật sau khi sửa code | `docker compose up -d --build` |

### Đổi mật khẩu admin

Sửa `ADMIN_PASSWORD` trong `.env`, rồi:

```bash
docker compose up -d
```

Mọi phiên đăng nhập cũ sẽ mất hiệu lực.

### Sao lưu và khôi phục dữ liệu

Dữ liệu người chơi nằm trong Docker volume `dap-chuot_dbdata`, không mất khi `docker compose down`.

Sao lưu ra file:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' > backup-$(date +%Y%m%d-%H%M).sql
```

Khôi phục từ file (ghi đè dữ liệu hiện có):

```bash
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backup-YYYYMMDD-HHMM.sql
```

File sao lưu chứa dữ liệu cá nhân — cất ở nơi an toàn, không commit lên Git.

### Xoá toàn bộ dữ liệu

```bash
docker compose down -v
```

`-v` xoá luôn volume database: **mọi người chơi và điểm bị xoá vĩnh viễn**.

### Đổi cổng

Nếu cổng 3000 đã bị chương trình khác dùng (lỗi `port is already allocated`), sửa dòng `ports` trong `compose.yaml`, ví dụ `"8080:3000"`, rồi chạy lại `docker compose up -d --build` và mở http://localhost:8080.

### Chạy qua ngrok / HTTPS

Đặt `TRUST_PROXY=1` trong `.env` để server lấy đúng IP người dùng (giới hạn số lần thử) và bật cookie `Secure` cho trang admin khi truy cập qua HTTPS.

### Gỡ lỗi nhanh

| Hiện tượng | Cách xử lý |
|---|---|
| `Cannot connect to the Docker daemon` | Docker Desktop chưa mở — mở ứng dụng Docker, đợi vài giây rồi chạy lại |
| `Thiếu ADMIN_PASSWORD trong .env` khi chạy lệnh | Chưa tạo file `.env` — xem mục *Lần đầu* |
| `app` khởi động rồi dừng, log ghi `[config] …` | Sửa đúng dòng được nêu trong log (ví dụ mật khẩu admin ngắn hơn 12 ký tự) |
| Log ghi `password authentication failed` | `POSTGRES_PASSWORD` trong `.env` khác lúc tạo database — đặt lại như cũ, hoặc xoá dữ liệu bằng `docker compose down -v` |
| Trang mở được nhưng không có màu / kiểu chữ | Kiểm tra http://localhost:3000/design/tokens.css có mở được không |
| Sửa code mà trang không đổi | Chạy lại `docker compose up -d --build`, rồi tải lại trang (Cmd+Shift+R) |

### Tham số test

Thêm vào cuối địa chỉ để test (xem `docs/05-ke-hoach-test.html`):

- `?debug=1` — hiện pha, tốc độ, tỉ lệ bom; kết quả không ghi vào Top 5 và không gửi lên máy chủ.
- `?seed=42` — cố định chuỗi ngẫu nhiên để lặp lại đúng một lượt chơi.

## Chạy không cần Docker

Cần Node.js 20+ và một PostgreSQL đang chạy:

```bash
npm ci
ADMIN_USERNAME=admin ADMIN_PASSWORD='mat-khau-dai-12-ky-tu' \
DATABASE_URL='postgres://user:pass@localhost:5432/dapchuot' npm start
```

rồi mở http://localhost:3000. Mở thẳng file `app/index.html` không còn chơi được vì cần máy chủ để đăng ký.
