
# KHẢO SÁT HỆ THỐNG TKD-SHOP
## Thực hành 1 - SDOM

### 1. Giới thiệu hệ thống

TKD-Shop là website bán mô hình nhân vật anime,
hỗ trợ tìm kiếm, quản lý giỏ hàng, đặt hàng,
thanh toán và quản trị cửa hàng.

### 2. Công nghệ sử dụng

- Backend: Node.js, Express.js
- Frontend: EJS, HTML, CSS, JavaScript
- Database: MySQL
- Session: express-session
- Truy xuất database: mysql2

### 3. Thành phần chính

| Thành phần | Vai trò |
|---|---|
| app.js | Route, middleware và nghiệp vụ |
| db.js | Kết nối và truy vấn MySQL |
| data.js | Dữ liệu sản phẩm mặc định |
| src/views/ | Giao diện EJS |
| src/public/ | Tài nguyên tĩnh |
| package.json | Thư viện và npm scripts |

### 4. Chức năng hệ thống

- Xem danh sách và chi tiết sản phẩm
- Tìm kiếm, lọc và sắp xếp sản phẩm
- Đăng ký, đăng nhập và đăng xuất
- Thêm, tăng, giảm, xóa sản phẩm trong giỏ
- Đặt hàng và áp dụng voucher
- Xem lịch sử, hủy đơn hàng
- Quản lý thông tin tài khoản
- Quản trị sản phẩm, đơn hàng, người dùng
- Quản lý thông báo

### 5. Kiến trúc tổng quan

Trình duyệt gửi HTTP request đến Express.

Express sử dụng middleware để xử lý session,
sau đó chuyển request đến route tương ứng.

Các route sử dụng db.js để truy vấn MySQL,
xử lý nghiệp vụ và render giao diện EJS.

### 6. Luồng xử lý đặt hàng

1. Khách hàng thêm sản phẩm vào giỏ hàng.
2. Hệ thống lưu giỏ hàng trong session.
3. Khách hàng truy cập /checkout.
4. Hệ thống tính tổng tiền sản phẩm.
5. Hệ thống tính phí vận chuyển.
6. Người dùng nhập thông tin giao hàng.
7. Hệ thống kiểm tra voucher và giảm giá.
8. Hệ thống lưu đơn hàng vào MySQL.
9. Hệ thống lưu chi tiết các sản phẩm.
10. Hệ thống hiển thị trang thành công.

### 7. Nhận xét ban đầu

Nhiều chức năng và logic nghiệp vụ hiện
được đặt trong app.js, khiến việc kiểm thử
độc lập và bảo trì trở nên khó khăn.

Hệ thống có thể cải thiện bằng cách
tách route, controller và service.

### 8. Minh chứng

Các ảnh khảo sát và sơ đồ được lưu trong:
docs/TH1/evidence/
