import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { EntitySearchInput, type EntitySearchResult } from "@/components/EntitySearchInput";
import { AddItemsDialog } from "@/components/quote/AddItemsDialog";
import { resolveRootOrgIdLogic } from "@/lib/orgHierarchy";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { resolveEntityCommercial } from "@/utils/entityCommercial";
import { getLineSubtotal, markupFromCostAndPrice, round2 } from "@/utils/quotes/quoteLinePricing";
import { cn, formatCurrency } from "@/lib/utils";
import { applyUomOptionToLine, type LineUomFields } from "@/utils/quotes/lineUom";
import { useLineUomOptions } from "@/hooks/useLineUomOptions";
import { integerQtyMessage, isValidQtyFor, requiresIntegerQty, roundToIntegerQty } from "@/utils/quotes/integerQty";
import { LineUomSelect, PackQuantityHint } from "@/components/quote/LineUomSelect";

// Venda Direta — Fase 2: criar/editar o cabeçalho e as linhas de uma venda
// direta em RASCUNHO. Tudo o que vem depois (envio ao portal, aceitação,
// proforma, ligação a Encomendas Clientes, faturação) é de fases seguintes:
// as colunas já existem em direct_sales mas não são mostradas nem escritas
// aqui, de propósito.
//
// `(supabase as any)`: direct_sales/direct_sale_lines ainda NÃO existem em
// src/integrations/supabase/types.ts (os tipos gerados não foram regenerados
// depois da migration 20261130230000, e regenerá-los está fora do âmbito).
// Mesmo padrão já usado em ServiceMaterialsEditor.tsx e Services.tsx.

/** IVA por omissão quando o artigo do catálogo não traz taxa definida — mesmo valor de ClientOrders.tsx/PurchaseOrders.tsx. */
const DEFAULT_VAT_RATE = 23;

/**
 * Taxa de IVA de um artigo do catálogo.
 *
 * NÃO usar `Number(raw) || fallback`: um artigo isento (vat_rate = 0) é
 * falsy e caía no fallback de 23%, faturando IVA a quem está isento.
 * (ClientOrders.tsx/PurchaseOrders.tsx ainda têm esse bug; não se replica.)
 */
const resolveVatRate = (raw: unknown, fallback: number): number => {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Linha em edição. Espelha as colunas de direct_sale_lines que este ecrã
 * escreve; `key` é só para o React (as linhas são apagadas e reinseridas ao
 * gravar, por isso o id da BD não sobrevive à gravação).
 */
// LineUomFields: embalagem da linha (uom_id vai no insert; units_per_uom é
// calculado pelo gatilho no servidor — ver src/utils/quotes/lineUom.ts).
export interface DirectSaleLineDraft extends LineUomFields {
  key: string;
  product_id: string | null;
  service_id: string | null;
  descricao_snapshot: string;
  /** Categoria/origem do artigo — só informativa no UI, não é gravada (direct_sale_lines não tem coluna `categoria`). */
  categoria: string | null;
  sku: string | null;
  unidade: string | null;
  qt: number;
  cost_price: number;
  retail_price_unit: number;
  iva_percent: number;
  discount_percent: number;
  visible_to_client: boolean;
}

interface DirectSaleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null → criar uma venda direta nova. */
  saleId: string | null;
  /** Chamado depois de gravar com sucesso, para a listagem recarregar. */
  onSaved: () => void;
}

let lineKeySeq = 0;
const nextLineKey = () => `dsl-${++lineKeySeq}`;

/**
 * Totais de uma linha.
 *
 * O subtotal sem IVA vem de `getLineSubtotal` (src/utils/quotes/quoteLinePricing.ts),
 * a fonte única de verdade do preço de linha — criada precisamente porque esta
 * fórmula estava copiada em 16 sítios e divergia. O que ela garante e uma cópia
 * local não garantia: o preço unitário é fechado ao cêntimo ANTES de multiplicar
 * pela quantidade (senão os preços por dimensão, com mais de 2 casas, não
 * reconciliam com o que está no ecrã) e o arredondamento leva `Number.EPSILON`.
 *
 * `DirectSaleLineDraft` usa de propósito os mesmos nomes de campo de
 * `PricedQuoteLine` (qt / retail_price_unit / discount_percent), por isso
 * encaixa sem adaptador.
 */
export function getDirectSaleLineTotals(line: DirectSaleLineDraft) {
  const totalSemIva = getLineSubtotal(line);
  const iva = Number.isFinite(Number(line.iva_percent)) ? Number(line.iva_percent) : 0;
  const totalComIva = round2(totalSemIva * (1 + iva / 100));
  return { totalSemIva, totalComIva, ivaValor: round2(totalComIva - totalSemIva) };
}

export function DirectSaleEditor({ open, onOpenChange, saleId, onSaved }: DirectSaleEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const { hasPermission } = usePermissions();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string>("rascunho");

  const [client, setClient] = useState<EntitySearchResult | null>(null);
  const [title, setTitle] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [ivaRate, setIvaRate] = useState<number>(DEFAULT_VAT_RATE);
  const [lines, setLines] = useState<DirectSaleLineDraft[]>([]);
  const [showItemsDialog, setShowItemsDialog] = useState(false);
  // Seletor "Unidade" (embalagens) das linhas de produto.
  const lineUom = useLineUomOptions(lines.map((l) => l.product_id));

  // Trava de duplo-submit (o botão também fica disabled, mas o clique duplo
  // rápido chega a passar antes do re-render) — mesmo padrão de Proposals.tsx.
  const submitLockRef = useRef(false);

  // Id da venda criada nesta sessão do diálogo, quando `saleId` ainda é null.
  // Sem isto, uma gravação que cria o cabeçalho mas falha nas linhas ficava
  // invisível ao componente pai (o `saleId` continua null) e o clique seguinte
  // em "Guardar" inseria uma SEGUNDA venda direta, com novo VD-YYYY-NNNN,
  // deixando a primeira órfã. Com o ref, o retry reaproveita a mesma venda.
  const createdIdRef = useRef<string | null>(null);

  const isEditing = Boolean(saleId);
  // A RLS de direct_sale_lines exige direct_sales.create para INSERT e
  // direct_sales.edit para DELETE. Como gravar faz sempre apagar-e-reinserir
  // das linhas, editar precisa das DUAS permissões — não só de .edit.
  const canSave = isEditing
    ? hasPermission("direct_sales.edit") && hasPermission("direct_sales.create")
    : hasPermission("direct_sales.create");
  // Fase 2 só mexe em rascunhos. Uma venda já enviada/aceite abre em leitura.
  const isDraft = status === "rascunho";
  const readOnly = !canSave || !isDraft;

  const resetForm = useCallback(() => {
    setStatus("rascunho");
    setClient(null);
    setTitle("");
    setClientNotes("");
    setNotes("");
    setIvaRate(DEFAULT_VAT_RATE);
    setLines([]);
    createdIdRef.current = null;
  }, []);

  // ── Carregar uma venda direta existente ────────────────────────────────
  useEffect(() => {
    if (!open) return;

    // Limpar SINCRONAMENTE, antes de qualquer await: se o diálogo reabrir
    // noutra venda, um render intermédio chegava a mostrar o cliente e as
    // linhas da venda anterior enquanto a query nova ainda ia a caminho.
    resetForm();

    if (!saleId) return;

    setLoading(true);

    let cancelled = false;
    (async () => {
      try {
        const { data: sale, error: saleError } = await (supabase as any)
          .from("direct_sales")
          .select("id, status, entity_id, client_id, title, notes, client_notes, iva_rate")
          .eq("id", saleId)
          .is("deleted_at", null)
          .maybeSingle();
        if (saleError) throw saleError;
        if (!sale) throw new Error("Venda direta não encontrada.");

        const { data: lineRows, error: linesError } = await (supabase as any)
          .from("direct_sale_lines")
          .select("id, product_id, service_id, descricao_snapshot, unidade, qt, cost_price, retail_price_unit, iva_percent, discount_percent, visible_to_client, ordem, uom_id, units_per_uom")
          .eq("direct_sale_id", saleId)
          .order("ordem", { ascending: true });
        if (linesError) throw linesError;

        // Nome do cliente para o EntitySearchInput já vir preenchido. Falhar
        // aqui não pode impedir a edição: sem nome, mostra o id curto.
        let entityResult: EntitySearchResult | null = null;
        if (sale.entity_id) {
          const { data: entity } = await supabase
            .from("anew_entities")
            .select("id, display_name, first_name, last_name")
            .eq("id", sale.entity_id)
            .maybeSingle();
          const name =
            (entity as any)?.display_name ||
            [(entity as any)?.first_name, (entity as any)?.last_name].filter(Boolean).join(" ").trim() ||
            `Cliente #${String(sale.entity_id).slice(0, 8)}`;
          // O tipo tem de refletir o que está gravado: `client_id` só existe
          // quando a venda foi feita a uma ficha de cliente (anew_clients).
          // Forçar "client" numa venda a uma LEAD fazia `id` cair no
          // `entity_id` e, ao regravar, esse entity_id ia parar à coluna
          // `client_id` — FK de anew_clients(id), violação garantida.
          entityResult = {
            type: sale.client_id ? "client" : "lead",
            id: sale.client_id || sale.entity_id,
            name,
            entityId: sale.entity_id,
          };
        }

        if (cancelled) return;
        setStatus(sale.status || "rascunho");
        setClient(entityResult);
        setTitle(sale.title || "");
        setNotes(sale.notes || "");
        setClientNotes(sale.client_notes || "");
        setIvaRate(Number(sale.iva_rate ?? DEFAULT_VAT_RATE));
        setLines(
          (lineRows || []).map((row: any) => ({
            key: nextLineKey(),
            product_id: row.product_id ?? null,
            service_id: row.service_id ?? null,
            descricao_snapshot: row.descricao_snapshot || "",
            categoria: null,
            sku: null,
            unidade: row.unidade ?? null,
            qt: Number(row.qt) || 0,
            cost_price: Number(row.cost_price) || 0,
            retail_price_unit: Number(row.retail_price_unit) || 0,
            iva_percent: Number(row.iva_percent ?? DEFAULT_VAT_RATE),
            discount_percent: Number(row.discount_percent) || 0,
            visible_to_client: row.visible_to_client !== false,
            // Embalagem gravada: preço/custo já vêm por embalagem, não se recalculam.
            uom_id: row.uom_id ?? null,
            units_per_uom: Number(row.units_per_uom) || 1,
          })),
        );
      } catch (error: any) {
        if (cancelled) return;
        toast({
          title: t("directSales.toast.loadError"),
          description: error?.message,
          variant: "destructive",
        });
        onOpenChange(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // `t`/`toast`/`onOpenChange` são estáveis o suficiente e incluí-los só
    // provocava recargas desnecessárias do formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saleId, resetForm]);

  // ── Adicionar artigos do catálogo ───────────────────────────────────────
  // A resolução de preço/IVA/unidade/custo é a MESMA de ClientOrders.tsx na
  // criação manual (bundles expandidos nos componentes, preço = retail_price +
  // addon dos atributos, IVA do artigo com fallback). A única diferença é que
  // aqui também se guarda `cost_price` e `unidade`, porque direct_sale_lines
  // tem essas colunas (quote_lines-like) — o IVA por omissão vem do cabeçalho
  // (iva_rate) em vez da constante, quando o artigo não traz taxa, e o 0%
  // sobrevive (ver `resolveVatRate`).
  const handleAddCatalogItems = (selected: any[]) => {
    const fallbackVat = resolveVatRate(ivaRate, DEFAULT_VAT_RATE);
    const newLines: DirectSaleLineDraft[] = [];

    selected.forEach((sel) => {
      const { item, quantity, fullAttributes, attributePriceAddon, bundleInfo } = sel;

      // Bundles chegam como UMA linha cujo `item.id` é o id do bundle, que não
      // é product_id nem service_id — as FKs de direct_sale_lines rejeitariam.
      // Expande-se nos componentes reais, tal como em ClientOrders.tsx.
      if (bundleInfo) {
        (bundleInfo.components || []).forEach((comp: any) => {
          const isProduct = comp.type === "product";
          newLines.push({
            key: nextLineKey(),
            product_id: isProduct ? comp.source_id : null,
            service_id: isProduct ? null : comp.source_id,
            descricao_snapshot: comp.name,
            categoria: bundleInfo.bundle_name || "Bundle",
            sku: comp.sku ?? null,
            unidade: null,
            qt: (Number(comp.quantity) || 0) * (Number(quantity) || 1),
            cost_price: 0,
            retail_price_unit: Number(comp.unit_price) || 0,
            iva_percent: resolveVatRate(comp.vat_rate, fallbackVat),
            discount_percent: 0,
            visible_to_client: true,
          });
        });
        return;
      }

      // Descrição com os atributos escolhidos, mesmo formato de
      // ClientOrders.tsx/PurchaseOrders.tsx ("Nome (Medida: 90x90, Cor: Branco)").
      const attrStrings = Object.values(fullAttributes || {})
        .map((attr: any) => {
          if (!attr?.value) return null;
          const displayValue = attr.unit ? `${attr.value} ${attr.unit}` : attr.value;
          return `${attr.label}: ${displayValue}`;
        })
        .filter(Boolean) as string[];
      const description = attrStrings.length > 0
        ? `${item.name} (${attrStrings.join(", ")})`
        : item.name;

      const isProduct = item.type === "product";
      newLines.push({
        key: nextLineKey(),
        product_id: isProduct ? item.id : null,
        service_id: isProduct ? null : item.id,
        descricao_snapshot: description,
        categoria: item.category_name || null,
        sku: item.sku ?? null,
        unidade: item.uom_symbol ?? null,
        qt: Number(quantity) || 1,
        cost_price: Number(item.cost_price) || 0,
        retail_price_unit: (Number(item.retail_price) || 0) + (Number(attributePriceAddon) || 0),
        iva_percent: resolveVatRate(item.vat_rate, fallbackVat),
        discount_percent: 0,
        visible_to_client: true,
      });
    });

    if (newLines.length === 0) return;
    setLines((prev) => [...prev, ...newLines]);
  };

  const handleLineChange = (
    index: number,
    field: "qt" | "retail_price_unit" | "discount_percent" | "iva_percent",
    value: string,
    integerQty = false,
  ) => {
    setLines((prev) => {
      const next = [...prev];
      const parsed = parseFloat(value);
      const num = Number.isNaN(parsed) ? 0 : parsed;
      // Quantidade de unidade contável / embalagem => inteiro.
      next[index] = { ...next[index], [field]: field === "qt" && integerQty ? roundToIntegerQty(num) : num };
      return next;
    });
  };

  // Embalagem: preço de venda e custo = valor da unidade do produto × fator.
  const handleLineUomChange = (index: number, option: Parameters<typeof applyUomOptionToLine>[1]) => {
    setLines((prev) => prev.map((line, i) => (i === index ? applyUomOptionToLine(line, option) : line)));
  };

  const handleToggleVisible = (index: number) => {
    setLines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], visible_to_client: !next[index].visible_to_client };
      return next;
    });
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  // DECISÃO DE PRODUTO (não "corrigir" para somar tudo): uma linha com
  // `visible_to_client === false` é registo interno e NÃO é cobrada ao
  // cliente, por isso fica de fora do subtotal e do total gravados em
  // direct_sales. O total apresentado tem de bater certo, ao cêntimo, com as
  // linhas que o cliente vai ver no portal. A linha continua a ser gravada em
  // direct_sale_lines com os seus próprios totais — o que muda é só a soma do
  // cabeçalho.
  const billableLines = lines.filter((line) => line.visible_to_client);
  const hiddenLinesCount = lines.length - billableLines.length;

  const totals = billableLines.reduce(
    (acc, line) => {
      const { totalSemIva, totalComIva, ivaValor } = getDirectSaleLineTotals(line);
      acc.subtotal += totalSemIva;
      acc.iva += ivaValor;
      acc.total += totalComIva;
      return acc;
    },
    { subtotal: 0, iva: 0, total: 0 },
  );

  // ── Gravar ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (readOnly || saving || submitLockRef.current) return;
    if (!activeCompany?.id) return;

    const entityId = client?.entityId || null;
    if (!entityId) {
      toast({
        title: t("directSales.validation.clientRequired"),
        description: t("directSales.validation.clientRequiredDesc"),
        variant: "destructive",
      });
      return;
    }
    if (lines.length === 0) {
      toast({
        title: t("directSales.validation.linesRequired"),
        description: t("directSales.validation.linesRequiredDesc"),
        variant: "destructive",
      });
      return;
    }
    // Os min/max dos <input type="number"> não são impostos (não há submit de
    // formulário nativo aqui), por isso a validação real é esta. Não é só
    // cosmética: iva_percent/discount_percent/margem_percent são
    // numeric(5,2) na base — um IVA de 9999 rebentava com overflow numérico
    // DEPOIS de as linhas antigas já terem sido mexidas.
    const invalidIvaRate = !(Number.isFinite(Number(ivaRate)) && Number(ivaRate) >= 0 && Number(ivaRate) <= 100);
    if (invalidIvaRate) {
      toast({
        title: t("directSales.validation.invalidIvaRate"),
        description: t("directSales.validation.invalidIvaRateDesc"),
        variant: "destructive",
      });
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const qt = Number(line.qt);
      const unitPrice = Number(line.retail_price_unit);
      const discount = Number(line.discount_percent);
      const vat = Number(line.iva_percent);

      if (!(Number.isFinite(qt) && qt > 0)) {
        toast({
          title: t("directSales.validation.invalidQuantity"),
          description: t("directSales.validation.invalidQuantityDesc", { line: lineNumber }),
          variant: "destructive",
        });
        return;
      }
      // Unidade contável / embalagem: só quantidades inteiras.
      const baseCode = lineUom.getBaseCode(line.product_id);
      if (!isValidQtyFor(qt, requiresIntegerQty({ hasProduct: !!line.product_id, lineUomId: line.uom_id, baseUomCode: baseCode }))) {
        toast({
          title: t("directSales.validation.invalidQuantity"),
          description: integerQtyMessage(lineNumber, line.uom_id ? line.unidade : baseCode),
          variant: "destructive",
        });
        return;
      }
      if (!(Number.isFinite(unitPrice) && unitPrice >= 0)) {
        toast({
          title: t("directSales.validation.invalidUnitPrice"),
          description: t("directSales.validation.invalidUnitPriceDesc", { line: lineNumber }),
          variant: "destructive",
        });
        return;
      }
      if (!(Number.isFinite(discount) && discount >= 0 && discount <= 100)) {
        toast({
          title: t("directSales.validation.invalidDiscount"),
          description: t("directSales.validation.invalidDiscountDesc", { line: lineNumber }),
          variant: "destructive",
        });
        return;
      }
      if (!(Number.isFinite(vat) && vat >= 0 && vat <= 100)) {
        toast({
          title: t("directSales.validation.invalidVat"),
          description: t("directSales.validation.invalidVatDesc", { line: lineNumber }),
          variant: "destructive",
        });
        return;
      }
    }

    submitLockRef.current = true;
    setSaving(true);
    try {
      // root_organization_id: mesma subida da hierarquia usada em
      // Proposals.tsx/AnewLeads.tsx (com guarda de ciclo e cap de 10 saltos).
      const rootOrgId = await resolveRootOrgIdLogic(activeCompany.id, async (childOrgId) => {
        const { data } = await supabase
          .from("anew_hierarchy")
          .select("parent_org_id")
          .eq("child_org_id", childOrgId)
          .maybeSingle();
        return data?.parent_org_id ?? null;
      });

      // Campos do cabeçalho SEM subtotal/total: os totais só são escritos no
      // fim, depois de as linhas estarem gravadas (ver passo 5). Assim nunca
      // existe um momento em que o cabeçalho anuncia um total que as linhas
      // ainda não sustentam.
      const header = {
        entity_id: entityId,
        // client_id só existe quando a entidade escolhida é uma ficha de
        // cliente (anew_clients). Para uma lead fica null, como em
        // client_contracts.
        client_id: client?.type === "client" ? client.id : null,
        title: title.trim() || null,
        notes: notes.trim() || null,
        client_notes: clientNotes.trim() || null,
        iva_rate: Number(ivaRate),
      };

      // Retry seguro: se uma tentativa anterior já criou o cabeçalho mas
      // falhou nas linhas, `createdIdRef` guarda esse id e esta gravação
      // reutiliza-o em vez de criar uma segunda venda direta.
      let targetId = saleId ?? createdIdRef.current;

      // ── 1. Cabeçalho ──
      if (targetId) {
        // `.select().maybeSingle()`: um UPDATE barrado pela RLS devolve
        // sucesso com 0 linhas afetadas. Sem isto, uma falta de permissão (ou
        // uma venda entretanto apagada) passava por gravação bem-sucedida.
        // NOTA: `organization_id`/`root_organization_id` não são reenviados —
        // a venda não muda de organização ao ser editada.
        const { data: updated, error } = await (supabase as any)
          .from("direct_sales")
          .update(header)
          .eq("id", targetId)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!updated) throw new Error(t("directSales.toast.updateBlocked"));
      } else {
        const businessUserId = await resolveCurrentBusinessUserId();
        // Comercial responsável pela venda. O da lead/cliente tem PRIORIDADE
        // sobre quem cria: quem responde pela venda é o comercial a quem a
        // entidade estava atribuída, não quem carregou no botão (pode ser um
        // administrativo a lançar por ele).
        //
        // Grava-se agora e não muda depois: se a lead for reatribuída, esta
        // venda continua do primeiro comercial, porque foi ele que a fez. O
        // comercial actual da lead é mostrado ao lado, lido ao vivo.
        const assignedTo = await resolveEntityCommercial(entityId, activeCompany.id)
          ?? businessUserId;

        // `sale_number` NÃO é enviado: é o trigger trigger_set_direct_sale_number
        // que gera o VD-YYYY-NNNN no BEFORE INSERT.
        const { data, error } = await (supabase as any)
          .from("direct_sales")
          .insert({
            ...header,
            organization_id: activeCompany.id,
            root_organization_id: rootOrgId,
            status: "rascunho",
            created_by: businessUserId,
            assigned_to: assignedTo,
            subtotal: 0,
            total: 0,
          })
          .select("id")
          .single();
        if (error) throw error;
        targetId = data.id as string;
        createdIdRef.current = targetId;
      }

      // ── 2. Ids das linhas atuais ──
      // A ordem é INSERIR-e-depois-APAGAR, não apagar-e-reinserir. Não há RPC
      // de escrita nesta fase, logo isto não é transacional: com o DELETE
      // primeiro, um INSERT falhado deixava a venda sem linha nenhuma e o
      // trabalho perdia-se ao fechar o diálogo. Nesta ordem, a pior falha
      // possível é linhas duplicadas — visíveis e corrigíveis pelo utilizador.
      const { data: existingLineRows, error: existingLinesError } = await (supabase as any)
        .from("direct_sale_lines")
        .select("id")
        .eq("direct_sale_id", targetId);
      if (existingLinesError) throw existingLinesError;
      const previousLineIds = (existingLineRows || []).map((row: any) => row.id as string);

      // ── 3. Inserir as linhas novas ──
      const linePayload = lines.map((line, index) => {
        const { totalSemIva, totalComIva } = getDirectSaleLineTotals(line);
        const unitPrice = round2(Number(line.retail_price_unit) || 0);
        const costPrice = Number(line.cost_price) || 0;
        return {
          direct_sale_id: targetId,
          product_id: line.product_id,
          service_id: line.service_id,
          descricao_snapshot: line.descricao_snapshot || "—",
          qt: Number(line.qt) || 0,
          unidade: line.unidade,
          cost_price: costPrice,
          retail_price_unit: unitPrice,
          // `margem_percent` é, estruturalmente, o markup sobre o custo que
          // reproduz o preço de venda (ver quoteLinePricing.ts). Sem o
          // escrever, a coluna ficava no DEFAULT 20 da base — um markup
          // fictício que o documento interno com margem de uma fase seguinte
          // ia ler como se fosse real.
          margem_percent: markupFromCostAndPrice(costPrice, unitPrice),
          iva_percent: Number(line.iva_percent) || 0,
          discount_percent: Number(line.discount_percent) || 0,
          total_sem_iva: totalSemIva,
          total_com_iva: totalComIva,
          // Sem desconto global nas vendas diretas — total_com_desconto é o
          // mesmo que total_com_iva (a coluna existe por espelhar quote_lines).
          total_com_desconto: totalComIva,
          ordem: index + 1,
          visible_to_client: line.visible_to_client,
          // NULL = unidade do produto. units_per_uom e o texto `unidade` são
          // alinhados pelo gatilho trg_direct_sale_lines_units_per_uom.
          uom_id: line.uom_id || null,
        };
      });

      const { error: insertLinesError } = await (supabase as any)
        .from("direct_sale_lines")
        .insert(linePayload);
      if (insertLinesError) throw insertLinesError;

      // ── 4. Apagar as linhas antigas, por id ──
      if (previousLineIds.length > 0) {
        const { data: deletedRows, error: deleteError } = await (supabase as any)
          .from("direct_sale_lines")
          .delete()
          .in("id", previousLineIds)
          .select("id");
        if (deleteError) throw deleteError;
        // Um DELETE barrado pela RLS também devolve sucesso com 0 linhas:
        // sem esta verificação, as linhas antigas ficavam a duplicar as novas
        // em silêncio.
        if ((deletedRows || []).length !== previousLineIds.length) {
          throw new Error(t("directSales.toast.deleteLinesBlocked"));
        }
      }

      // ── 5. Totais do cabeçalho, só agora ──
      const { data: totalsUpdated, error: totalsError } = await (supabase as any)
        .from("direct_sales")
        .update({ subtotal: round2(totals.subtotal), total: round2(totals.total) })
        .eq("id", targetId)
        .select("id")
        .maybeSingle();
      if (totalsError) throw totalsError;
      if (!totalsUpdated) throw new Error(t("directSales.toast.updateBlocked"));

      toast({ title: t("directSales.toast.saveSuccess") });
      onOpenChange(false);
      resetForm();
      onSaved();
    } catch (error: any) {
      toast({
        title: t("directSales.toast.saveError"),
        description: error?.message,
        variant: "destructive",
      });
    } finally {
      submitLockRef.current = false;
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (saving) return;
          onOpenChange(next);
          if (!next) resetForm();
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? t("directSales.editor.editTitle") : t("directSales.editor.newTitle")}
            </DialogTitle>
            <DialogDescription>{t("directSales.description")}</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Dois motivos distintos para o modo de leitura, com mensagens
                  distintas: dizer "só se editam rascunhos" a quem tem um
                  rascunho à frente mas não tem permissão é simplesmente falso. */}
              {!canSave && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                  {t("directSales.editor.noPermissionNotice")}
                </p>
              )}
              {canSave && !isDraft && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-200">
                  {t("directSales.editor.readOnlyNotice")}
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label className="mb-2 block">{t("directSales.editor.client")}</Label>
                  <EntitySearchInput
                    value={client}
                    onChange={setClient}
                    searchTypes={["client", "lead"]}
                    disabled={readOnly || saving}
                  />
                </div>

                <div>
                  <Label htmlFor="direct-sale-title" className="mb-2 block">
                    {t("directSales.editor.saleTitle")}
                  </Label>
                  <Input
                    id="direct-sale-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={t("directSales.editor.saleTitlePlaceholder")}
                    disabled={readOnly || saving}
                  />
                </div>

                <div>
                  <Label htmlFor="direct-sale-iva" className="mb-2 block">
                    {t("directSales.editor.ivaRate")}
                  </Label>
                  <Input
                    id="direct-sale-iva"
                    type="number"
                    min="0"
                    step="0.5"
                    value={ivaRate}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value);
                      setIvaRate(Number.isNaN(parsed) ? 0 : parsed);
                    }}
                    disabled={readOnly || saving}
                  />
                </div>

                <div>
                  <Label htmlFor="direct-sale-client-notes" className="mb-2 block">
                    {t("directSales.editor.clientNotes")}
                  </Label>
                  <Textarea
                    id="direct-sale-client-notes"
                    rows={3}
                    value={clientNotes}
                    onChange={(e) => setClientNotes(e.target.value)}
                    disabled={readOnly || saving}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("directSales.editor.clientNotesHint")}
                  </p>
                </div>

                <div>
                  <Label htmlFor="direct-sale-notes" className="mb-2 block">
                    {t("directSales.editor.notes")}
                  </Label>
                  <Textarea
                    id="direct-sale-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={readOnly || saving}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("directSales.editor.notesHint")}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">{t("directSales.editor.lines")}</h3>
                  <Button
                    type="button"
                    onClick={() => setShowItemsDialog(true)}
                    disabled={readOnly || saving}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t("directSales.editor.addItems")}
                  </Button>
                </div>

                {lines.length > 0 ? (
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <div className="lg:col-span-2 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("directSales.editor.lineDescription")}</TableHead>
                            <TableHead className="w-20">{t("directSales.editor.lineQuantity")}</TableHead>
                            <TableHead className="w-28">{t("directSales.editor.lineUnitPrice")}</TableHead>
                            <TableHead className="w-20">{t("directSales.editor.lineDiscount")}</TableHead>
                            <TableHead className="w-20">{t("directSales.editor.lineVat")}</TableHead>
                            <TableHead className="text-right">{t("directSales.editor.lineTotal")}</TableHead>
                            <TableHead className="w-20" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lines.map((line, index) => {
                            const { totalComIva } = getDirectSaleLineTotals(line);
                            const lineUomOptions = lineUom.getOptions(line.product_id);
                            // Unidade contável / embalagem => só quantidades inteiras.
                            const lineIntegerQty = requiresIntegerQty({
                              hasProduct: !!line.product_id,
                              lineUomId: line.uom_id,
                              baseUomCode: lineUom.getBaseCode(line.product_id),
                            });
                            return (
                              <TableRow key={line.key}>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="shrink-0">
                                      {line.product_id
                                        ? t("directSales.editor.typeProduct")
                                        : t("directSales.editor.typeService")}
                                    </Badge>
                                    <div className="min-w-0">
                                      <div className={cn("font-medium", !line.visible_to_client && "text-muted-foreground line-through")}>
                                        {line.descricao_snapshot}
                                      </div>
                                      {(line.sku || line.categoria || line.unidade) && (
                                        <div className="text-xs text-muted-foreground">
                                          {[line.sku, line.categoria, line.unidade].filter(Boolean).join(" · ")}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    step={lineIntegerQty ? "1" : "0.01"}
                                    inputMode={lineIntegerQty ? "numeric" : undefined}
                                    className="w-20"
                                    value={line.qt}
                                    onChange={(e) => handleLineChange(index, "qt", e.target.value, lineIntegerQty)}
                                    disabled={readOnly || saving}
                                  />
                                  {lineUomOptions.length > 0 && (
                                    <LineUomSelect
                                      options={lineUomOptions}
                                      line={line}
                                      className="mt-1 w-20"
                                      onChange={(option) => handleLineUomChange(index, option)}
                                      disabled={readOnly || saving}
                                    />
                                  )}
                                  <PackQuantityHint qt={line.qt} line={line} baseCode={lineUom.getBaseCode(line.product_id)} className="mt-0.5" />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="w-28"
                                    value={line.retail_price_unit}
                                    onChange={(e) => handleLineChange(index, "retail_price_unit", e.target.value)}
                                    disabled={readOnly || saving}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.5"
                                    className="w-20"
                                    value={line.discount_percent}
                                    onChange={(e) => handleLineChange(index, "discount_percent", e.target.value)}
                                    disabled={readOnly || saving}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    className="w-20"
                                    value={line.iva_percent}
                                    onChange={(e) => handleLineChange(index, "iva_percent", e.target.value)}
                                    disabled={readOnly || saving}
                                  />
                                </TableCell>
                                <TableCell className="text-right font-semibold">
                                  {formatCurrency(totalComIva)}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-end gap-1">
                                    {/* Toggle visible_to_client. O par de ícones
                                        olho/olho-cortado é o mesmo que o QuoteBuilder
                                        usa nas quote_lines, mas a semântica AQUI é a
                                        que conta: a coluna de direct_sale_lines ainda
                                        não é lida por nenhum consumidor (portal e PDF
                                        são de fases seguintes). Nesta fase o efeito
                                        visível é só o de ficar fora do total. */}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className={cn("h-8 w-8", !line.visible_to_client && "text-amber-600")}
                                          onClick={() => handleToggleVisible(index)}
                                          disabled={readOnly || saving}
                                          aria-label={
                                            line.visible_to_client
                                              ? t("directSales.editor.visibleToClient")
                                              : t("directSales.editor.hiddenFromClient")
                                          }
                                        >
                                          {line.visible_to_client
                                            ? <Eye className="h-4 w-4" />
                                            : <EyeOff className="h-4 w-4" />}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {line.visible_to_client
                                          ? t("directSales.editor.visibleToClient")
                                          : t("directSales.editor.hiddenFromClient")}
                                      </TooltipContent>
                                    </Tooltip>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => handleRemoveLine(index)}
                                      disabled={readOnly || saving}
                                      aria-label={t("directSales.editor.removeLine")}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>

                    <div>
                      <Card>
                        <CardHeader>
                          <CardTitle>{t("directSales.editor.summary")}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("directSales.editor.subtotal")}</span>
                            <span>{formatCurrency(totals.subtotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">{t("directSales.editor.vat")}</span>
                            <span>{formatCurrency(totals.iva)}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2 text-lg font-bold">
                            <span>{t("directSales.editor.total")}</span>
                            <span>{formatCurrency(totals.total)}</span>
                          </div>
                          {/* Sem esta nota, um total que não bate com a soma
                              visível das linhas parece um bug de soma. */}
                          {hiddenLinesCount > 0 && (
                            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
                              {t("directSales.editor.hiddenLinesExcluded", { count: hiddenLinesCount })}
                            </p>
                          )}
                          <div className="pt-2 text-sm text-muted-foreground">
                            {t("directSales.editor.linesCount")}: {lines.length}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-muted-foreground">
                    {t("directSales.editor.noLines")}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={saving}
                >
                  {t("directSales.editor.cancel")}
                </Button>
                <Button type="button" onClick={handleSave} disabled={readOnly || saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saving ? t("directSales.editor.saving") : t("directSales.editor.save")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Seletor de artigos partilhado com os Orçamentos: carrega o catálogo do
          lado do servidor (as props products/services existem só por
          compatibilidade de API e não são usadas lá dentro — ver
          ClientOrders.tsx/InlineQuoteBuilder.tsx, que as passam vazias). */}
      <AddItemsDialog
        open={showItemsDialog}
        onOpenChange={setShowItemsDialog}
        onAddItems={handleAddCatalogItems}
        products={[]}
        services={[]}
      />
    </>
  );
}
