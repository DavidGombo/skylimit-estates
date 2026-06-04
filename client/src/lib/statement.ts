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
  const totalIncome = round2(
    input.rentalRows.reduce((sum, r) => sum + (r.rentPaid || 0), 0)
  );
  const totalDisbursements = round2(
    input.disbursementRows.reduce((sum, d) => sum + (d.invoiceAmount || 0), 0)
  );
  const subTotal = round2(totalIncome - totalDisbursements);
  const feeBaseAmount = input.managementFeeBase === "sub_total" ? subTotal : totalIncome;
  const managementFee = round2(feeBaseAmount * (input.managementFeePercent || 0) / 100);
  const profitTransferable = round2(subTotal - managementFee);
  return { totalIncome, totalDisbursements, subTotal, managementFee, profitTransferable };
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
