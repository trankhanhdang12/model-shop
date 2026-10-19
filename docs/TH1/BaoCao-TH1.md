
# BÁO CÁO THỰC HÀNH 1
## DỰ ÁN TKD-SHOP

### 1. Giới thiệu

TKD-Shop là website bán mô hình nhân vật
anime, được xây dựng bằng Node.js,
Express.js, EJS và MySQL.

Hệ thống hỗ trợ:
- Quản lý sản phẩm.
- Tìm kiếm và lọc sản phẩm.
- Đăng ký và đăng nhập.
- Giỏ hàng và đặt hàng.
- Áp dụng voucher giảm giá.
- Quản lý đơn hàng.
- Các chức năng quản trị.

### 2. Quản lý mã nguồn bằng Git

Dự án được quản lý bằng Git và GitHub.

Repository:
https://github.com/trankhanhdang12/model-shop

Đã thực hiện:
- Khởi tạo Git repository.
- Tạo baseline cho mã nguồn ban đầu.
- Tạo Milestone TH1.
- Quản lý công việc bằng GitHub Issues.
- Phát triển trên các branch riêng.
- Sử dụng Pull Request để merge vào main.

Các Pull Request đã hoàn thành:
- PR #2: Bổ sung README.
- PR #4: Khảo sát kiến trúc hệ thống.
- PR #7: Unit Test và Code Coverage.

### 3. Khảo sát kiến trúc hệ thống

Hệ thống gồm các thành phần:

- Node.js: môi trường thực thi JavaScript.
- Express.js: xử lý HTTP request và routing.
- EJS: hiển thị giao diện động.
- MySQL: lưu trữ dữ liệu.
- express-session: quản lý phiên đăng nhập.

Các file chính:
- app.js: xử lý route và nghiệp vụ.
- db.js: truy vấn cơ sở dữ liệu.
- data.js: dữ liệu sản phẩm mặc định.
- src/views/: các trang giao diện.
- src/public/: tài nguyên tĩnh.

Tài liệu khảo sát chi tiết:
docs/TH1/system-analysis.md

### 4. Unit Test

Hai hàm được kiểm thử:

1. calculateDiscount()
2. calculateShippingFee()

Công cụ:
Node.js Built-in Test Runner.

Tổng số Unit Test: 11
Passed: 11
Failed: 0

### 5. Code Coverage

Phạm vi:
services/pricing.js

Kết quả:
- Line Coverage: 100%
- Branch Coverage: 85.71%
- Function Coverage: 100%

Các kết quả trên chỉ phản ánh phạm vi
module tính tiền, không phải toàn hệ thống.

Minh chứng:
docs/TH1/evidence/unit-test-coverage.png

### 6. Đánh giá chất lượng mã nguồn

Đã cài đặt SonarQube for IDE.

Tuy nhiên, quá trình sử dụng gặp lỗi
kỹ thuật trong extension nên chưa có
kết quả phân tích chính thức.

Một số vấn đề cần tiếp tục khảo sát:
- Session secret được ghi cố định.
- app.js chứa nhiều chức năng nghiệp vụ.
- Cần kiểm tra cơ chế bảo vệ mật khẩu.

Đây là các nhận xét sơ bộ từ việc
khảo sát mã nguồn, không phải kết quả
đã được SonarQube xác nhận.

### 7. Hạn chế

- Chưa hoàn thành phân tích SonarQube.
- Unit Test mới tập trung vào module pricing.
- Chưa kiểm thử tự động toàn bộ chức năng.
- Minh chứng sơ đồ kiến trúc cần rà soát lại.

### 8. Kết luận

Thực hành 1 đã triển khai Git Workflow,
quản lý công việc qua GitHub Issues,
khảo sát kiến trúc và kiểm thử đơn vị.

Các thay đổi được tích hợp thông qua
Pull Request, giúp theo dõi lịch sử
phát triển và hỗ trợ bảo trì hệ thống.
