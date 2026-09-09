import { money, shortDate } from "@/lib/format";
import type { PriceBasis } from "@/lib/products";

export type InvoicePdfItem = {
  product_name: string;
  quantity: number;
  unit_price: number;
  case_price: number;
  price_basis: PriceBasis;
  line_total: number;
};

export type InvoicePdfData = {
  invoice_number: string;
  customer_name: string;
  created_at: string;
  total: number;
  delivery_cost: number;
  items: InvoicePdfItem[];
};

/** Sweet for You Salvage palette as RGB for jsPDF */
const ROSE: [number, number, number] = [225, 29, 72];
const ROSE_DEEP: [number, number, number] = [190, 18, 60];
const INK: [number, number, number] = [24, 24, 27];
const SOFT: [number, number, number] = [82, 82, 91];
const LINE: [number, number, number] = [228, 228, 231];
const WASH: [number, number, number] = [255, 241, 242];
const WHITE: [number, number, number] = [255, 255, 255];
const COMPANY = "Sweet for You Salvage";

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/brand/sfy-logo.jpg");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadInvoicePdf(invoice: InvoicePdfData) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const left = 48;
  const right = pageW - 48;
  const contentW = right - left;
  const logoData = await loadLogoDataUrl();

  // Top accent bar
  doc.setFillColor(...ROSE);
  doc.rect(0, 0, pageW, 8, "F");

  let y = 36;

  // Company brand (left) — large logo so mark text stays readable
  const logoSize = 96;
  if (logoData) {
    doc.addImage(logoData, "JPEG", left, y, logoSize, logoSize);
  }

  // Title block (right)
  const titleY = y + 22;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.setTextColor(...ROSE_DEEP);
  doc.text("INVOICE", right, titleY, { align: "right" });

  doc.setFontSize(12);
  doc.setTextColor(...INK);
  doc.text(invoice.invoice_number, right, titleY + 22, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...SOFT);
  doc.text(shortDate(invoice.created_at), right, titleY + 38, { align: "right" });

  y = logoData ? y + logoSize + 24 : 100;

  // BILL TO
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...ROSE_DEEP);
  doc.text("BILL TO", left, y);

  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...INK);
  const billLines = doc.splitTextToSize(invoice.customer_name, contentW * 0.45);
  doc.text(billLines, left, y);
  y = Math.max(y + billLines.length * 14, 130);

  y += 20;

  // Table columns — shared right edges so headers and values line up
  const padX = 10;
  const colDesc = left + padX;
  const colQty = left + contentW * 0.5;
  const colUnit = left + contentW * 0.66;
  const colCase = left + contentW * 0.82;
  const colTotal = right - padX;
  const descMaxW = colQty - colDesc - 12;
  const rowH = 28;

  doc.setFillColor(...ROSE);
  doc.rect(left, y, contentW, rowH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  const headerY = y + 18;
  doc.text("Description", colDesc, headerY);
  doc.text("Qty", colQty, headerY, { align: "right" });
  doc.text("Unit", colUnit, headerY, { align: "right" });
  doc.text("Case", colCase, headerY, { align: "right" });
  doc.text("Total", colTotal, headerY, { align: "right" });

  y += rowH;

  // Line items
  doc.setFontSize(9);
  let alt = false;

  for (const item of invoice.items) {
    const basisNote =
      item.price_basis === "case" ? " (case price)" : " (unit price)";
    const nameLines = doc.splitTextToSize(
      `${item.product_name}${basisNote}`,
      descMaxW,
    );
    const blockH = Math.max(rowH, nameLines.length * 12 + 14);

    if (y + blockH > pageH - 160) {
      doc.addPage();
      doc.setFillColor(...ROSE);
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
    doc.setFont("helvetica", "normal");
    doc.text(nameLines, colDesc, textY);
    doc.text(String(item.quantity), colQty, textY, { align: "right" });
    doc.text(money(item.unit_price), colUnit, textY, { align: "right" });
    doc.text(
      item.case_price > 0 ? money(item.case_price) : "—",
      colCase,
      textY,
      { align: "right" },
    );
    doc.setFont("helvetica", "bold");
    doc.text(money(item.line_total), colTotal, textY, { align: "right" });
    doc.setFont("helvetica", "normal");

    y += blockH;
    alt = !alt;
  }

  y += 20;

  const totalsX = right - 200;
  const labelX = totalsX;
  const valueX = right;

  const drawTotalRow = (label: string, value: string, bold = false, accent = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(...(accent ? ROSE_DEEP : INK));
    doc.text(label, labelX, y);
    doc.text(value, valueX, y, { align: "right" });
    y += bold ? 22 : 18;
  };

  doc.setDrawColor(...LINE);
  doc.line(totalsX, y - 10, right, y - 10);

  drawTotalRow("Subtotal", money(invoice.total - (invoice.delivery_cost || 0)));
  if ((invoice.delivery_cost || 0) > 0) {
    drawTotalRow("Delivery", money(invoice.delivery_cost));
  }

  doc.setFillColor(...ROSE);
  doc.rect(totalsX - 8, y - 14, right - totalsX + 8, 28, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...WHITE);
  doc.text("Total", labelX, y + 4);
  doc.text(money(invoice.total), valueX, y + 4, { align: "right" });
  y += 44;

  if (y > pageH - 160) {
    doc.addPage();
    doc.setFillColor(...ROSE);
    doc.rect(0, 0, pageW, 8, "F");
    y = 48;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...ROSE_DEEP);
  doc.text("BANKING DETAILS", left, y);
  y += 16;

  const bankRows: [string, string][] = [
    ["Account holder", "Sweet for you"],
    ["Bank", "Capitec business"],
    ["Account number", "2572387049"],
    ["Account type", "Business account"],
    ["Reference", "Store name"],
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const [label, value] of bankRows) {
    doc.setTextColor(...SOFT);
    doc.text(label, left, y);
    doc.setTextColor(...INK);
    doc.setFont("helvetica", "bold");
    doc.text(value, left + 120, y);
    doc.setFont("helvetica", "normal");
    y += 15;
  }

  y += 12;
  doc.setFontSize(10);
  doc.setTextColor(...SOFT);
  doc.text("Thank you for your business.", left, y);
  y += 14;
  doc.setFontSize(9);
  doc.text("Please retain this invoice for your records.", left, y);

  doc.setDrawColor(...LINE);
  doc.line(left, pageH - 36, right, pageH - 36);
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text(COMPANY, left, pageH - 22);
  doc.text(invoice.invoice_number, right, pageH - 22, { align: "right" });

  doc.save(`${invoice.invoice_number}.pdf`);
}
