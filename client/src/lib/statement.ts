import type { RentalRow, DisbursementRow } from "@shared/schema";

export type FeeBase = "total_income" | "sub_total";

export interface StatementInput {
  rentalRows: RentalRow[];
  disbursementRows: DisbursementRow[];
  managementFeePercent: number;
  managementFeeBase: FeeBase;
}

export interface StatementTotals {
  totalIncome: number;
  totalDisbursements: number;
  subTotal: number;
  managementFee: number;
  alreadyTransferred: number; // rent paid early / already transferred to landlord separately
  profitTransferable: number;
}

// Balance carried forward for a rental row = brought forward + demanded - paid
export function balanceCf(row: RentalRow): number {
  return round2((row.balanceBf || 0) + (row.rentDemanded || 0) - (row.rentPaid || 0));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeTotals(input: StatementInput): StatementTotals {
  // Total Income = ALL rent collected this period, including rent that was paid early
  // ("already transferred"). Early-paid rent still counts as income received.
  const totalIncome = round2(
    input.rentalRows.reduce((sum, r) => sum + (r.rentPaid || 0), 0)
  );
  // Rent that has already been transferred to the landlord separately (paid early).
  // This is shown as income above, then deducted at the bottom so the landlord
  // isn't paid twice.
  const alreadyTransferred = round2(
    input.rentalRows.reduce((sum, r) => sum + (r.transferred ? (r.rentPaid || 0) : 0), 0)
  );
  const totalDisbursements = round2(
    input.disbursementRows.reduce((sum, d) => sum + (d.invoiceAmount || 0), 0)
  );
  const subTotal = round2(totalIncome - totalDisbursements);
  const feeBaseAmount = input.managementFeeBase === "sub_total" ? subTotal : totalIncome;
  const managementFee = round2(feeBaseAmount * (input.managementFeePercent || 0) / 100);
  // Income Profit Transferable = Sub Total − Management Fee − Already Transferred (paid early)
  const profitTransferable = round2(subTotal - managementFee - alreadyTransferred);
  return { totalIncome, totalDisbursements, subTotal, managementFee, alreadyTransferred, profitTransferable };
}

export function gbp(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

// Show a dash for zero balances (matches the original statement style)
export function gbpOrDash(n: number): string {
  if (!n || round2(n) === 0) return "-";
  return gbp(n);
}

// pounds <-> pence helpers (tenant rent stored in pence)
export function penceToPounds(pence: number): number {
  return round2((pence || 0) / 100);
}
export function poundsToPence(pounds: number): number {
  return Math.round((pounds || 0) * 100);
}
