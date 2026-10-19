
# TKD-Shop

## 1. Giới thiệu
TKD-Shop là website bán mô hình nhân vật anime,
được xây dựng bằng Node.js, Express, EJS và MySQL.

## 2. Công nghệ
- Node.js
- Express.js
- EJS
- MySQL (mysql2)
- express-session
- bcrypt (dependency đã khai báo)

## 3. Chức năng chính
- Xem, tìm kiếm và lọc sản phẩm
- Đăng ký và đăng nhập
- Quản lý giỏ hàng
- Đặt hàng và áp dụng voucher
- Xem lịch sử đơn hàng
- Quản trị sản phẩm, đơn hàng và thông báo

## 4. Cấu trúc thư mục
- app.js: Routes và xử lý nghiệp vụ
- db.js: Kết nối cơ sở dữ liệu
- data.js: Dữ liệu mặc định
- src/views/: Giao diện EJS
- src/public/: Tài nguyên tĩnh
- package.json: Thư viện và npm scripts

## 5. Cài đặt
Yêu cầu Node.js, npm và MySQL đã cấu hình.

```bash
npm install
```

## 6. Khởi động
Chạy tại thư mục gốc model-shop:

```bash
npm start
```

Truy cập: http://localhost:3000

## 7. Lưu ý
Không commit mật khẩu, thông tin kết nối
nhạy cảm hoặc dữ liệu cá nhân lên GitHub.

Cơ sở dữ liệu và các tài nguyên cần thiết
phải được cấu hình đầy đủ để tái lập hệ thống.
  