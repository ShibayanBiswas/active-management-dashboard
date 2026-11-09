import type ExcelJS from "exceljs";

/** A download cell. Numbers and dates stay native Excel types. */
export type ExcelCell = string | number | Date | null;

const RUPEE_HEADERS = new Set([
  "Unwind Quote Amount",
  "Premium Outflow",
  "Face Value",
  "Initial Price Per Debenture",
  "Product Premium Amount",
  "Premium Outflow Amount",
  "Expected Maturity Quote",
  "Net Mobilisation",
  "Expected Amount",
  "Unwind Amount",
  "Amount with NBFC",
  "NBFC Grown Value",
  "Premium Credited",
  "Premium Grown Value",
  "Difference",
  "Total Funds For Margin",
  "Amount with NBFC Rupees",
  "NBFC Grown Value Rupees",
  "Premium Grown Value Rupees",
  "Unwind Value",
  "Book Unwind Per Debenture",
]);

const PERCENT_HEADERS = new Set([
  "Product Internal Rate of Return",
  "Client Internal Rate of Return",
  "Residual Internal Rate of Return",
  "Contingent Coupon",
  "Inbuilt",
  "Transaction Cost",
  "Issuance Cost",
  "Margin Cost",
  "Unwind Quote Percent",
  "Amount with NBFC Percent",
  "NBFC Grown Value Percent",
  "Premium Credited Percent",
  "Premium Grown Value Percent",
  "Current Premium Outflow Percent",
  "Bid Ask Spread",
  "Forward Growth Rate",
  "Discount Yield",
  "Implied Volatility",
  "Volatility Bump",
  "Bid Offer Spread",
  "Product Discounting Rate",
  "Premium Discounting Rate",
]);

const INTEGER_HEADERS = new Set([
  "Sr. No.",
  "Tenor",
  "Invested Tenor",
  "Residual Tenor",
  "Residual Tenure",
  "Number of Debentures",
]);

const DATE_HEADERS = new Set([
  "Date As Of Today",
  "Delta Date",
  "Allotment Date",
  "Maturity Date",
  "Option Expiry Date",
  "Unwinding Date",
]);

export function excelNumFmt(header: string): string | undefined {
  if (DATE_HEADERS.has(header) || /\bdate\b/i.test(header)) return "dd-mmm-yyyy";
  if (RUPEE_HEADERS.has(header)) return '"₹"#,##0.00';
  if (PERCENT_HEADERS.has(header)) return "0.00%";
  if (header === "Total Debentures in Issue") return "#,##0.##########";
  if (INTEGER_HEADERS.has(header)) return "#,##0";
  return "#,##0.00";
}

export function writeExcelCell(
  cell: ExcelJS.Cell,
  value: ExcelCell,
  header?: string,
): void {
  if (value == null || value === "" || value === "-") {
    cell.value = "-";
    return;
  }
  if (value instanceof Date) {
    cell.value = Number.isNaN(value.getTime()) ? "-" : value;
    if (!Number.isNaN(value.getTime())) cell.numFmt = "dd-mmm-yyyy";
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    cell.value = Object.is(value, -0) ? 0 : value;
    const fmt = header ? excelNumFmt(header) : "#,##0.00";
    if (fmt && fmt !== "dd-mmm-yyyy") cell.numFmt = fmt;
    return;
  }
  cell.value = String(value);
}
