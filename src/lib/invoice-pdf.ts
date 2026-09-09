import { money, shortDate } from "@/lib/format";

export type InvoicePdfItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

export type InvoicePdfData = {
  invoice_number: string;
  customer_name: string;
  created_at: string;
  total: number;
  items: InvoicePdfItem[];
};

/** App palette (ZA Stock teal ledger) as RGB for jsPDF */
const TEAL: [number, number, number] = [15, 118, 110];
const INK: [number, number, number] = [24, 24, 27];
const SOFT: [number, number, number] = [82, 82, 91];
const LINE: [number, number, number] = [228, 228, 231];
const WASH: [number, number, number] = [244, 244, 245];
const WHITE: [number, number, number] = [255, 255, 255];

export async function downloadInvoicePdf(invoice: InvoicePdfData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 48;
  const right = pageW - 48;
  const contentW = right - left;

  // Top accent bar
  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pageW, 8, "F");

  let y = 48;

  // Title block (right) — commercial invoice style
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...TEAL);
  doc.text("INVOICE", right, y, { align: "right" });

  y += 22;
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(invoice.invoice_number, right, y, { align: "right" });

  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...SOFT);
  doc.text(shortDate(invoice.created_at), right, y, { align: "right" });

  // BILL TO
  y = 48;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...TEAL);
  doc.text("BILL TO", left, y);

  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  const billLines = doc.splitTextToSize(invoice.customer_name, contentW * 0.45);
  doc.text(billLines, left, y);
  y = Math.max(y + billLines.length * 14, 110);

  y += 20;

  // Table header
  const colDesc = left;
  const colQty = left + contentW * 0.52;
  const colUnit = left + contentW * 0.7;
  const colTotal = right;
  const rowH = 28;

  doc.setFillColor(...TEAL);
  doc.rect(left, y, contentW, rowH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  const headerY = y + 18;
  doc.text("Description", colDesc + 10, headerY);
  doc.text("Qty", colQty, headerY, { align: "right" });
  doc.text("Unit Price", colUnit, headerY, { align: "right" });
  doc.text("Total", colTotal - 10, headerY, { align: "right" });

  y += rowH;

  // Line items
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let alt = false;

  for (const item of invoice.items) {
    const nameLines = doc.splitTextToSize(item.product_name, contentW * 0.48);
    const blockH = Math.max(rowH, nameLines.length * 13 + 14);

    if (y + blockH > pageH - 160) {
      doc.addPage();
      doc.setFillColor(...TEAL);
      doc.rect(0, 0, pageW, 8, "F");
      y = 48;
      alt = false;
    }

    if (alt) {
      doc.setFillColor(...WASH);
      doc.rect(left, y, contentW, blockH, "F");
    }

    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.5);
    doc.line(left, y + blockH, right, y + blockH);

    const textY = y + 17;
    doc.setTextColor(...INK);
    doc.text(nameLines, colDesc + 10, textY);
    doc.setFont("helvetica", "normal");
    doc.text(String(item.quantity), colQty, textY, { align: "right" });
    doc.text(money(item.unit_price), colUnit, textY, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(money(item.line_total), colTotal - 10, textY, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += blockH;
    alt = !alt;
  }

  y += 20;

  // Totals block (right-aligned, sample style: Subtotal / Tax / Total)
  const totalsX = right - 200;
  const labelX = totalsX;
  const valueX = right;

  const drawTotalRow = (label: string, value: string, bold = false, accent = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(...(accent ? TEAL : INK));
    doc.text(label, labelX, y);
    doc.text(value, valueX, y, { align: "right" });
    y += bold ? 22 : 18;
  };

  doc.setDrawColor(...LINE);
  doc.line(totalsX, y - 10, right, y - 10);

  drawTotalRow("Subtotal", money(invoice.total));
  drawTotalRow("Tax (0%)", money(0));

  doc.setFillColor(...TEAL);
  doc.rect(totalsX - 8, y - 14, right - totalsX + 8, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text("Total", labelX, y + 4);
  doc.text(money(invoice.total), valueX, y + 4, { align: "right" });
  y += 44;

  // Closing note
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...SOFT);
  doc.text("Thank you for your business.", left, y);
  y += 14;
  doc.setFontSize(9);
  doc.text("Please retain this invoice for your records.", left, y);

  // Footer
  doc.setDrawColor(...LINE);
  doc.line(left, pageH - 36, right, pageH - 36);
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text(invoice.invoice_number, left, pageH - 22);
  doc.text("Page 1", right, pageH - 22, { align: "right" });

  doc.save(`${invoice.invoice_number}.pdf`);
}
