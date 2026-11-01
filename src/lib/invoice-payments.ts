export type PaymentStatus = "unpaid" | "partial" | "paid";

export function amountOwing(total: number, amountPaid: number): number {
  const owing = Number(total) - Number(amountPaid);
  return owing > 0 ? owing : 0;
}

export function paymentStatus(total: number, amountPaid: number): PaymentStatus {
  const paid = Number(amountPaid);
  const tot = Number(total);
  if (paid <= 0) return "unpaid";
  if (paid >= tot) return "paid";
  return "partial";
}

export function paymentStatusLabel(status: PaymentStatus): string {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  return "Unpaid";
}
