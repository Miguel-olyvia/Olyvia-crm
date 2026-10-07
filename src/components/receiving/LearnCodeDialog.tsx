// Associar um código a um produto ("aprender códigos", Fase 2 — fatia 3).
//
// - Receção: `warehouseId` preenchido → source 'receiving' (auditoria). A
//   leitura não reconhecida vem em `code` (só leitura).
// - Ficha do produto: `warehouseId` null + `fixedProduct` → source
//   'product_form'; o código escreve-se no diálogo.
// - Idempotente: o id do pedido mantém-se enquanto os dados não mudam, por
//   isso "Associar de novo" depois de uma falha de rede não duplica.
// - Produto sem unidade: opção "definir a unidade do produto como «un»"
//   (p_set_product_uom; exige products.edit) — obrigatória para embalagens.
// - Criar embalagens novas não é deste diálogo (tabela uom, products.manage).
// - Sem Popover/Command: selects nativos e lista inline (o foco não foge do Dialog).
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Search, X } from "lucide-react";
import {
  learnProductCode,
  looksLikeBarcode,
  newCodeRequestId,
  productCodeErrorMessage,
  type LearnCodeResult,
  type ProductCodeKind,
} from "./productCodes";

export interface LearnCodeProduct {
  id: string;
  name: string;
  sku: string | null;
}

interface ProductPick extends LearnCodeProduct {
  uom_id: string | null;
  uom_code: string | null;
}

interface PackOption {
  id: string;
  code: string;
  factor: number | null;
}

interface SupplierOption {
  id: string;
  name: string;
}

export interface LearnCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Código lido (receção). Vazio = escreve-se no diálogo. */
  code: string;
  organizationId: string | null;
  /** Armazém da receção; null = ficha do produto (source 'product_form'). */
  warehouseId: string | null;
  /** Fornecedor da receção/guia (pré-escolhido na referência do fornecedor). */
  supplierId?: string | null;
  /** Fornecedores da empresa; se omitido, o diálogo carrega-os. */
  suppliers?: SupplierOption[];
  /** Produto fixo (ficha do produto): sem pesquisa. */
  fixedProduct?: LearnCodeProduct | null;
  /** products.edit — permite definir a unidade «un» num produto sem unidade. */
  canEditProducts?: boolean;
  onLearned: (result: LearnCodeResult) => void;
}

const sanitizeQuery = (s: string) => s.trim().replace(/[,()%*\\"]/g, " ").replace(/\s+/g, " ").trim();

export function LearnCodeDialog({
  open,
  onOpenChange,
  code: initialCode,
  organizationId,
  warehouseId,
  supplierId: initialSupplierId,
  suppliers: suppliersProp,
  fixedProduct,
  canEditProducts = false,
  onLearned,
}: LearnCodeDialogProps) {
  const codeLocked = initialCode.trim() !== "";
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<ProductCodeKind>("barcode");
  const [supplierId, setSupplierId] = useState("");
  const [product, setProduct] = useState<ProductPick | null>(null);
  const [uomId, setUomId] = useState(""); // "" = unidade do produto
  const [setUom, setSetUom] = useState(false);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ProductPick[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  const [loadedSuppliers, setLoadedSuppliers] = useState<SupplierOption[]>([]);
  const [packs, setPacks] = useState<PackOption[]>([]);
  const [packsError, setPacksError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  /** Id do pedido + dados com que foi gerado (idempotência). */
  const requestRef = useRef<{ key: string; id: string } | null>(null);

  const suppliers = suppliersProp ?? loadedSuppliers;

  // Cada abertura começa de novo.
  useEffect(() => {
    if (!open) return;
    const c = initialCode.trim();
    setCode(c);
    setKind(c === "" || looksLikeBarcode(c) || !initialSupplierId ? "barcode" : "supplier_ref");
    setSupplierId(initialSupplierId ?? "");
    setProduct(null);
    setUomId("");
    setSetUom(false);
    setQuery("");
    setHits([]);
    setSearchError(null);
    setError(null);
    requestRef.current = null;
    // Só ao abrir (os valores iniciais entram uma vez).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Produto fixo: ler a unidade.
  const fixedId = fixedProduct?.id ?? null;
  const fixedName = fixedProduct?.name ?? "";
  const fixedSku = fixedProduct?.sku ?? null;
  useEffect(() => {
    if (!open || !fixedId) return;
    let cancelled = false;
    setProduct({ id: fixedId, name: fixedName, sku: fixedSku, uom_id: null, uom_code: null });
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, sku, uom_id, uom:uom_id(code)")
        .eq("id", fixedId)
        .maybeSingle();
      if (cancelled || !data) return;
      setProduct({
        id: data.id,
        name: data.name,
        sku: data.sku,
        uom_id: data.uom_id,
        uom_code: (data.uom as unknown as { code: string | null } | null)?.code ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fixedId, fixedName, fixedSku]);

  // Fornecedores (só se o pai não os deu).
  useEffect(() => {
    if (!open || suppliersProp || !organizationId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("name")
        .limit(1000);
      if (!cancelled) setLoadedSuppliers((data ?? []).map((s) => ({ id: s.id, name: s.name })));
    })();
    return () => {
      cancelled = true;
    };
  }, [open, suppliersProp, organizationId]);

  // Pesquisa de produtos (mesma lógica de DeliveryNoteDialog: nome, SKU, código de barras).
  useEffect(() => {
    const q = sanitizeQuery(query);
    if (!open || !organizationId || fixedId || q.length < 2) {
      setHits([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const pat = `"%${q.replace(/["\\]/g, "\\$&")}%"`;
    const t = window.setTimeout(async () => {
      try {
        const { data, error: err } = await supabase
          .from("products")
          .select("id, name, sku, uom_id, uom:uom_id(code)")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .eq("is_deleted", false)
          .or(`name.ilike.${pat},sku.ilike.${pat},barcode.ilike.${pat}`)
          .order("name")
          .limit(20);
        if (seq !== searchSeq.current) return;
        if (err) {
          setHits([]);
          setSearchError(err.message || "Não foi possível procurar produtos.");
          return;
        }
        setSearchError(null);
        setHits(
          (data ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            uom_id: p.uom_id,
            uom_code: (p.uom as unknown as { code: string | null } | null)?.code ?? null,
          })),
        );
      } catch {
        if (seq === searchSeq.current) {
          setHits([]);
          setSearchError("Sem ligação ao servidor — não foi possível procurar produtos.");
        }
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [query, open, organizationId, fixedId]);

  // Embalagens do produto: uom com base = unidade do produto (ou «un» global
  // se o produto ainda não tem unidade).
  useEffect(() => {
    setPacks([]);
    setPacksError(null);
    if (!open || !product || !organizationId) return;
    let cancelled = false;
    (async () => {
      try {
        let baseId = product.uom_id;
        if (!baseId) {
          const { data: un } = await supabase
            .from("uom")
            .select("id")
            .is("organization_id", null)
            .is("base_uom_id", null)
            .ilike("code", "un")
            .limit(1)
            .maybeSingle();
          baseId = un?.id ?? null;
        }
        if (!baseId) return;
        const { data, error: err } = await supabase
          .from("uom")
          .select("id, code, conversion_factor")
          .eq("base_uom_id", baseId)
          .eq("is_active", true)
          .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
          .order("conversion_factor");
        if (cancelled) return;
        if (err) {
          setPacksError(err.message || "Não foi possível ler as embalagens.");
          return;
        }
        setPacks((data ?? []).map((u) => ({ id: u.id, code: u.code, factor: u.conversion_factor })));
      } catch {
        if (!cancelled) setPacksError("Sem ligação ao servidor — não foi possível ler as embalagens.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, product, organizationId]);

  const productHasUom = !!product?.uom_id;
  const isPack = uomId !== "";
  // Embalagem num produto sem unidade só com «definir un».
  const mustSetUom = !!product && !productHasUom && isPack;
  const effectiveSetUom = !productHasUom && (setUom || mustSetUom);

  const trimmedCode = code.trim();
  const problems: string[] = [];
  if (trimmedCode === "") problems.push("Indica o código.");
  if (trimmedCode.length > 200) problems.push("Código demasiado longo (máx. 200).");
  if (!product) problems.push("Escolhe o produto.");
  if (kind === "supplier_ref" && !supplierId) problems.push("Escolhe o fornecedor da referência.");
  if (mustSetUom && !canEditProducts)
    problems.push("Este produto não tem unidade: para associar uma embalagem é preciso definir a unidade «un» (exige permissão para editar produtos).");
  const canSave = problems.length === 0 && !saving;

  const supplierOptions = useMemo(
    () => [{ value: "", label: "Escolhe o fornecedor" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))],
    [suppliers],
  );
  const unitOptions = useMemo(
    () => [
      { value: "", label: product?.uom_code ? `Unidade do produto (${product.uom_code})` : "Unidade do produto" },
      ...packs.map((p) => ({ value: p.id, label: p.factor ? `${p.code} — embalagem de ${p.factor}` : p.code })),
    ],
    [packs, product?.uom_code],
  );

  const submit = async () => {
    if (savingRef.current || !canSave || !product) return;
    const payload = {
      warehouseId,
      code: trimmedCode,
      kind,
      productId: product.id,
      uomId: isPack ? uomId : null,
      supplierId: kind === "supplier_ref" ? supplierId : null,
      setProductUom: effectiveSetUom,
    };
    const key = JSON.stringify(payload);
    if (!requestRef.current || requestRef.current.key !== key) {
      requestRef.current = { key, id: newCodeRequestId() };
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    const { data, error: err } = await learnProductCode({ id: requestRef.current.id, ...payload });
    savingRef.current = false;
    setSaving(false);
    if (err || !data) {
      setError(productCodeErrorMessage(err ?? { code: "XX000", message: "Resposta vazia do servidor." }));
      return;
    }
    onLearned(data);
    onOpenChange(false);
  };

  const kindBtn = (k: ProductCodeKind, label: string) => (
    <Button
      type="button"
      variant={kind === k ? "default" : "outline"}
      className="h-11 flex-1"
      aria-pressed={kind === k}
      onClick={() => setKind(k)}
      disabled={saving}
    >
      {kind === k && <Check className="mr-2 h-4 w-4" aria-hidden />}
      {label}
    </Button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="flex max-h-[95dvh] w-[calc(100vw-1rem)] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b p-4 pr-12 text-left">
          <DialogTitle>Associar código a um produto</DialogTitle>
          <DialogDescription>
            {warehouseId
              ? "A partir de agora, ler este código encontra o produto escolhido."
              : "Acrescenta um código de barras ou uma referência de fornecedor a este produto."}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label htmlFor="lc-code">Código</Label>
            {codeLocked ? (
              <p id="lc-code" className="break-all rounded-md border bg-muted/40 px-3 py-2.5 font-mono text-base">
                {trimmedCode}
              </p>
            ) : (
              <Input
                id="lc-code"
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 200))}
                autoComplete="off"
                className="h-11 font-mono text-base"
                disabled={saving}
              />
            )}
          </div>

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">Tipo de código</legend>
            <div className="flex gap-2">
              {kindBtn("barcode", "Código de barras")}
              {kindBtn("supplier_ref", "Ref. do fornecedor")}
            </div>
            <p className="text-xs text-muted-foreground">
              {kind === "barcode"
                ? "EAN/DUN, incluindo o de uma caixa. Único na empresa."
                : "Referência que o fornecedor usa para este produto. Única por fornecedor."}
            </p>
          </fieldset>

          {kind === "supplier_ref" && (
            <div className="space-y-1.5">
              <Label htmlFor="lc-supplier">Fornecedor *</Label>
              <NativeSelect
                id="lc-supplier"
                className="h-11 text-base"
                value={supplierId}
                onValueChange={setSupplierId}
                options={supplierOptions}
                disabled={saving}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="lc-product-search">Produto *</Label>
            {product ? (
              <div className="flex items-center gap-2 rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{product.name}</p>
                  <p className="break-all text-xs text-muted-foreground">
                    {[product.sku, product.uom_code ? `unidade ${product.uom_code}` : "sem unidade"].filter(Boolean).join(" · ")}
                  </p>
                </div>
                {!fixedProduct && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 w-11 shrink-0 p-0"
                    onClick={() => {
                      setProduct(null);
                      setUomId("");
                      setSetUom(false);
                    }}
                    disabled={saving}
                    aria-label="Trocar de produto"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="lc-product-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Nome, SKU ou código de barras"
                    autoComplete="off"
                    className="h-11 pl-9 text-base"
                    disabled={saving}
                  />
                </div>
                {searching && <p className="text-sm text-muted-foreground">A procurar…</p>}
                {!searching && searchError && (
                  <p role="alert" className="text-sm text-destructive">
                    {searchError}
                  </p>
                )}
                {!searching && !searchError && sanitizeQuery(query).length >= 2 && hits.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
                )}
                {hits.length > 0 && (
                  <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-1">
                    {hits.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setProduct(p);
                            setUomId("");
                            setSetUom(false);
                            setQuery("");
                            setHits([]);
                          }}
                          className="flex min-h-[2.75rem] w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="min-w-0 flex-1 break-words">
                            {p.name}
                            {p.sku && <span className="text-muted-foreground"> · {p.sku}</span>}
                          </span>
                          {!p.uom_id && <span className="shrink-0 text-xs text-muted-foreground">sem unidade</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          {product && (
            <div className="space-y-1.5">
              <Label htmlFor="lc-uom">O código corresponde a</Label>
              <NativeSelect
                id="lc-uom"
                className="h-11 text-base"
                value={uomId}
                onValueChange={setUomId}
                options={unitOptions}
                disabled={saving}
              />
              {packsError && <p className="text-sm text-destructive">{packsError}</p>}
              {!packsError && packs.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Não há embalagens (caixas) definidas para a unidade deste produto. Criar embalagens faz-se nas unidades de medida.
                </p>
              )}
            </div>
          )}

          {product && !productHasUom && (
            <div className="space-y-1.5 rounded-md border border-amber-500/60 bg-amber-500/10 p-3">
              <div className="flex min-h-[2.75rem] items-center gap-3">
                <Checkbox
                  id="lc-set-uom"
                  className="h-5 w-5"
                  checked={effectiveSetUom}
                  onCheckedChange={(c) => setSetUom(c === true)}
                  disabled={saving || mustSetUom || !canEditProducts}
                />
                <Label htmlFor="lc-set-uom" className="cursor-pointer font-normal">
                  Definir a unidade do produto como «un»
                </Label>
              </div>
              <p className="text-xs text-muted-foreground">
                {!canEditProducts
                  ? "O produto não tem unidade. Definir a unidade exige permissão para editar produtos — o código pode ser associado na mesma (na unidade do produto)."
                  : mustSetUom
                    ? "Obrigatório para associar uma embalagem. Recusado se o produto já tiver linhas ou ligações noutra unidade."
                    : "O produto não tem unidade. Recusado se já tiver linhas ou ligações noutra unidade."}
              </p>
            </div>
          )}

          {problems.length > 0 && product && (
            <ul className="space-y-0.5 text-sm text-muted-foreground">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="break-words text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" className="h-11" onClick={() => void submit()} disabled={!canSave}>
            {saving ? "A associar…" : error ? "Associar de novo" : "Associar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
