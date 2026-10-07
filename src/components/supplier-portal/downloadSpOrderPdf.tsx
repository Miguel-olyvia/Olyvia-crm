// Portal do Fornecedor (F3.2) — PDF da encomenda a partir de sp_get_order.
// Reutiliza o PurchaseOrderPDFDocument do CRM através de um adaptador
// (contrato-f32, secção 5.1). Só usa dados devolvidos pela RPC: nunca lê
// tabelas e nunca recebe `notes` internas (a RPC não as devolve).
import type { SpOrderDetail } from "@/lib/supplierPortal/spRpc";

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    // CORS/rede: usa-se o URL tal como está.
    return null;
  }
}

/** Gera e descarrega o PDF. As bibliotecas de PDF só são carregadas aqui. */
export async function downloadSpOrderPdf(o: SpOrderDetail): Promise<void> {
  const [{ pdf }, { PurchaseOrderPDFDocument }] = await Promise.all([
    import("@react-pdf/renderer"),
    import("@/components/PurchaseOrderPDFDocument"),
  ]);

  const logo = o.company.logo_url ? ((await toDataUrl(o.company.logo_url)) ?? o.company.logo_url) : null;

  const order = {
    order_number: o.order_number,
    order_date: o.order_date,
    expected_delivery: o.expected_delivery,
    status: o.order_status,
    supplier_notes: o.supplier_notes,
  };
  const company = {
    name: o.company.name,
    vat: o.company.nif,
    address: o.company.address,
    phone: o.company.phone,
    logo_url: logo,
  };
  const items = o.lines.map((l) => ({
    ...l,
    uom: l.uom_code ? { code: l.uom_code } : null,
    products: l.base_uom_code ? { uom: { code: l.base_uom_code } } : null,
  }));

  const blob = await pdf(
    <PurchaseOrderPDFDocument order={order} company={company} supplier={o.supplier} items={items} user={o.sent_by} />,
  ).toBlob();

  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = `Encomenda_${(o.order_number || o.purchase_order_id).replace(/[^\w.-]+/g, "_")}.pdf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
