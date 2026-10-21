# Hợp đồng M3 Thực thi khoa học IND061

FiTechRNV3 • Lập 21/10/2026 17:24 (Asia/Saigon).

Hồ sơ được lập tại thời điểm hiện tại. Không hồi tố thành preregistration cho công việc đã chạy; không thay work order hoặc receipt cũ. Đăng ký tài liệu không cấp quyền thực thi, acceptance, adoption, miễn nợ, PASS hay R1.

## Mục tiêu và scope

Đo conformance của successor IND061 trên roster đã đăng ký sau qualification; không loop đến khi PASS.

Công việc IND061 hiện tại, không phải toàn R0. Trạng thái đã quan sát: NOT_EXECUTED.

## 1. Input

Nhận source/callable/fixture và qualification đã được chấp nhận theo work order hiện hành; V2 chưa đủ điều kiện.

## 2. Methodology

Thực hiện đúng 16 frame × baseline và successor, tổng 32 replay call đã đăng ký. Toy/control có ledger riêng.

## 3. Technical / Engineering / Program

Capture từng invocation, input/output/source hashes; giữ stdout/stderr và mọi attempt lỗi, không sửa expectation sau quan sát mà giấu lịch sử.

## 4. Output

Raw replay results và comparison, consumer/oracle evidence cùng exact affected scope; phần chưa chạy ghi NOT_EXECUTED.

## 5. Acceptance

Đối chiếu suppress t<30 và bit-identical t>=30 theo receipt; acceptance khoa học vẫn cần Governor/Son đúng scope.

## Ràng buộc và xác nhận

Giữ nguyên lịch sử, dirty work, root lỗi và các NOT_PASS. Không thêm policy, criterion số hoặc thay thành viên. Son giữ quyền phê chuẩn khoa học/gate. Bỏ trần thời gian theo receipt hiện hành không mở rộng scope hoặc attempt.

Approval cho hợp đồng mới: NOT_RECEIVED. Execution_authorized_by_this_registration=false. Các receipt cũ chỉ giữ đúng scope và không hoàn lại lượt đã dùng.

## Nguồn

qc [d23aef584ed0…]; readback [e2d5ff3fdf63…]; roadmap [ff814319ac75…]; time-receipt [d559f60ce005…]; roster [f0fd2e9f72d3…]; release-wo [c622c4a1bfd1…]

Hash đầy đủ và đường dẫn trong input_manifest_v1.json và SOURCE_REGISTER_V1.json của bundle.
