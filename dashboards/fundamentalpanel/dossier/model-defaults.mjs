// DEFAULT, UNREVIEWED assumption sets per sector. They exist so a model can run end-to-end and be inspected; they are NOT calibrated, sourced or approved,
// and every setup built from them carries assumption_status DEFAULT_ASSUMPTION_UNREVIEWED. Multiples are reference ranges to be replaced by a reviewed set
// (the editable assumption inputs of the scenario panel); nothing here is a recommendation. Fraction convention: 0.1 = 10%.
export const ASSUMPTION_STATUS = 'DEFAULT_ASSUMPTION_UNREVIEWED';
export const OPERATING_MULTIPLES = {
  default: { pe: { low: 9, base: 11, high: 13 }, ev_ebitda: { low: 6, base: 7.5, high: 9 }, rationale: 'Khoảng tham chiếu chung cho doanh nghiệp hoạt động; chưa hiệu chuẩn theo ngành.' },
  'Công nghệ Thông tin': { pe: { low: 11, base: 14, high: 17 }, ev_ebitda: { low: 7, base: 9, high: 11 }, rationale: 'Dải cao hơn mặc định cho nhóm công nghệ; chưa hiệu chuẩn.' },
  'Viễn thông': { pe: { low: 8, base: 10, high: 12 }, ev_ebitda: { low: 5, base: 6, high: 7 }, rationale: 'Dải thấp hơn cho viễn thông (vốn đầu tư lớn); chưa hiệu chuẩn.' },
  'Bất động sản': { pe: { low: 7, base: 9, high: 11 }, ev_ebitda: { low: 8, base: 10, high: 12 }, rationale: 'Phần P/E cho thu nhập thường xuyên; dự án nên khai báo thành phần NAV có nguồn.' },
};
export const FINANCIAL_DEFAULTS = {
  bank: { coe: { low: 0.15, base: 0.14, high: 0.13 }, growth: { low: 0.04, base: 0.05, high: 0.06 }, haircut: { low: 0.03, base: 0, high: 0 }, target_pe: { low: 7, base: 8, high: 9 }, earnings_growth: { low: 0.08, base: 0.12, high: 0.15 }, roe_spread: 0.02, rationale: 'ROE cơ sở lấy từ ROE cuối kỳ tính được; chi phí vốn và g là giả định mặc định.' },
  securities: { coe: { low: 0.17, base: 0.15, high: 0.14 }, growth: { low: 0.03, base: 0.04, high: 0.05 }, haircut: { low: 0.05, base: 0, high: 0 }, target_pe: { low: 9, base: 11, high: 13 }, earnings_growth: { low: 0.0, base: 0.1, high: 0.2 }, roe_spread: 0.03, rationale: 'ROE chứng khoán biến động theo chu kỳ nên biên low/high rộng hơn.' },
  insurance: { coe: { low: 0.15, base: 0.13, high: 0.12 }, growth: { low: 0.03, base: 0.04, high: 0.05 }, haircut: { low: 0.03, base: 0, high: 0 }, target_pe: { low: 10, base: 12, high: 14 }, earnings_growth: { low: 0.05, base: 0.1, high: 0.14 }, roe_spread: 0.02, rationale: 'Chưa có embedded value; dùng P/B theo ROE.' },
  financial_services: { coe: { low: 0.16, base: 0.14, high: 0.13 }, growth: { low: 0.03, base: 0.04, high: 0.05 }, haircut: { low: 0.03, base: 0, high: 0 }, target_pe: { low: 8, base: 10, high: 12 }, earnings_growth: { low: 0.05, base: 0.1, high: 0.15 }, roe_spread: 0.02, rationale: 'Mặc định chung cho dịch vụ tài chính.' },
};
