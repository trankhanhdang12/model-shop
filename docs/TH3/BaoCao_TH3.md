BÁO CÁO THỰC HÀNH 3
DỰ ÁN TKD-SHOP
Sinh viên: Trần Khánh Đăng     MSSV: 2311110003
Môn học: Phát triển, vận hành, bảo trì phần mềm
Repository: https://github.com/trankhanhdang12/model-shop
Ngày lập báo cáo: [Điền ngày nộp thực tế]
1. Mục tiêu
Thiết lập logging và giám sát hoạt động; sao lưu, phục hồi dữ liệu; diễn tập xử lý sự cố; thực hành TDD RED cho Change Request CR-01. Nội dung dưới đây cần được cập nhật theo kết quả thực nghiệm thực tế.
2. Môi trường thực hành
Hạng mục	Thông tin
Ứng dụng	TKD-Shop / Node.js / Express / EJS
Cơ sở dữ liệu	MySQL – model_shop (cần xác minh)
Môi trường	MacBook / VS Code / GitHub
Branch & PR	[Điền số Issue, PR, trạng thái CI]
3. Logging và giám sát
Công cụ: Winston, winston-daily-rotate-file. File cấu hình: config/logger.js. Log mẫu: logs/tkd-shop-2026-11-08.log.
Kết quả đã quan sát: file log dung lượng khoảng 32 KB, có HTTP request và mã trạng thái; 11/11 Unit Test đạt. Có một thông báo EPERM khi một tiến trình cố listen tại 0.0.0.0:3000, cần ghi rõ nguyên nhân nếu xác minh được.
PR Logging: [Điền link PR và trạng thái merge]. Minh chứng: docs/TH3/evidence/logging.png [chỉ ghi khi file thực sự tồn tại].
4. Backup & Restore
Cách thực hiện: mysqldump sao lưu model_shop vào backups/ (không commit); phục hồi vào model_shop_restore_test; xác minh bảng/dữ liệu và ghi lại kết quả.
Kết quả thực tế: [CHƯA XÁC NHẬN – Terminal ban đầu không tìm thấy mysql/mysqldump]. Thời gian, kích thước backup: [Điền]. Số bảng đối chiếu: [Điền].
Runbook: docs/runbooks/backup-restore.md. PR: [Điền].
5. INC-01 và phục hồi dịch vụ
Môi trường diễn tập: [Điền]. Mô tả sự cố, phạm vi ảnh hưởng, timeline, 5 Whys, biện pháp xử lý và kiểm thử phục hồi: [Điền kết quả thực tế].
Hotfix PR / release v1.0.1 (nếu có): [Điền hoặc ghi không phát hành nếu không có bản sửa].
6. CR-01 – TDD RED
Yêu cầu thay đổi được chấp thuận: [Tên, mã Issue, tiêu chí chấp nhận]. Test được viết trước, kết quả thất bại dự kiến: [Điền]. Draft PR: [Điền]. Không merge PR trong Lab 3.
7. Kết quả, minh chứng và hạn chế
Nội dung	Trạng thái	Minh chứng
Logging	Đã ghi log / chờ xác nhận PR	File log; ảnh chụp
Backup / Restore	Chưa xác nhận	Ảnh restore, runbook
INC-01	Chưa xác nhận	Báo cáo sự cố
TDD RED	Chưa xác nhận	Test fail, Draft PR
Hạn chế và rủi ro: các cảnh báo npm audit cần xử lý có kiểm soát; không lưu file .env, mật khẩu hoặc bản dump chứa dữ liệu thật lên GitHub.
8. Kết luận
[Viết sau khi xác nhận kết quả thực tế của tất cả nhiệm vụ. Không ghi đã hoàn thành phần chưa kiểm tra.]
9. Liên kết nộp bài
Repository: https://github.com/trankhanhdang12/model-shop
Commit trên main sau khi merge báo cáo: 
