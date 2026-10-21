// Single registry of the 14 original analytical areas (+ methods). The hub, the dossier nav and the coverage matrix all read it.
// Statuses are about THIS reader dossier, not the PHP reference (which reproduces all 14 areas for PHP only).
export const STATUS = { IMPLEMENTED: 'IMPLEMENTED', SOURCE_DRIVEN: 'SOURCE_DRIVEN', PARTIAL: 'PARTIAL', NOT_ACTIVATED: 'NOT_ACTIVATED', NOT_IMPLEMENTED: 'NOT_IMPLEMENTED', NOT_APPLICABLE: 'NOT_APPLICABLE' };
export const STATUS_LABEL = { IMPLEMENTED: 'Đã có', SOURCE_DRIVEN: 'Đã dựng, hiển thị khi có nguồn của mã', PARTIAL: 'Có một phần', NOT_ACTIVATED: 'Chưa bật (chờ xác minh và công thức)', NOT_IMPLEMENTED: 'Chưa có (cần nguồn)', NOT_APPLICABLE: 'Không áp dụng' };
export const NAV_IDS_ORIGINAL = ['gia', 'nganh', 'nhamay', 'h1', 'mang', 'ruiro', 'dhcd', 'bien', 'kqkd', 'q3', 'sotp', 'sotpB', 'kichban', 'doinhay'];

const SEM = 'Đơn vị, ý nghĩa kỳ (lengthReport/ttmType) và phạm vi hợp nhất của nguồn SSI chưa được xác minh (docs/FINANCIAL-SEMANTICS.md).';
const FACTS_BLOCKER = 'Chưa có facts có nguồn của mã này cho mục này. Mục đã được dựng để hiển thị ngay khi có (kèm ngày, kỳ, đơn vị, phạm vi và nguồn).';
const COMPANY = 'Cần tài liệu công bố chính thức của doanh nghiệp (báo cáo thường niên, thuyết minh BCTC, nghị quyết ĐHĐCĐ); chưa có nguồn đọc được trong kho dữ liệu hiện tại.';

export const SECTIONS = [
  { id: 'gia', nav: 'Giá & định giá', title: 'Giá 12 tháng, vùng giá và định giá hiện tại', status: STATUS.SOURCE_DRIVEN,
    summary: 'Biểu đồ giá đóng cửa QRW tối đa 12 tháng với vùng mua thường và đáy vùng sập tính từ đỉnh quý trước (ngưỡng riêng của mã, có phương pháp và cơ sở giá), đỉnh/đáy 12 tháng, vị trí hiện tại; vốn hoá, EPS, P/E, BVPS, P/B và giá hợp lý theo mô hình ngành, mỗi chỉ tiêu nêu riêng ngày giá, kỳ lợi nhuận và ngày số cổ phiếu.',
    needs: ['Ngưỡng rơi giá riêng của mã (hiệu chuẩn bằng scripts/calibrate-zones.mjs hoặc nhập thủ công có nguồn)', 'Báo cáo tài chính đã duyệt và bản ghi số cổ phiếu để tính vốn hoá, EPS, P/E, P/B'], blocker: 'Vùng giá cần ngưỡng của chính mã; định giá cần báo cáo tài chính đã duyệt (statements/<MÃ>.json).', sources: ['QRW prices/{TICKER}.json', 'zones/{TICKER}.json', 'statements/{TICKER}.json'] },
  { id: 'nganh', nav: 'So với ngành', title: 'So với doanh nghiệp cùng ngành', status: STATUS.SOURCE_DRIVEN,
    summary: 'Bảng so sánh mặc định theo ICB cấp 2 (có thể chọn ICB cấp 4 hoặc GICS): giá và ngày giá, vốn hoá, P/E, P/B, ROE, hiệu suất 1, 3, 6 và 12 tháng so với VN-Index tính đến ngày chung; cột, đơn vị, nguồn và mã bị loại được nêu rõ.',
    needs: ['market.json (xuất kèm --price-bars và --benchmark VNINDEX_1D.csv)', 'Phân loại ICB/GICS của snapshot FiTechTrade'], blocker: 'Cần market.json và phân loại ngành để dựng bảng.', sources: ['market.json', 'peers.json', 'FiTechTrade company-profile (ICB/GICS)'] },
  { id: 'nhamay', nav: 'Hoạt động & tài sản', title: 'Tài sản, đơn vị kinh doanh và công ty con', status: STATUS.SOURCE_DRIVEN,
    summary: 'Danh mục tài sản vận hành, đơn vị kinh doanh, công ty con/liên doanh phù hợp từng ngành.', needs: ['Danh sách công ty con, liên doanh, tài sản vận hành và công suất', 'Ngày và nguồn của từng thông tin'], blocker: FACTS_BLOCKER, sources: [] },
  { id: 'h1', nav: 'Kỳ báo cáo gần nhất', title: 'Kết quả kỳ báo cáo gần nhất', status: STATUS.SOURCE_DRIVEN,
    summary: 'Doanh thu, lợi nhuận, biên, tiền, nợ vay, vốn chủ và dòng tiền của kỳ gần nhất trong báo cáo đã duyệt, so với cùng kỳ năm trước trong cùng phạm vi hợp nhất; EPS công bố và EPS tính lại tách bạch.',
    needs: ['Báo cáo tài chính đã duyệt (statements/<MÃ>.json): kỳ, phạm vi hợp nhất, đơn vị, nguồn từng chỉ tiêu'], blocker: 'Chưa có báo cáo tài chính đã duyệt của mã này.', sources: ['statements/{TICKER}.json'] },
  { id: 'mang', nav: 'Theo mảng', title: 'Doanh thu và lợi nhuận theo mảng', status: STATUS.SOURCE_DRIVEN,
    summary: 'Cơ cấu doanh thu, lợi nhuận, biên theo mảng kinh doanh.', needs: ['Thuyết minh báo cáo bộ phận (doanh thu, lợi nhuận theo mảng, theo kỳ)'], blocker: FACTS_BLOCKER, sources: [] },
  { id: 'ruiro', nav: 'Rủi ro', title: 'Rủi ro cần theo dõi', status: STATUS.SOURCE_DRIVEN,
    summary: 'Rủi ro riêng của doanh nghiệp và ngành, có nguồn và ngày.', needs: ['Ý kiến kiểm toán/soát xét, thuyết minh rủi ro, cơ cấu sở hữu, sự kiện công bố'], blocker: FACTS_BLOCKER, sources: [] },
  { id: 'dhcd', nav: 'ĐHĐCĐ', title: 'Nghị quyết đại hội đồng cổ đông', status: STATUS.SOURCE_DRIVEN,
    summary: 'Kế hoạch kinh doanh, cổ tức, đầu tư và tiến độ theo nghị quyết.', needs: ['Nghị quyết và tài liệu ĐHĐCĐ của kỳ gần nhất (ngày, số, nội dung)'], blocker: FACTS_BLOCKER, sources: [] },
  { id: 'bien', nav: 'Động lực lợi nhuận', title: 'Động lực lợi nhuận theo ngành', status: STATUS.SOURCE_DRIVEN,
    summary: 'Cầu nối lợi nhuận trước thuế giữa hai kỳ cùng phạm vi (phân rã chính xác từ số đã công bố), thay đổi doanh thu/LNTT theo mảng và cấu phần dự phóng theo kịch bản; động lực khác nhau theo ngành (ngân hàng: lãi thuần, ngoài lãi, dự phòng).',
    needs: ['Hai kỳ báo cáo cùng phạm vi hợp nhất', 'Nhóm số liệu theo mảng của hai năm cùng cách phân loại (nếu muốn xem theo mảng)'], blocker: 'Cần ít nhất hai kỳ cùng loại, cùng phạm vi hợp nhất trong báo cáo đã duyệt. Giả định của PHP (TEU, HTIT) không áp dụng cho mã khác.', sources: ['statements/{TICKER}.json', 'facts/{TICKER}.json (segment_groups)'] },
  { id: 'kqkd', nav: 'KQKD theo kỳ', title: 'Kết quả kinh doanh theo kỳ', status: STATUS.SOURCE_DRIVEN,
    summary: 'Bảng và biểu đồ doanh thu, lợi nhuận, biên theo các kỳ của báo cáo đã duyệt kèm cột 12 tháng (TTM) khi ba kỳ cùng phạm vi; lịch sử SSI theo nhãn nguồn nằm dưới dạng thô, trong phần thu gọn.',
    needs: ['Báo cáo tài chính đã duyệt nhiều kỳ'], blocker: 'Chưa có báo cáo đã duyệt; chỉ có số SSI thô theo nhãn nguồn.', sources: ['statements/{TICKER}.json', 'fundamentals/{TICKER}.json'] },
  { id: 'q3', nav: 'Dự phóng', title: 'Dự phóng kỳ tới', status: STATUS.SOURCE_DRIVEN,
    summary: 'Cầu nối thực tế → dự phóng → ước tính theo kỳ gần nhất (nửa năm → cả năm, hoặc năm → năm sau) với giả định chỉnh được; EPS, P/E dự phóng và so với kế hoạch ĐHĐCĐ. Số ước tính luôn gắn nhãn, không bao giờ gọi là thực tế.',
    needs: ['Kỳ nền có doanh thu (hoặc thu nhập hoạt động) và LNST công ty mẹ', 'Giả định tăng trưởng và thay đổi biên (mặc định chưa duyệt, chỉnh ở Kịch bản)'], blocker: 'Chưa có kỳ nền trong báo cáo đã duyệt.', sources: ['statements/{TICKER}.json', 'facts (kế hoạch ĐHĐCĐ)'] },
  { id: 'sotp', nav: 'Định giá tổng hợp', title: 'Định giá tổng hợp theo phương pháp phù hợp ngành', status: STATUS.SOURCE_DRIVEN,
    summary: 'Doanh nghiệp: cộng từng phần (mảng × P/E, liên kết, NAV) trừ chiết khấu holding; ngân hàng/chứng khoán/bảo hiểm: P/B hợp lý theo ROE. Bảng thành phần, công thức, số cổ phiếu tại ngày giá, giá hợp lý mỗi cổ phiếu và chênh lệch so với giá.',
    needs: ['Nhóm số liệu theo mảng khớp tổng (doanh nghiệp) hoặc vốn chủ công ty mẹ và lợi nhuận (tài chính)', 'Bản ghi số cổ phiếu và hành động doanh nghiệp', 'Bội số/chi phí vốn (mặc định chưa duyệt, chỉnh được)'], blocker: 'Thiếu đầu vào có nguồn; mục nêu chính xác đầu vào nào còn thiếu.', sources: ['statements/{TICKER}.json', 'facts/{TICKER}.json'] },
  { id: 'sotpB', nav: 'Mô hình thay thế', title: 'Mô hình thay thế', status: STATUS.SOURCE_DRIVEN,
    summary: 'Phương pháp đối chiếu cùng đầu vào: EV/EBITDA hợp nhất (doanh nghiệp) hoặc P/E mục tiêu (tài chính), có danh sách khác biệt với phương pháp chính để không tính hai lần.',
    needs: ['EBITDA, tiền và nợ vay (doanh nghiệp) hoặc lợi nhuận công ty mẹ 12 tháng (tài chính)'], blocker: 'Thiếu đầu vào có nguồn; mục nêu đầu vào còn thiếu.', sources: ['statements/{TICKER}.json'] },
  { id: 'kichban', nav: 'Kịch bản', title: 'Kịch bản lợi nhuận và định giá', status: STATUS.SOURCE_DRIVEN,
    summary: 'Thận trọng / cơ sở / lạc quan và thanh trượt cho các biến của mô hình ngành; kéo thanh trượt đổi đồng thời dự phóng, hai mô hình định giá, chênh lệch so với giá và ma trận độ nhạy.',
    needs: ['Ít nhất một mô hình định giá chạy được'], blocker: 'Không có mô hình để nối thanh trượt.', sources: [] },
  { id: 'doinhay', nav: 'Độ nhạy', title: 'Độ nhạy giá hợp lý', status: STATUS.SOURCE_DRIVEN,
    summary: 'Ma trận hai trục số từ chính engine định giá, tô màu theo chênh lệch so với giá hiện tại, ô cơ sở viền đậm; đổi theo kịch bản.',
    needs: ['Ít nhất một mô hình định giá chạy được'], blocker: 'Không có mô hình để dựng ma trận.', sources: [] },
  { id: 'phuongphap', nav: 'Phương pháp & nguồn', title: 'Phương pháp, nguồn và ngày dữ liệu', status: STATUS.IMPLEMENTED,
    summary: 'Nguồn từng nhóm dữ liệu, ngày, cách tính các con số hiển thị và phân biệt số thực tế với ước tính.', needs: [], blocker: '', sources: ['manifest.json'] },
];
export function coverageSummary() {
  const by_status = {};
  for (const s of SECTIONS) by_status[s.status] = (by_status[s.status] || 0) + 1;
  return { total: SECTIONS.length, by_status, delivered_complete: by_status[STATUS.IMPLEMENTED] || 0, source_driven: by_status[STATUS.SOURCE_DRIVEN] || 0, partial: by_status[STATUS.PARTIAL] || 0 };
}
