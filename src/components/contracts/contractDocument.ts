import DOMPurify from "dompurify";
import { supabase } from "@/integrations/supabase/client";
import { substituteVariables, type ContractVariableData } from "@/utils/contractVariables";
import type { DocumentSettings } from "@/hooks/useDocumentSettings";
import { renderContractHeaderHtml } from "./contractHeader";
import {
  buildItemsTableModel,
  type ItemsTableLine,
  type ItemsTableModel,
} from "@/utils/documentTemplate/buildItemsTableModel";
import {
  computeFormulaResult,
  formatFormulaResult,
  type FormulaFormat,
  type FormulaOperation,
} from "@/utils/contracts/contractFormulaFields";

const DEFAULT_DOCUMENT_SETTINGS: Omit<DocumentSettings, "organization_id"> = {
  logo_url: null,
  primary_color: "#7C3AED",
  font_family: "Arial",
  header_layout: "left",
  show_nif: true,
  show_address: true,
  show_phone: true,
  show_email: true,
  show_website: false,
  footer_text: null,
  show_footer: true,
  show_page_numbers: true,
  margin_top: 20,
  margin_bottom: 20,
  margin_left: 20,
  margin_right: 20,
  page_size: "A4",
  page_orientation: "portrait",
  header_show_separator: true,
  company_name_override: null,
  company_website: null,
  table_header_color: null,
  logo_size: "medium",
  header_style: "simple",
  contract_block_show: true,
};

/**
 * Faz spread do JSONB `extra_settings` para o nível superior, à semelhança
 * do `flattenRow` em `useDocumentSettings.ts`. Garante que o preview e o PDF
 * usam exactamente o mesmo conjunto de definições.
 */
function flattenSettingsRow(row: any): Record<string, any> {
  if (!row || typeof row !== "object") return {};
  const { extra_settings, ...cols } = row as any;
  return { ...cols, ...(extra_settings || {}) };
}

/**
 * Remove os "chips" visuais que o editor de variáveis envolve à volta dos
 * valores guardados no `contract_body_html` (ex.: `<span class="bg-primary/20
 * text-primary px-1 rounded text-sm font-mono">...</span>`). Mantém o texto
 * interior e devolve HTML sem o destaque roxo. Usar apenas em render final
 * (preview e PDF) — o editor continua a mostrar os chips.
 */
export function stripVariableChips(html: string): string {
  if (!html) return html;
  if (typeof document === "undefined") {
    // Fallback (SSR/edge): regex simples para os spans com bg-primary.
    return html.replace(
      /<span[^>]*class="[^"]*bg-primary\/20[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
      "$1",
    );
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  const selector = 'span[class*="bg-primary/20"], span.bg-primary\\/20';
  const matches = container.querySelectorAll<HTMLElement>(selector);
  matches.forEach((node) => {
    const parent = node.parentNode;
    if (!parent) return;
    while (node.firstChild) parent.insertBefore(node.firstChild, node);
    parent.removeChild(node);
  });
  return container.innerHTML;
}

/**
 * Substitui o bloco final estático de assinatura
 *   "A PRIMEIRA CONTRATANTE … O SEGUNDO CONTRATANTE"
 * pelo nome/cargo do signatário escolhido na minuta. Conservador: só toca
 * em elementos curtos (<220 chars) que contenham ambas as etiquetas — assim
 * cláusulas que mencionem "A PRIMEIRA CONTRATANTE" no texto ficam intactas.
 * Se já não houver bloco a substituir (foi reescrito manualmente ou já usa
 * {{signatario_*}}), devolve o HTML original.
 */
export function injectSignatoryIntoSignatureBlock(
  html: string,
  signatoryName?: string | null,
  signatoryRole?: string | null,
): string {
  if (!html) return html;
  const name = (signatoryName || "").trim();
  if (!name) return html;
  const cargo = (signatoryRole || "").trim();
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Remove um parágrafo de underscores/traços imediatamente antes do bloco
  // de assinatura (a injeção desenha as suas próprias linhas).
  const stripPrecedingUnderscoreLineSSR = (src: string): string =>
    src.replace(
      /<p\b[^>]*>(?:[\s\u00A0_·\-–—]|&nbsp;|<br\s*\/?>)*<\/p>\s*(?=<(?:p|div)\b[^>]*>[\s\S]*?A PRIMEIRA CONTRATANTE[\s\S]*?O SEGUNDO CONTRATANTE)/gi,
      "",
    );

  // Fallback SSR — usa regex sobre <p>… A PRIMEIRA CONTRATANTE … O SEGUNDO CONTRATANTE …</p>
  if (typeof document === "undefined") {
    const cleaned = stripPrecedingUnderscoreLineSSR(html);
    return cleaned.replace(
      /<(p|div)\b([^>]*)>([\s\S]*?A PRIMEIRA CONTRATANTE[\s\S]*?O SEGUNDO CONTRATANTE[\s\S]*?)<\/\1>/gi,
      (match, tag: string, attrs: string, inner: string) => {
        if (inner.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length > 220) return match;
        return `<${tag}${attrs}>
          <span style="display:inline-block;width:48%;vertical-align:top;text-align:left;">
            <span style="display:block;border-top:1px solid #111;width:92%;height:1px;margin:0 0 6px 0;"></span>
            <strong>${esc(name)}</strong>${cargo ? `<br/><span style="color:#6b7280;font-size:0.92em;">${esc(cargo)}</span>` : ""}<br/>
            <span>A PRIMEIRA CONTRATANTE</span>
          </span>
          <span style="display:inline-block;width:48%;vertical-align:top;text-align:left;">
            <span style="display:block;border-top:1px solid #111;width:92%;height:1px;margin:0 0 6px 0;"></span>
            <span>O SEGUNDO CONTRATANTE</span>
          </span>
        </${tag}>`;
      },
    );
  }

  const template = document.createElement("template");
  template.innerHTML = html;
  const candidates = Array.from(template.content.querySelectorAll("p, div, td"));
  const target = candidates.find((el) => {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    return (
      text.includes("A PRIMEIRA CONTRATANTE") &&
      text.includes("O SEGUNDO CONTRATANTE") &&
      text.length < 220
    );
  });
  if (!target) return html;

  // Remover até 2 elementos anteriores que contenham apenas underscores/
  // traços/espaços/<br> (linhas de assinatura duplicadas do template).
  const isDecorativeLine = (el: Element | null): boolean => {
    if (!el) return false;
    if (!/^(P|DIV)$/.test(el.tagName)) return false;
    const raw = (el.textContent || "").replace(/\u00A0/g, " ");
    const stripped = raw.replace(/[\s_·\-–—]/g, "");
    return stripped.length === 0;
  };
  for (let i = 0; i < 2; i += 1) {
    const prev = target.previousElementSibling;
    if (isDecorativeLine(prev)) prev!.remove();
    else break;
  }

  target.innerHTML = `
      <span style="display:inline-block;width:48%;vertical-align:top;text-align:left;">
        <span style="display:block;border-top:1px solid #111;width:92%;height:1px;margin:0 0 6px 0;"></span>
        <strong>${esc(name)}</strong>${cargo ? `<br/><span style="color:#6b7280;font-size:0.92em;">${esc(cargo)}</span>` : ""}<br/>
        <span>A PRIMEIRA CONTRATANTE</span>
      </span>
      <span style="display:inline-block;width:48%;vertical-align:top;text-align:left;">
        <span style="display:block;border-top:1px solid #111;width:92%;height:1px;margin:0 0 6px 0;"></span>
        <span>O SEGUNDO CONTRATANTE</span>
      </span>`;
  return template.innerHTML;
}


/**
 * Carrega nome + cargo do signatário escolhido numa minuta (`signatory_user_id`,
 * `signatory_role_id`). Devolve null se a minuta não tem signatário definido.
 */
export async function fetchTemplateSignatory(templateId: string | null | undefined): Promise<{ name: string; roleName: string } | null> {
  if (!templateId) return null;
  const { data: tpl } = await (supabase as any)
    .from("client_contract_templates")
    .select("signatory_user_id, signatory_role_id")
    .eq("id", templateId)
    .maybeSingle();
  if (!tpl?.signatory_user_id) return null;
  const [{ data: u }, { data: r }] = await Promise.all([
    (supabase as any).from("anew_users").select("name").eq("id", tpl.signatory_user_id).maybeSingle(),
    tpl.signatory_role_id
      ? (supabase as any).from("anew_roles").select("name").eq("id", tpl.signatory_role_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { name: u?.name || "", roleName: r?.name || "" };
}

interface ResolvedContractDocument {
  bodyHtml: string;
  variableData: ContractVariableData;
  organization: any;
  settings: DocumentSettings;
  companyName: string;
  headerLineOne: string;
  headerLineTwo: string;
  pageWidth: string;
  pageHeight: string;
  pageCssSize: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseNumericAmount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function getPageDimensions(pageSize?: string, orientation?: string) {
  const normalizedSize = (pageSize || "A4").toUpperCase();
  const isLandscape = orientation === "landscape";

  if (normalizedSize === "LETTER") {
    return isLandscape
      ? { pageWidth: "279.4mm", pageHeight: "215.9mm", pageCssSize: "letter landscape" }
      : { pageWidth: "215.9mm", pageHeight: "279.4mm", pageCssSize: "letter portrait" };
  }

  return isLandscape
    ? { pageWidth: "297mm", pageHeight: "210mm", pageCssSize: "A4 landscape" }
    : { pageWidth: "210mm", pageHeight: "297mm", pageCssSize: "A4 portrait" };
}

async function fetchPrimaryFiscalEntity(entityId: string): Promise<{ nif?: string; commercial_name?: string | null; country_code?: string | null }> {
  const { data: fiscalLinks, error: fiscalLinkError } = await (supabase as any)
    .from("anew_entity_fiscal_entities")
    .select("fiscal_entity_id")
    .eq("entity_id", entityId)
    .order("is_primary", { ascending: false })
    .limit(1);

  if (fiscalLinkError || !fiscalLinks?.[0]?.fiscal_entity_id) return {};

  const { data: fiscalEntity, error: fiscalEntityError } = await (supabase as any)
    .from("fiscal_entities")
    .select("nif, commercial_name, country_code")
    .eq("id", fiscalLinks[0].fiscal_entity_id)
    .maybeSingle();

  if (fiscalEntityError || !fiscalEntity) return {};

  return {
    nif: String(fiscalEntity.nif || "").trim(),
    commercial_name: fiscalEntity.commercial_name,
    country_code: fiscalEntity.country_code,
  };
}

export async function gatherContractData(contract: any, orgId?: string): Promise<ContractVariableData> {
  const data: ContractVariableData = {
    contrato_numero: contract.contract_number || "",
    contrato_valor: parseNumericAmount(contract.total_value) ?? 0,
    contrato_data_inicio: contract.start_date,
    contrato_data_fim: contract.end_date,
  };




  if (orgId) {
    const [orgRes, orgAddrRes] = await Promise.all([
      (supabase as any).from("anew_organizations").select("name, entity_id, metadata, phone").eq("id", orgId).single(),
      (supabase as any)
        .from("anew_org_addresses")
        .select("address_id, is_fiscal, anew_addresses(*)")
        .eq("org_id", orgId)
        .is("valid_to", null)
        .order("is_fiscal", { ascending: false })
        .limit(1),
    ]);
    if (orgRes.data) {
      data.empresa_nome = orgRes.data.name;
      // Resolve NIF via fiscal entity linked to org's entity (canonical), with metadata fallback
      if (orgRes.data.entity_id) {
        const [orgFiscalEntity, orgPhoneRes, orgEmailRes, orgEntAddrRes] = await Promise.all([
          fetchPrimaryFiscalEntity(orgRes.data.entity_id),
          (supabase as any).from("anew_entity_phones").select("phone_number").eq("entity_id", orgRes.data.entity_id).order("is_primary", { ascending: false }).limit(1),
          (supabase as any).from("anew_entity_emails").select("email").eq("entity_id", orgRes.data.entity_id).order("is_primary", { ascending: false }).limit(1),
          (supabase as any).from("anew_entity_addresses").select("is_primary, anew_addresses(*)").eq("entity_id", orgRes.data.entity_id).order("is_primary", { ascending: false }).limit(1),
        ]);
        const nif = orgFiscalEntity?.nif;
        if (nif) data.empresa_nif = nif;
        (data as any).empresa_telefone = orgRes.data.phone || orgPhoneRes?.data?.[0]?.phone_number || orgRes.data.metadata?.phone || "";
        (data as any).empresa_email = orgEmailRes?.data?.[0]?.email || orgRes.data.metadata?.email || "";
        // Fallback de morada via entidade quando não há anew_org_addresses (válida)
        const orgAddrJoined = orgAddrRes.data?.[0]?.anew_addresses
          ? [orgAddrRes.data[0].anew_addresses.street, orgAddrRes.data[0].anew_addresses.number, orgAddrRes.data[0].anew_addresses.postal_code, orgAddrRes.data[0].anew_addresses.city]
              .map((v: any) => (v == null ? "" : String(v).trim()))
              .filter(Boolean)
              .join(", ")
          : "";
        if (!orgAddrJoined && orgEntAddrRes?.data?.[0]?.anew_addresses) {
          const a = orgEntAddrRes.data[0].anew_addresses;
          data.empresa_morada = [a.street, a.number, a.postal_code, a.city]
            .map((v: any) => (v == null ? "" : String(v).trim()))
            .filter(Boolean)
            .join(", ");
        }
      }
      if (!data.empresa_nif) {
        data.empresa_nif = orgRes.data.metadata?.vat || orgRes.data.metadata?.nif || "";
      }
      (data as any).empresa_website = orgRes.data.metadata?.website || "";
      // Último fallback: morada em metadata
      if (!data.empresa_morada && orgRes.data.metadata?.address) {
        data.empresa_morada = String(orgRes.data.metadata.address);
      }
    }
    if (orgAddrRes.data?.[0]?.anew_addresses) {
      const a = orgAddrRes.data[0].anew_addresses;
      const joined = [a.street, a.number, a.postal_code, a.city]
        .map((v: any) => (v == null ? "" : String(v).trim()))
        .filter(Boolean)
        .join(", ");
      if (joined) data.empresa_morada = joined;
    }
  }

  if (contract.entity_id) {
    const [entityRes, emailRes, phoneRes, addrRes, fiscalEntity] = await Promise.all([
      (supabase as any).from("anew_entities").select("display_name, first_name, last_name").eq("id", contract.entity_id).single(),
      (supabase as any).from("anew_entity_emails").select("email").eq("entity_id", contract.entity_id).eq("is_primary", true).limit(1),
      (supabase as any).from("anew_entity_phones").select("phone_number").eq("entity_id", contract.entity_id).eq("is_primary", true).limit(1),
      (supabase as any).from("anew_entity_addresses").select("is_primary, anew_addresses(*)").eq("entity_id", contract.entity_id).order("is_primary", { ascending: false }).limit(1),
      fetchPrimaryFiscalEntity(contract.entity_id),
    ]);

    const fullName = [entityRes.data?.first_name, entityRes.data?.last_name]
      .filter(Boolean).join(" ").trim();
    data.cliente_nome = entityRes.data?.display_name || fullName || "";
    data.cliente_email = emailRes.data?.[0]?.email || "";
    data.cliente_telefone = phoneRes.data?.[0]?.phone_number || "";

    // birth_date não existe em anew_entities; cliente_data_nascimento não é resolvido aqui.


    if (addrRes.data?.[0]?.anew_addresses) {
      const a = addrRes.data[0].anew_addresses;
      data.cliente_morada = [a.street, a.number, a.postal_code, a.city].filter(Boolean).join(", ");
      (data as any).cliente_localidade = [a.postal_code, a.city].filter(Boolean).join(" ");
    }

    if (fiscalEntity?.nif) {
      data.cliente_nif = fiscalEntity.nif;
    }

    // Resolve custom contract variables: match each org custom variable key
    // against the most recent lead's field_values for this entity. Falls back
    // to the variable's default_value when not present.
    if (orgId) {
      const [customVarsRes, leadRes] = await Promise.all([
        (supabase as any)
          .from("custom_contract_variables")
          .select("variable_key, default_value, linked_field_key")
          .eq("organization_id", orgId)
          .eq("is_active", true),
        (supabase as any)
          .from("anew_leads")
          .select("field_values, updated_at")
          .eq("entity_id", contract.entity_id)
          .eq("organization_id", orgId)
          .order("updated_at", { ascending: false })
          .limit(1),
      ]);
      const fieldValues = (leadRes?.data?.[0]?.field_values || {}) as Record<string, any>;
      const customVars = (customVarsRes?.data || []) as Array<{ variable_key: string; default_value: string | null; linked_field_key: string | null }>;
      for (const v of customVars) {
        const bareKey = String(v.variable_key || "").replace(/^\{\{|\}\}$/g, "").trim();
        if (!bareKey) continue;
        let finalValue = "";
        if (v.linked_field_key) {
          const raw = fieldValues[v.linked_field_key];
          const fromLead = raw == null ? "" : (Array.isArray(raw) ? raw.join(", ") : String(raw));
          finalValue = fromLead || v.default_value || "";
        } else {
          finalValue = v.default_value || "";
        }
        if (finalValue) (data as any)[bareKey] = finalValue;
      }
    }
  }


  // Signatários (Corte 2B): linhas de client_contract_parties com is_signatory=true
  if (contract.id) {
    const { data: parties } = await (supabase as any)
      .from("client_contract_parties")
      .select("signing_name, signing_email, role, signing_order")
      .eq("contract_id", contract.id)
      .eq("is_signatory", true)
      .order("signing_order", { ascending: true });
    if (Array.isArray(parties) && parties.length > 0) {
      data.signatarios = parties.map((p: any, idx: number) => ({
        nome: String(p.signing_name || "").trim(),
        email: String(p.signing_email || "").trim(),
        papel: String(p.role || "").trim(),
        ordem: typeof p.signing_order === "number" ? p.signing_order : idx + 1,
      }));
    }
  }

  if (contract.proposal_id) {
    const { data: proposal } = await (supabase as any)
      .from("proposals")
      .select("title, proposal_number, total_value, created_at")
      .eq("id", contract.proposal_id)
      .single();
    data.proposta_numero = proposal?.proposal_number || proposal?.title || "";
    const proposalValue = parseNumericAmount(proposal?.total_value);
    if (proposalValue != null) data.proposta_valor = proposalValue;
    if (proposal?.created_at) data.proposta_data = proposal.created_at;
  }


  // Fallback: if no quote_id but we have a proposal_id, find the accepted/selected quote
  let resolvedQuoteId: string | null = contract.quote_id || null;
  if (!resolvedQuoteId && contract.proposal_id) {
    const { data: selections } = await (supabase as any)
      .from("proposal_quote_selections")
      .select("quote_id")
      .eq("proposal_id", contract.proposal_id)
      .eq("selected", true)
      .limit(1);
    if (selections?.[0]?.quote_id) {
      resolvedQuoteId = selections[0].quote_id;
    } else {
      const { data: fallbackQuote } = await (supabase as any)
        .from("quotes")
        .select("id")
        .eq("proposal_id", contract.proposal_id)
        .order("accepted_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (fallbackQuote?.[0]?.id) resolvedQuoteId = fallbackQuote[0].id;
    }
  }

  if (resolvedQuoteId) {
    const [{ data: quote }, { data: lines }] = await Promise.all([
      (supabase as any)
        .from("quotes")
        .select("total")
        .eq("id", resolvedQuoteId)
        .maybeSingle(),
      (supabase as any)
        .from("quote_lines")
        .select("descricao_snapshot, item_description, qt, unidade, total_sem_iva, total_com_iva, total_com_desconto, product_id, service_id, bundle_id, selected_attributes")
        .eq("quote_id", resolvedQuoteId)
        .order("ordem"),
    ]);

    const resolvedQuoteTotal = parseNumericAmount(quote?.total);
    if (resolvedQuoteTotal != null) {
      data.contrato_valor = resolvedQuoteTotal;
    }

    if (lines && lines.length > 0) {
      const mappedItems = lines.map((l: any) => {
        const qtd = parseFloat(l.qt) || 0;
        const total = parseNumericAmount(l.total_com_desconto ?? l.total_com_iva ?? l.total_sem_iva) || 0;
        const pu = qtd > 0 ? total / qtd : 0;
        const kind: "product" | "service" | "bundle" | "manual" =
          l.bundle_id ? "bundle" :
          l.service_id ? "service" :
          l.product_id ? "product" : "manual";
        let components: { descricao: string; qtd: number; unidade?: string }[] | undefined;
        if (kind === "bundle") {
          const sa = l.selected_attributes || {};
          const raw = Array.isArray(sa.bundle_components) ? sa.bundle_components
                    : Array.isArray(sa.bundle_components_data) ? sa.bundle_components_data
                    : [];
          if (raw.length > 0) {
            components = raw.map((c: any) => ({
              descricao: String(c.descricao || c.description || c.name || c.product_name || c.service_name || ""),
              qtd: parseFloat(c.qtd ?? c.quantity ?? c.qty ?? 0) || 0,
              unidade: c.unidade || c.unit || "",
            })).filter((c: any) => c.descricao);
          }
        }
        return {
          descricao: l.item_description || l.descricao_snapshot || "",
          qtd,
          unidade: l.unidade || "",
          preco_unitario: pu,
          valor: total,
          kind,
          components,
        };
      });

      const mappedItemsTotal = mappedItems.reduce((sum, item) => sum + item.valor, 0);
      if (
        mappedItems.length === 1 &&
        resolvedQuoteTotal != null &&
        Math.abs(mappedItemsTotal - resolvedQuoteTotal) > 0.009
      ) {
        const singleItem = mappedItems[0];
        mappedItems[0] = {
          ...singleItem,
          preco_unitario: singleItem.qtd > 0 ? resolvedQuoteTotal / singleItem.qtd : resolvedQuoteTotal,
          valor: resolvedQuoteTotal,
        };
      }

      data.orcamento_itens = mappedItems;
    }
  }

  // Resolve comercial_nome with priority:
  // 1) client.assigned_to (comercial atribuído ao cliente)
  // 2) client.created_by  (quem criou o cliente)
  // 3) contract.created_by (fallback: quem criou o contrato)
  // All three are anew_users.id per identity boundary.
  let clientRow: { assigned_to: string | null; created_by: string | null } | null = null;
  if (contract.client_id) {
    const { data: c } = await (supabase as any)
      .from("anew_clients")
      .select("assigned_to, created_by")
      .eq("id", contract.client_id)
      .maybeSingle();
    clientRow = c || null;
  }
  const resolvedUserId = [clientRow?.assigned_to, clientRow?.created_by, contract.created_by]
    .find((id) => !!id) as string | undefined;
  if (resolvedUserId) {
    const { data: user } = await (supabase as any)
      .from("anew_users")
      .select("name, email, phone")
      .eq("id", resolvedUserId)
      .maybeSingle();
    data.comercial_nome = user?.name || "";
    if (user?.email) data.comercial_email = user.email;
    if (user?.phone) data.comercial_telefone = user.phone;
  }

  // Signatário escolhido na minuta — usado pelo bloco final do contrato.
  const tplId = contract.contract_template_id || contract.template_id || null;
  if (tplId) {
    const sig = await fetchTemplateSignatory(tplId);
    if (sig?.name) {
      data.signatario_nome = sig.name;
      data.signatario_cargo = sig.roleName || "";
    }
  }


  return data;
}

type QuoteItemsColumnKey = "description" | "quantity" | "unit" | "price" | "total";

function normalizeOrder(order: any): QuoteItemsColumnKey[] {
  const valid: QuoteItemsColumnKey[] = ["description", "quantity", "unit", "price", "total"];
  const seen = new Set<QuoteItemsColumnKey>();
  const out: QuoteItemsColumnKey[] = [];
  (Array.isArray(order) ? order : []).forEach((k: any) => {
    if (valid.includes(k) && !seen.has(k)) { seen.add(k); out.push(k); }
  });
  valid.forEach(k => { if (!seen.has(k)) out.push(k); });
  if (!out.includes("description")) out.unshift("description");
  return out;
}

type RenderColorOpts = {
  headerBg: string;
  headerColor: string;
  borderColor: string;
  zebra: boolean;
  zebraColor: string;
};

function buildQuoteItemsHtml(
  items: NonNullable<ContractVariableData["orcamento_itens"]>,
  opts: {
    title: string;
    showQuantity: boolean;
    showUnit: boolean;
    showPrice: boolean;
    showTotal: boolean;
    primaryColor: string;
    columnOrder?: QuoteItemsColumnKey[];
    colors: RenderColorOpts;
    showProducts?: boolean;
    showServices?: boolean;
    showBundles?: boolean;
    showManual?: boolean;
    showBundleComponents?: boolean;
  }
): string {
  const {
    title, showQuantity, showUnit, showPrice, showTotal, primaryColor, columnOrder, colors,
    showProducts = true, showServices = true, showBundles = true, showManual = true,
    showBundleComponents = false,
  } = opts;

  const filtered = items.filter((it: any) => {
    const k = it.kind || "manual";
    if (k === "product") return showProducts;
    if (k === "service") return showServices;
    if (k === "bundle") return showBundles;
    return showManual;
  });
  if (filtered.length === 0) return "";

  const lines: ItemsTableLine[] = filtered.map((item: any) => ({
    description: String(item.descricao ?? ""),
    quantity: Number(item.qtd ?? 0),
    unit: item.unidade ?? null,
    unit_price: item.preco_unitario != null
      ? Number(item.preco_unitario)
      : (item.qtd ? Number(item.valor) / Number(item.qtd) : 0),
    line_total: Number(item.valor ?? 0),
    kind: item.kind,
    components: showBundleComponents ? item.components : undefined,
  }));
  const subtotal = lines.reduce((acc, l) => acc + (l.line_total || 0), 0);
  const model = buildItemsTableModel({
    quotes: [{ quoteNumber: "", lines, subtotal }],
  });


  return renderItemsTableModelHtml(model, {
    title,
    showQuantity,
    showUnit,
    showPrice,
    showTotal,
    primaryColor,
    columnOrder,
    colors,
  });
}

function renderItemsTableModelHtml(
  model: ItemsTableModel,
  opts: {
    title: string;
    showQuantity: boolean;
    showUnit: boolean;
    showPrice: boolean;
    showTotal: boolean;
    primaryColor: string;
    columnOrder?: QuoteItemsColumnKey[];
    colors: RenderColorOpts;
  },
): string {
  const { title, showQuantity, showUnit, showPrice, showTotal, primaryColor, columnOrder, colors } = opts;
  const { headerBg, headerColor, borderColor, zebra, zebraColor } = colors;
  const fmt = (n: number) => `€${(Math.round(n * 100) / 100).toFixed(2).replace(".", ",")}`;

  const colByKey: Record<QuoteItemsColumnKey, { key: string; label: string; show: boolean; align: "left" | "center" | "right" }> = {
    description: { key: "description", label: "Descrição",  show: true,         align: "left" },
    quantity:    { key: "quantity",    label: "Qtd",        show: showQuantity, align: "center" },
    unit:        { key: "unit",        label: "Un.",        show: showUnit,     align: "center" },
    price:       { key: "unit_price",  label: "Preço Unit.",show: showPrice,    align: "right" },
    total:       { key: "line_total",  label: "Total",      show: showTotal,    align: "right" },
  };
  const order = normalizeOrder(columnOrder);
  const baseCols = order.map(k => colByKey[k]);

  const renderLineRow = (line: ItemsTableLine, rowIndex: number, extraCols: { key: string; align: "left" | "center" | "right"; value: string }[] = []) => {
    const rowBg = zebra && rowIndex % 2 === 1 ? `background:${zebraColor};` : "";
    const cells: string[] = [];
    for (const extra of extraCols) {
      cells.push(`<td style="border:1px solid ${borderColor};padding:8px;text-align:${extra.align};color:#111827;">${extra.value}</td>`);
    }
    for (const c of baseCols) {
      if (!c.show) continue;
      let raw: string;
      if (c.key === "unit_price") raw = fmt(line.unit_price);
      else if (c.key === "line_total") raw = fmt(line.line_total);
      else if (c.key === "quantity") raw = String(line.quantity);
      else if (c.key === "unit") raw = String(line.unit ?? "");
      else raw = String(line.description ?? "");
      cells.push(`<td style="border:1px solid ${borderColor};padding:8px;text-align:${c.align};color:#111827;">${raw}</td>`);
    }
    let html = `<tr style="${rowBg}">${cells.join("")}</tr>`;
    if (line.kind === "bundle" && Array.isArray(line.components) && line.components.length > 0) {
      const totalCols = extraCols.length + baseCols.filter(c => c.show).length;
      for (const comp of line.components) {
        const qtyStr = comp.qtd ? `${comp.qtd}${comp.unidade ? " " + comp.unidade : ""} × ` : "";
        const text = escapeHtml(`• ${qtyStr}${comp.descricao}`);
        html += `<tr><td colspan="${totalCols}" style="border:1px solid ${borderColor};padding:6px 8px 6px 20px;background:#f8fafc;color:#475569;font-size:12px;">${text}</td></tr>`;
      }
    }
    return html;
  };

  const head = baseCols.filter(c => c.show).map(c => `<th style="border:1px solid ${borderColor};padding:8px;text-align:${c.align};color:${headerColor};background:${headerBg};">${c.label}</th>`).join("");
  const titleHtml = title ? `<h3 style="margin:0 0 8px;font-size:16px;color:${primaryColor};">${title}</h3>` : "";

  if (model.kind === "single") {
    const body = model.lines.map((l, i) => renderLineRow(l, i)).join("");
    return `<div style="margin:16px 0;">
    ${titleHtml}
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
  }

  if (model.kind === "grouped_by_quote") {
    const blocks = model.groups.map(group => {
      const body = group.lines.map((l, i) => renderLineRow(l, i)).join("");
      return `<div style="margin:12px 0;">
      <h4 style="margin:0 0 6px;font-size:14px;color:${primaryColor};">Orçamento ${escapeHtml(group.quoteNumber)}</h4>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr>
          <td colspan="${baseCols.filter(c => c.show).length - 1}" style="border:1px solid ${borderColor};padding:8px;text-align:right;color:#111827;font-weight:600;">Subtotal</td>
          <td style="border:1px solid ${borderColor};padding:8px;text-align:right;color:#111827;font-weight:600;">${fmt(group.subtotal)}</td>
        </tr></tfoot>
      </table>
    </div>`;
    }).join("");
    return `<div style="margin:16px 0;">
    ${titleHtml}
    ${blocks}
    <div style="margin-top:8px;text-align:right;font-weight:700;color:${primaryColor};">Total: ${fmt(model.grand_total)}</div>
  </div>`;
  }

  const showRef = model.show_quote_ref;
  const refHead = showRef ? `<th style="border:1px solid ${borderColor};padding:8px;text-align:left;color:${headerColor};background:${headerBg};">Ref.</th>` : "";
  const body = model.lines.map((l, i) => renderLineRow(l, i, showRef ? [{ key: "quote_ref", align: "left", value: escapeHtml(String(l.quote_ref ?? "")) }] : [])).join("");
  return `<div style="margin:16px 0;">
    ${titleHtml}
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>${refHead}${head}</tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr>
        <td colspan="${baseCols.filter(c => c.show).length + (showRef ? 1 : 0) - 1}" style="border:1px solid ${borderColor};padding:8px;text-align:right;color:#111827;font-weight:700;">Total</td>
        <td style="border:1px solid ${borderColor};padding:8px;text-align:right;color:#111827;font-weight:700;">${fmt(model.grand_total)}</td>
      </tr></tfoot>
    </table>
  </div>`;
}

function resolveTableColors(templateDocSettings: any, primaryColor: string): RenderColorOpts {
  const ds = templateDocSettings || {};
  return {
    headerBg:    ds.table_header_color || primaryColor || "#7C3AED",
    headerColor: ds.table_header_text_color || "#ffffff",
    borderColor: ds.table_border_color || "#d1d5db",
    zebra:       ds.table_zebra === true,
    zebraColor:  ds.table_zebra_color || "#f9fafb",
  };
}

/**
 * Resolves all contract data-table tokens and chips:
 *  - <span data-contract-table="quote_items" data-config="<b64>">…</span>  (new chip)
 *  - {{tabela_artigos}} / {{orcamento_itens}}                              (legacy tokens)
 *
 * The chip wraps the legacy token inside itself as a fallback; the parser
 * removes that inner token at the same time it replaces the chip, so the
 * legacy substitution that runs afterwards never sees a duplicate.
 *
 * Behavior for the legacy-token-only path is byte-identical to the previous
 * applyQuoteItemsToken implementation.
 */
export function applyDataTableTokens(
  baseHtml: string,
  variableData: ContractVariableData,
  templateDocSettings: any,
  primaryColor: string,
  autoAppendIfMissing: boolean = true,
): string {
  let html = (baseHtml || "").replace(/\{\{tabela_artigos\}\}/gi, "{{orcamento_itens}}");
  const items = variableData.orcamento_itens || [];
  const hasItems = items.length > 0;

  // 1) Replace new-style chips first. Each chip carries its own per-instance config.
  // Match <span ... data-contract-table="quote_items" ...>…</span> followed by an
  // optional inner {{orcamento_itens}} fallback token (and any whitespace/<br/>).
  const chipRe = /<(?:span|div)\b[^>]*\bdata-contract-table\s*=\s*"quote_items"[^>]*>[\s\S]*?<\/(?:span|div)>(?:\s*\{\{orcamento_itens\}\})?/gi;
  html = html.replace(chipRe, (match) => {
    if (!hasItems) return "";
    const cfgMatch = /\bdata-config\s*=\s*"([^"]*)"/i.exec(match);
    let cfg: any = {};
    if (cfgMatch?.[1]) {
      try {
        cfg = JSON.parse(decodeURIComponent(escape(atob(cfgMatch[1]))));
      } catch {
        cfg = {};
      }
    }
    return buildQuoteItemsHtml(items, {
      title: cfg.title || templateDocSettings?.quote_items_title || "Artigos do Orçamento",
      showQuantity: cfg.showQuantity !== false,
      showUnit: cfg.showUnit !== false,
      showPrice: cfg.showPrice !== false,
      showTotal: cfg.showTotal !== false,
      primaryColor: primaryColor || "#7C3AED",
      columnOrder: Array.isArray(cfg.columnOrder) ? cfg.columnOrder : (templateDocSettings?.quote_items_column_order || undefined),
      colors: resolveTableColors(templateDocSettings, primaryColor),
      showProducts: cfg.showProducts !== false,
      showServices: cfg.showServices !== false,
      showBundles: cfg.showBundles !== false,
      showManual: cfg.showManual !== false,
      showBundleComponents: cfg.showBundleComponents === true,
    });
  });

  // 2) Legacy {{orcamento_itens}} path (preserved exactly as before).
  const showItems = templateDocSettings?.show_quote_items === true;
  if (showItems && hasItems) {
    if (!/\{\{orcamento_itens\}\}/i.test(html)) {
      if (!autoAppendIfMissing) {
        return html;
      }
      html += "\n{{orcamento_itens}}";
    }
    const descriptionOnly = templateDocSettings?.quote_items_description_only === true;
    const itemsHtml = buildQuoteItemsHtml(items, {
      title: templateDocSettings?.quote_items_title || "Artigos do Orçamento",
      showQuantity: descriptionOnly ? false : (templateDocSettings?.quote_items_show_quantity !== false),
      showUnit: descriptionOnly ? false : (templateDocSettings?.quote_items_show_unit !== false),
      showPrice: descriptionOnly ? false : (templateDocSettings?.quote_items_show_price !== false),
      showTotal: descriptionOnly ? false : (templateDocSettings?.quote_items_show_total !== false),
      primaryColor: primaryColor || "#7C3AED",
      columnOrder: templateDocSettings?.quote_items_column_order || undefined,
      colors: resolveTableColors(templateDocSettings, primaryColor),
    });
    html = html.replace(/\{\{orcamento_itens\}\}/gi, itemsHtml);
  } else {
    html = html.replace(/\{\{orcamento_itens\}\}/gi, "");
  }

  // 3) Signatários chips (Corte 2B).
  const signatarios = variableData.signatarios || [];
  const sigChipRe = /<span\b[^>]*\bdata-contract-table\s*=\s*"signatories"[^>]*>[\s\S]*?<\/span>(?:\s*\{\{tabela_signatarios\}\})?/gi;
  html = html.replace(sigChipRe, (match) => {
    if (signatarios.length === 0) return "";
    const cfgMatch = /\bdata-config\s*=\s*"([^"]*)"/i.exec(match);
    let cfg: any = {};
    if (cfgMatch?.[1]) {
      try { cfg = JSON.parse(decodeURIComponent(escape(atob(cfgMatch[1])))); } catch { cfg = {}; }
    }
    return buildSignatoriesHtml(signatarios, {
      title: cfg.title || "Signatários",
      showName: cfg.showName !== false,
      showEmail: cfg.showEmail !== false,
      showRole: cfg.showRole !== false,
      showOrder: cfg.showOrder === true,
      primaryColor: primaryColor || "#7C3AED",
      tableHeaderColor: templateDocSettings?.table_header_color || null,
    });
  });
  // Cleanup any stray legacy token if chip absent
  html = html.replace(/\{\{tabela_signatarios\}\}/gi, "");

  return html;
}

function buildSignatoriesHtml(
  parties: NonNullable<ContractVariableData["signatarios"]>,
  opts: { title: string; showName: boolean; showEmail: boolean; showRole: boolean; showOrder: boolean; primaryColor: string; tableHeaderColor?: string | null }
): string {
  const { title, showName, showEmail, showRole, showOrder, primaryColor, tableHeaderColor } = opts;
  const headerBg = tableHeaderColor || primaryColor || "#7C3AED";
  const cols = [
    { key: "ordem", label: "#",      show: showOrder, align: "center" as const },
    { key: "nome",  label: "Nome",   show: showName,  align: "left"   as const },
    { key: "papel", label: "Papel",  show: showRole,  align: "left"   as const },
    { key: "email", label: "Email",  show: showEmail, align: "left"   as const },
  ];
  const head = cols.filter(c => c.show).map(c => `<th style="border:1px solid #d1d5db;padding:8px;text-align:${c.align};color:#ffffff;background:${headerBg};">${c.label}</th>`).join("");
  const body = parties.map((p) => {
    const cells = cols.filter(c => c.show).map((c) => {
      const v = (p as any)[c.key];
      return `<td style="border:1px solid #d1d5db;padding:8px;text-align:${c.align};color:#111827;">${escapeHtml(String(v ?? ""))}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  const titleHtml = title ? `<h3 style="margin:0 0 8px;font-size:16px;color:${primaryColor};">${escapeHtml(title)}</h3>` : "";
  return `<div style="margin:16px 0;">${titleHtml}<table style="width:100%;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/**
 * Resolve as "fórmulas" inseridas como chips dentro de tabelas manuais (Corte 2C).
 *
 * Cada chip tem a forma:
 *   <span data-contract-formula="<key>"
 *         data-op="percent|factor|add|subtract"
 *         data-value="<number>"
 *         data-format="currency|percent|number"
 *         data-label="<prefixo opcional>"
 *         contenteditable="false"
 *         class="contract-formula-chip">…</span>
 *
 * Calcula directamente a partir de `variableData[key]`. Se a chave não existir
 * ou não for numérica, substitui o chip por string vazia (não deixa {{…}}).
 *
 * Sem `eval`, sem parser de expressões, sem fórmulas compostas.
 */
export function applyFormulaChips(html: string, variableData: ContractVariableData): string {
  if (!html) return html;

  // 1) Decorative label chips: <span data-contract-formula-label="true" ...>ƒ 50% - adj</span>
  //    Replace by inner text without the leading "ƒ ".
  const labelChipRe = /<span\b[^>]*\bdata-contract-formula-label\s*=\s*"[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;
  let out = html.replace(labelChipRe, (_m, inner: string) => {
    const text = String(inner).replace(/<[^>]*>/g, "").replace(/^\s*ƒ\s*/, "").trim();
    return escapeHtml(text);
  });

  // 2) Computed value chips
  const chipRe = /<span\b[^>]*\bdata-contract-formula\s*=\s*"[^"]*"[^>]*>[\s\S]*?<\/span>/gi;
  out = out.replace(chipRe, (match) => {
    const keyMatch    = /\bdata-contract-formula\s*=\s*"([^"]*)"/i.exec(match);
    const opMatch     = /\bdata-op\s*=\s*"([^"]*)"/i.exec(match);
    const valueMatch  = /\bdata-value\s*=\s*"([^"]*)"/i.exec(match);
    const formatMatch = /\bdata-format\s*=\s*"([^"]*)"/i.exec(match);
    const labelMatch  = /\bdata-label\s*=\s*"([^"]*)"/i.exec(match);

    const key = keyMatch?.[1] || "";
    const op  = (opMatch?.[1] || "percent") as FormulaOperation;
    const num = parseFloat(valueMatch?.[1] || "0");
    const fmt = (formatMatch?.[1] || "currency") as FormulaFormat;
    const prefix = labelMatch?.[1] || "";

    const base = (variableData as any)[key];
    if (typeof base !== "number" || !Number.isFinite(base)) return "";
    if (!Number.isFinite(num)) return "";

    const result = computeFormulaResult(base, op, num);
    const formatted = formatFormulaResult(result, fmt);
    return prefix ? `${escapeHtml(prefix)}${formatted}` : formatted;
  });

  return out;
}

/**
 * @deprecated Use applyDataTableTokens. Kept as a thin wrapper for backward
 * compatibility with existing imports (ContractTemplates preview, PDF generation).
 */
export function applyQuoteItemsToken(
  baseHtml: string,
  variableData: ContractVariableData,
  templateDocSettings: any,
  primaryColor: string,
  autoAppendIfMissing: boolean = true,
): string {
  return applyDataTableTokens(baseHtml, variableData, templateDocSettings, primaryColor, autoAppendIfMissing);
}

export async function resolveContractDocument(contract: any, orgId: string, activeCompanyName?: string): Promise<ResolvedContractDocument | null> {
  if (!contract || !orgId) return null;

  const templateId = contract.contract_template_id || contract.template_id || null;
  const [variableData, organizationRes, settingsRes, templateRes] = await Promise.all([
    gatherContractData(contract, orgId),
    (supabase as any).from("anew_organizations").select("name, logo_url, metadata").eq("id", orgId).single(),
    (supabase as any).from("organization_document_settings").select("*").eq("organization_id", orgId).maybeSingle(),
    templateId
      ? (supabase as any).from("client_contract_templates").select("body_html, doc_settings").eq("id", templateId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (organizationRes.error) throw organizationRes.error;
  if (settingsRes.error) throw settingsRes.error;
  if (templateRes?.error) throw templateRes.error;

  let templateData = templateRes?.data || null;

  // Fallback: if contract has neither own body nor a linked template, try the
  // organization's default contract template so the PDF can still be produced.
  if (!contract.contract_body_html && !templateData?.body_html) {
    const { data: defaultTpl, error: defaultErr } = await (supabase as any)
      .from("client_contract_templates")
      .select("body_html, doc_settings")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .eq("is_active", true)
      .maybeSingle();
    if (defaultErr) throw defaultErr;
    if (defaultTpl?.body_html) templateData = defaultTpl;
  }

  const orgRow = flattenSettingsRow(settingsRes.data || {});
  const tplFlat = flattenSettingsRow(templateData?.doc_settings || {});
  const settings: DocumentSettings = {
    ...DEFAULT_DOCUMENT_SETTINGS,
    organization_id: orgId,
    ...orgRow,
    ...tplFlat,
  };

  const organization = organizationRes.data;

  // Apply user overrides (from DocumentSettings extra_settings) on top of
  // resolved org data so cabeçalho / variáveis ficam coerentes.
  const trim = (v: any) => (typeof v === "string" ? v.trim() : "");
  const addressOverride = trim((settings as any).company_address_override);
  const nifOverride = trim((settings as any).company_nif_override);
  const phoneOverride = trim((settings as any).company_phone_override);
  const emailOverride = trim((settings as any).company_email_override);
  if (addressOverride) (variableData as any).empresa_morada = addressOverride;
  if (nifOverride) (variableData as any).empresa_nif = nifOverride;
  if (phoneOverride) (variableData as any).empresa_telefone = phoneOverride;
  if (emailOverride) (variableData as any).empresa_email = emailOverride;
  if (trim(settings.company_website)) (variableData as any).empresa_website = trim(settings.company_website);

  const usingContractBody = !!contract.contract_body_html;
  let baseHtml = contract.contract_body_html || templateData?.body_html || "";
  if (!baseHtml) return null;

  // Pre-substitution: alias and quote items (must run BEFORE substituteVariables
  // so the fixed handler in contractVariables.ts cannot inject the default table).
  // Quando o body vem do contrato (já renderizado na geração), NÃO voltamos a
  // anexar a tabela de produtos no fim — evita duplicado no PDF.
  baseHtml = applyQuoteItemsToken(baseHtml, variableData, tplFlat, settings.primary_color || "#7C3AED", !usingContractBody);

  let bodyHtml = substituteVariables(baseHtml, variableData);
  // Safety net (should be a no-op).
  bodyHtml = bodyHtml.replace(/\{\{(orcamento_itens|tabela_artigos)\}\}/gi, "");
  // Resolver fórmulas inseridas em células de tabelas manuais (Corte 2C).
  bodyHtml = applyFormulaChips(bodyHtml, variableData);
  // Remove os "chips" visuais do editor (fundo roxo) — render final sem destaques.
  bodyHtml = stripVariableChips(bodyHtml);
  // Bloco final de assinatura — injectar nome/cargo do signatário se ainda for o bloco estático.
  bodyHtml = injectSignatoryIntoSignatureBlock(
    bodyHtml,
    (variableData as any).signatario_nome,
    (variableData as any).signatario_cargo,
  );

  const companyName = settings.company_name_override || variableData.empresa_nome || organization?.name || activeCompanyName || "";
  const headerLineOne = [
    settings.show_nif !== false && variableData.empresa_nif ? `NIF: ${variableData.empresa_nif}` : null,
    settings.show_address !== false && variableData.empresa_morada ? variableData.empresa_morada : null,
  ].filter(Boolean).join(" · ");
  const headerLineTwo = [
    settings.show_phone !== false && (variableData as any).empresa_telefone ? `Tel: ${(variableData as any).empresa_telefone}` : null,
    settings.show_email !== false && (variableData as any).empresa_email ? (variableData as any).empresa_email : null,
    settings.show_website && (variableData as any).empresa_website ? (variableData as any).empresa_website : null,
  ].filter(Boolean).join(" · ");

  return {
    bodyHtml,
    variableData,
    organization,
    settings,
    companyName,
    headerLineOne,
    headerLineTwo,
    ...getPageDimensions(settings.page_size, settings.page_orientation),
  };
}

export function buildContractPrintHtml(document: ResolvedContractDocument, title: string) {
  const sanitizedBody = DOMPurify.sanitize(document.bodyHtml);
  const headerAlignment = document.settings.header_layout || "left";
  const logoUrl = document.settings.logo_url || document.organization?.logo_url || "";
  const primaryColor = document.settings.primary_color || "#7C3AED";
  const footerText = document.settings.footer_text || "";

  const marginTop = Number(document.settings.margin_top ?? 20) || 20;
  const marginRight = Number(document.settings.margin_right ?? 20) || 20;
  const marginBottom = Number(document.settings.margin_bottom ?? 20) || 20;
  const marginLeft = Number(document.settings.margin_left ?? 20) || 20;

  const pageWidthMm = parseFloat(document.pageWidth) || 210;
  const pageHeightMm = parseFloat(document.pageHeight) || 297;
  const contentWidthMm = Math.max(20, pageWidthMm - marginLeft - marginRight);
  const contentMinHeightMm = Math.max(20, pageHeightMm - marginTop - marginBottom);

  return `<!doctype html>
<html lang="pt">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: ${document.pageCssSize};
        margin: 0;
      }
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #111827;
        font-family: ${document.settings.font_family || "Arial"}, Arial, sans-serif;
      }
      body {
        padding: 0;
      }
      .page {
        width: ${contentWidthMm}mm;
        min-height: ${contentMinHeightMm}mm;
        margin: 0 auto;
        background: #ffffff;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .page * {
        max-width: 100%;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .content table, .content tr, .content td, .content th {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .content {
        orphans: 3;
        widows: 3;
      }
      .content > *,
      .content p,
      .content li,
      .content h1, .content h2, .content h3, .content h4, .content h5, .content h6,
      .content blockquote,
      .content img,
      .content div {
        page-break-inside: avoid;
        break-inside: avoid;
        /* Reserva visual para descenders ("p", "g", "ç") e underlines evitando
           que a última linha saia cortada nas conversões html2canvas → mm. */
        padding-bottom: 6px;

      }
      .signatures, .signature, .signature-box {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      [data-pdf-section="header"],
      [data-pdf-section="header"] table,
      [data-pdf-section="header"] tr,
      [data-pdf-section="header"] td {
        page-break-inside: avoid;
        break-inside: avoid;
      }


      .header {
        margin-bottom: 32px;
        padding-bottom: 16px;
        text-align: ${headerAlignment};
        border-bottom: ${document.settings.header_show_separator !== false ? `2px solid ${primaryColor}` : "none"};
      }
      .logo {
        max-height: 60px;
        max-width: 220px;
        object-fit: contain;
        display: block;
        margin-bottom: 8px;
        margin-left: ${headerAlignment === "center" || headerAlignment === "right" ? "auto" : "0"};
        margin-right: ${headerAlignment === "center" || headerAlignment === "left" ? "auto" : "0"};
      }
      .company-name {
        margin: 0;
        font-size: 28px;
        line-height: 1.2;
        color: ${primaryColor};
      }
      .meta {
        margin: 4px 0 0;
        font-size: 13px;
        color: #6b7280;
      }
      .content {
        font-size: 14px;
        line-height: 1.6;
      }
      .content img {
        max-width: 100%;
        height: auto;
      }
      .content table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .content table td, .content table th {
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      .footer {
        margin-top: 48px;
        padding-top: 16px;
        border-top: 1px solid #e5e7eb;
        text-align: center;
        font-size: 12px;
        color: #6b7280;
      }
      @media print {
        body {
          padding: 0;
          background: #ffffff;
        }
        .page {
          margin: 0;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      ${renderContractHeaderHtml(document.settings as any, document.variableData as any)}
      <div class="content">${sanitizedBody}</div>
      ${document.settings.show_footer !== false ? `<div class="footer">${footerText ? `<p>${escapeHtml(footerText)}</p>` : ""}${document.settings.show_page_numbers !== false ? `<p>${escapeHtml("Página 1 de 1")}</p>` : ""}</div>` : ""}
    </div>
    <script>
      window.addEventListener('load', () => {
        setTimeout(() => {
          window.focus();
          window.print();
        }, 500);
      });
      window.addEventListener('afterprint', () => window.close());
    </script>
  </body>
</html>`;
}
