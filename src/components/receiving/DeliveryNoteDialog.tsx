// Criar / editar uma guia do fornecedor (Fase 2 — fatia 2).
//
// - O id da guia é gerado no cliente UMA vez por abertura do diálogo e
//   reutilizado em cada nova tentativa (rpc_delivery_note_save é idempotente:
//   repetir com os mesmos dados devolve a guia, saved=false).
// - Editar envia p_expected_updated_at (o updated_at lido); se a guia mudou
//   entretanto o servidor responde 40001 → recarrega-se e avisa-se.
// - Nº repetido no mesmo fornecedor → 23505 com o id da existente em DETAIL →
//   "Já existe a GR X — abrir?".
// - POs: só as em aberto do fornecedor (mais as já ligadas, ao editar).
//   Sem POs escolhidas = âmbito de todas as POs em aberto do fornecedor.
// - Linhas anunciadas opcionais: à mão (procura de produto) ou "Copiar em
//   aberto das POs escolhidas".
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Copy, Plus, Search, Trash2 } from "lucide-react";
import {
  FULLSCREEN_DIALOG_CLASS,
  fetchDeliveryNote,
  fmtDay,
  fmtQty,
  newClientId,
  normalizeNote,
  noteErrorMessage,
  noteLabel,
  todayIso,
  type DeliveryNoteFull,
  type RpcErrorLike,
} from "./deliveryNotes";

interface SupplierOption {
  id: string;
  name: string;
}

interface OpenPo {
  id: string;
  order_number: string | null;
  status: string;
  expected_delivery: string | null;
  /** Já ligada à guia mas fora das em aberto (só ao editar). */
  linkedOnly?: boolean;
}

interface LineDraft {
  key: string;
  product_id: string;
  product_name: string;
  sku: string | null;
  uom_id: string | null;
  uom_code: string | null;
  qtyText: string;
  purchase_order_item_id: string | null;
  order_number: string | null;
  description: string | null;
}

interface ProductHit {
  id: string;
  name: string;
  sku: string | null;
  uom_code: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string | null;
  /** Fornecedores da empresa (para criar). */
  suppliers?: SupplierOption[];
  /** Fornecedor sugerido ao criar. */
  defaultSupplierId?: string;
  /** Guia a editar (null/undefined = criar). */
  note?: DeliveryNoteFull | null;
  onSaved: (note: DeliveryNoteFull) => void;
  onOpenExisting: (id: string) => void;
}

const OPEN_PO_STATUSES = ["pending", "ordered", "partially_received"];

const parseQty = (t: string) => {
  const s = t.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  return Number(s);
};

const linesFromNote = (n: DeliveryNoteFull): LineDraft[] =>
  n.lines.map((l) => ({
    key: l.id,
    product_id: l.product_id,
    product_name: l.product_name ?? "Produto",
    sku: l.sku,
    uom_id: l.uom_id,
    uom_code: l.uom_code,
    qtyText: String(l.quantity),
    purchase_order_item_id: l.purchase_order_item_id,
    order_number: l.order_number,
    description: l.description,
  }));

export function DeliveryNoteDialog({ open, onOpenChange, orgId, suppliers = [], defaultSupplierId, note, onSaved, onOpenExisting }: Props) {
  /**
   * A guia já existe no servidor. Começa como !!note; passa a true quando um
   * "criar" repetido (depois de uma falha de rede) descobre que a guia já
   * ficou gravada — a partir daí grava-se como edição, com o updated_at lido.
   */
  const [editing, setEditing] = useState(!!note);
  /** Nº gravado no servidor (título "Editar guia …"). */
  const [savedNumber, setSavedNumber] = useState<string | null>(note?.note_number ?? null);
  const [noteId, setNoteId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [number, setNumber] = useState("");
  const [docDate, setDocDate] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedPos, setSelectedPos] = useState<Set<string>>(() => new Set());
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState<string | null>(null);

  const [pos, setPos] = useState<OpenPo[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);

  const [productQuery, setProductQuery] = useState("");
  const [productHits, setProductHits] = useState<ProductHit[]>([]);
  const [productSearching, setProductSearching] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ id: string; number: string } | null>(null);
  const savingRef = useRef(false);
  const searchSeq = useRef(0);

  const loadFromNote = (n: DeliveryNoteFull) => {
    setNoteId(n.id);
    setSupplierId(n.supplier_id);
    setSupplierName(n.supplier_name);
    setNumber(n.note_number);
    setDocDate(n.document_date ?? "");
    setNotes(n.notes ?? "");
    setSelectedPos(new Set(n.purchase_orders.map((p) => p.purchase_order_id)));
    setLines(linesFromNote(n));
    setExpectedUpdatedAt(n.updated_at);
    setSavedNumber(n.note_number);
  };

  // Cada abertura: id novo (criar) ou dados da guia (editar).
  useEffect(() => {
    if (!open) return;
    setError(null);
    setInfo(null);
    setDuplicate(null);
    setProductQuery("");
    setProductHits([]);
    setProductError(null);
    setEditing(!!note);
    if (note) {
      loadFromNote(note);
    } else {
      setNoteId(newClientId());
      setSavedNumber(null);
      setSupplierId(defaultSupplierId ?? "");
      setSupplierName(null);
      setNumber("");
      // Data obrigatória: por omissão a de hoje (corrige-se se a guia for de outro dia).
      setDocDate(todayIso());
      setNotes("");
      setSelectedPos(new Set());
      setLines([]);
      setExpectedUpdatedAt(null);
    }
    // Só ao abrir: os dados da guia entram uma vez (não a cada render do pai).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // POs em aberto do fornecedor (+ as já ligadas, ao editar).
  useEffect(() => {
    if (!open || !orgId || !supplierId) {
      setPos([]);
      return;
    }
    let cancelled = false;
    setPosLoading(true);
    setPosError(null);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from("purchase_orders")
          .select("id, order_number, status, expected_delivery")
          .eq("organization_id", orgId)
          .eq("supplier_id", supplierId)
          .is("deleted_at", null)
          .in("status", OPEN_PO_STATUSES)
          .order("order_date", { ascending: true })
          .limit(300);
        if (cancelled) return;
        if (err) {
          setPosError(err.message || "Não foi possível carregar as encomendas.");
          setPos([]);
          return;
        }
        const list: OpenPo[] = (data ?? []).map((p) => ({
          id: p.id,
          order_number: p.order_number,
          status: p.status,
          expected_delivery: p.expected_delivery,
        }));
        for (const lp of note?.purchase_orders ?? []) {
          if (!list.some((p) => p.id === lp.purchase_order_id)) {
            list.push({
              id: lp.purchase_order_id,
              order_number: lp.order_number,
              status: lp.status,
              expected_delivery: lp.expected_delivery,
              linkedOnly: true,
            });
          }
        }
        setPos(list);
      } catch {
        if (!cancelled) setPosError("Sem ligação ao servidor — não foi possível carregar as encomendas.");
      } finally {
        if (!cancelled) setPosLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, supplierId, note]);

  // Procura de produtos para linhas à mão (nome, SKU ou código de barras).
  useEffect(() => {
    // Fora do termo tudo o que tem significado na sintaxe do .or() do PostgREST
    // (vírgula, parênteses, aspas, dois pontos, ponto) ou do ilike (%, *, \).
    const q = productQuery.trim().replace(/[,()%*\\":.]/g, " ").replace(/\s+/g, " ").trim();
    if (!open || !orgId || q.length < 2) {
      setProductHits([]);
      setProductSearching(false);
      setProductError(null);
      return;
    }
    const seq = ++searchSeq.current;
    setProductSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const { data, error: searchErr } = await supabase
          .from("products")
          .select("id, name, sku, uom:uom_id(code)")
          .eq("organization_id", orgId)
          .is("deleted_at", null)
          .eq("is_deleted", false)
          .or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
          .order("name")
          .limit(20);
        if (seq !== searchSeq.current) return;
        if (searchErr) {
          setProductHits([]);
          setProductError(searchErr.message || "Não foi possível procurar produtos.");
          return;
        }
        setProductError(null);
        setProductHits(
          (data ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            uom_code: (p.uom as unknown as { code: string | null } | null)?.code ?? null,
          })),
        );
      } catch {
        if (seq === searchSeq.current) {
          setProductHits([]);
          setProductError("Sem ligação ao servidor — não foi possível procurar produtos.");
        }
      } finally {
        if (seq === searchSeq.current) setProductSearching(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [productQuery, open, orgId]);

  const supplierOptions = useMemo(
    () => [{ value: "", label: "Escolhe o fornecedor" }, ...suppliers.map((s) => ({ value: s.id, label: s.name }))],
    [suppliers],
  );

  const handleSupplierChange = (id: string) => {
    if (editing) return; // o fornecedor de uma guia não muda
    setSupplierId(id);
    // POs e linhas são do fornecedor: começam de novo.
    setSelectedPos(new Set());
    setLines([]);
    setDuplicate(null);
  };

  const togglePo = (id: string, checked: boolean) => {
    setSelectedPos((cur) => {
      const next = new Set(cur);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const copyOpenLines = async () => {
    const ids = Array.from(selectedPos);
    if (ids.length === 0) return;
    setCopying(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("purchase_order_items")
        .select("id, purchase_order_id, product_id, quantity, received_quantity, uom_id, description, uom:uom_id(code), products(name, sku, uom:uom_id(code))")
        .in("purchase_order_id", ids)
        .eq("item_type", "product");
      if (err) {
        setError(err.message || "Não foi possível ler as linhas das encomendas.");
        return;
      }
      const orderNumbers = new Map(pos.map((p) => [p.id, p.order_number]));
      const candidates: LineDraft[] = [];
      for (const it of data ?? []) {
        const open = Number(it.quantity) - Number(it.received_quantity);
        if (!it.product_id || !(open > 0)) continue;
        const prod = it.products as unknown as { name: string | null; sku: string | null; uom: { code: string | null } | null } | null;
        const lineUom = (it.uom as unknown as { code: string | null } | null)?.code ?? null;
        candidates.push({
          key: newClientId(),
          product_id: it.product_id,
          product_name: prod?.name ?? it.description ?? "Produto",
          sku: prod?.sku ?? null,
          uom_id: it.uom_id,
          uom_code: lineUom ?? prod?.uom?.code ?? null,
          qtyText: String(open),
          purchase_order_item_id: it.id,
          order_number: orderNumbers.get(it.purchase_order_id) ?? null,
          description: null,
        });
      }
      const fresh = candidates.filter((c) => !lines.some((l) => l.purchase_order_item_id === c.purchase_order_item_id));
      setLines((cur) => [...cur, ...fresh.filter((c) => !cur.some((l) => l.purchase_order_item_id === c.purchase_order_item_id))]);
      setInfo(fresh.length > 0 ? null : "Não há linhas em aberto por copiar nas encomendas escolhidas.");
    } catch {
      setError("Sem ligação ao servidor — não foi possível copiar as linhas.");
    } finally {
      setCopying(false);
    }
  };

  const addProductLine = (p: ProductHit) => {
    setLines((cur) => [
      ...cur,
      {
        key: newClientId(),
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        uom_id: null,
        uom_code: p.uom_code,
        qtyText: "1",
        purchase_order_item_id: null,
        order_number: null,
        description: null,
      },
    ]);
    setProductQuery("");
    setProductHits([]);
  };

  const invalidLines = lines.filter((l) => !(parseQty(l.qtyText) > 0));
  const canSave = !!supplierId && number.trim() !== "" && docDate !== "" && invalidLines.length === 0 && !saving;

  const save = async () => {
    if (savingRef.current || !canSave || !noteId) return;
    // Capturado no início: o modo pode mudar (criar → editar) no fim desta gravação.
    const wasEditing = editing;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    setInfo(null);
    setDuplicate(null);
    let err: RpcErrorLike | undefined;
    let saved: DeliveryNoteFull | null = null;
    try {
      const { data, error: rpcErr } = await supabase.rpc("rpc_delivery_note_save", {
        p_delivery_note_id: noteId,
        p_supplier_id: supplierId,
        p_note_number: number.trim(),
        p_document_date: docDate || undefined,
        p_notes: notes.trim() || undefined,
        p_purchase_order_ids: Array.from(selectedPos),
        p_lines: lines.map((l) => ({
          product_id: l.product_id,
          uom_id: l.uom_id,
          quantity: parseQty(l.qtyText),
          purchase_order_item_id: l.purchase_order_item_id,
          description: l.description,
        })) as unknown as Json,
        p_expected_updated_at: wasEditing ? (expectedUpdatedAt ?? undefined) : undefined,
      });
      if (rpcErr) err = rpcErr;
      else saved = normalizeNote(data);
    } catch (ex) {
      err = { message: String(ex) };
    } finally {
      savingRef.current = false;
      setSaving(false);
    }

    if (saved) {
      onSaved(saved);
      onOpenChange(false);
      return;
    }
    if (err?.code === "23505") {
      setDuplicate({ id: (err.details ?? "").trim(), number: number.trim() });
      return;
    }
    if (err?.code === "40001" && !wasEditing) {
      // Criar repetido depois de uma falha de rede, já com outros dados: a guia
      // com este id já existe (o 1.º envio ficou gravado, com os dados de
      // então). NÃO se fecha como se tivesse gravado o que está no ecrã: passa
      // a edição dessa guia (updated_at acertado), mantendo o que a pessoa
      // escreveu, e pede para rever e gravar de novo.
      const r = await fetchDeliveryNote(noteId);
      if (r.note) {
        const stored = r.note;
        setEditing(true);
        setSavedNumber(stored.note_number);
        setSupplierName(stored.supplier_name);
        setExpectedUpdatedAt(stored.updated_at);
        if (stored.status !== "open") {
          loadFromNote(stored);
          setError(
            `A guia ${noteLabel(stored.note_number)} já tinha ficado gravada e está agora ${stored.status === "closed" ? "fechada" : "cancelada"} — já não pode ser editada.`,
          );
          return;
        }
        if (stored.supplier_id !== supplierId) {
          // O fornecedor de uma guia não muda: repõe-se tudo como ficou gravado.
          loadFromNote(stored);
          setError(
            `A guia já tinha ficado gravada (${noteLabel(stored.note_number)}), com outro fornecedor (${stored.supplier_name ?? "fornecedor"}). Recarreguei os dados gravados — revê e grava de novo.`,
          );
          return;
        }
        setError(
          `A guia já tinha ficado gravada (${noteLabel(stored.note_number)}) com dados diferentes destes. Mantive o que escreveste — revê e grava de novo.`,
        );
        return;
      }
      setError(`${noteErrorMessage(err)} Tenta de novo.`);
      return;
    }
    if (err?.code === "40001" && wasEditing) {
      // Alterada por outra pessoa: recarrega e avisa (as alterações feitas aqui perdem-se).
      const r = await fetchDeliveryNote(noteId);
      if (r.note) {
        loadFromNote(r.note);
        setError(
          r.note.status === "open"
            ? "A guia foi alterada entretanto por outra pessoa. Recarreguei os dados atuais — revê e grava de novo."
            : `A guia foi alterada entretanto e está agora ${r.note.status === "closed" ? "fechada" : "cancelada"} — já não pode ser editada.`,
        );
      } else {
        setError(`${noteErrorMessage(err)} Não foi possível recarregar a guia.`);
      }
      return;
    }
    // Sem resposta: o id fica (gravar de novo não cria outra guia).
    setError(
      err?.code
        ? noteErrorMessage(err)
        : "Sem ligação ao servidor. A guia pode ter ficado gravada — carrega em Gravar de novo (não cria outra).",
    );
  };

  const supplierLabel = editing
    ? (supplierName ?? suppliers.find((s) => s.id === supplierId)?.name ?? "Fornecedor")
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className={FULLSCREEN_DIALOG_CLASS}>
        <DialogHeader className="border-b p-4 pr-12 text-left">
          <DialogTitle>{editing ? `Editar guia ${noteLabel(savedNumber ?? note?.note_number)}` : "Nova guia do fornecedor"}</DialogTitle>
          <DialogDescription>
            Regista a guia de remessa que veio com a mercadoria. As encomendas escolhidas limitam onde as leituras recebem.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="dn-supplier">Fornecedor *</Label>
              {editing ? (
                <p id="dn-supplier" className="rounded-md border bg-muted/40 px-3 py-2.5 text-base">
                  {supplierLabel}
                </p>
              ) : (
                <NativeSelect
                  id="dn-supplier"
                  className="h-12 text-base"
                  value={supplierId}
                  onValueChange={handleSupplierChange}
                  options={supplierOptions}
                  disabled={saving}
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dn-number">Nº da guia *</Label>
              <Input
                id="dn-number"
                value={number}
                onChange={(e) => {
                  setNumber(e.target.value);
                  setDuplicate(null);
                }}
                maxLength={100}
                autoComplete="off"
                className="h-12 text-base"
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dn-date">Data da guia *</Label>
              <Input
                id="dn-date"
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                required
                aria-required="true"
                aria-invalid={docDate === ""}
                aria-describedby={docDate === "" ? "dn-date-error" : undefined}
                className={`h-12 text-base ${docDate === "" ? "border-destructive" : ""}`}
                disabled={saving}
              />
              {docDate === "" && (
                <p id="dn-date-error" className="text-sm text-destructive">
                  Indica a data da guia.
                </p>
              )}
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="dn-notes">Notas</Label>
              <Textarea
                id="dn-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
                rows={2}
                disabled={saving}
              />
            </div>
          </div>

          {/* Encomendas da guia */}
          <section aria-labelledby="dn-pos-title" className="space-y-2">
            <h3 id="dn-pos-title" className="font-semibold">
              Encomendas a fornecedor
            </h3>
            <p className="text-sm text-muted-foreground">
              Sem nenhuma escolhida, as leituras podem receber em todas as encomendas em aberto deste fornecedor.
            </p>
            {!supplierId ? (
              <p className="text-sm text-muted-foreground">Escolhe primeiro o fornecedor.</p>
            ) : posLoading ? (
              <p className="text-sm text-muted-foreground">A carregar encomendas…</p>
            ) : posError ? (
              <p className="text-sm text-destructive">{posError}</p>
            ) : pos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Este fornecedor não tem encomendas em aberto.</p>
            ) : (
              <ul className="space-y-1">
                {pos.map((p) => {
                  const id = `dn-po-${p.id}`;
                  return (
                    <li key={p.id} className="flex min-h-[2.75rem] items-center gap-3 rounded-md border px-3 py-2">
                      <Checkbox
                        id={id}
                        className="h-5 w-5"
                        checked={selectedPos.has(p.id)}
                        onCheckedChange={(c) => togglePo(p.id, c === true)}
                        disabled={saving}
                      />
                      <Label htmlFor={id} className="min-w-0 flex-1 cursor-pointer font-normal">
                        <span className="font-medium">{p.order_number ?? "PO"}</span>
                        <span className="text-muted-foreground">
                          {p.expected_delivery ? ` · previsto ${fmtDay(p.expected_delivery)}` : ""}
                          {p.linkedOnly ? " · já não está em aberto" : ""}
                        </span>
                      </Label>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Linhas anunciadas */}
          <section aria-labelledby="dn-lines-title" className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="dn-lines-title" className="font-semibold">
                Linhas anunciadas (opcional)
              </h3>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => void copyOpenLines()}
                disabled={saving || copying || selectedPos.size === 0}
              >
                <Copy className="mr-2 h-4 w-4" />
                {copying ? "A copiar…" : "Copiar em aberto das POs escolhidas"}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Com linhas, a receção avisa o que não consta da guia ou passa do anunciado, e o fecho mostra faltas e excessos.
            </p>

            {lines.length > 0 && (
              <ul className="space-y-2">
                {lines.map((l) => {
                  const qid = `dn-qty-${l.key}`;
                  const bad = !(parseQty(l.qtyText) > 0);
                  return (
                    <li key={l.key} className="flex flex-wrap items-center gap-2 rounded-md border p-2">
                      <div className="min-w-0 flex-1 basis-48">
                        <p className="break-words text-sm font-medium">{l.product_name}</p>
                        <p className="break-all text-xs text-muted-foreground">
                          {[l.sku, l.order_number ? `linha de ${l.order_number}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <Label htmlFor={qid} className="sr-only">
                        Quantidade de {l.product_name}
                      </Label>
                      <Input
                        id={qid}
                        value={l.qtyText}
                        onChange={(e) =>
                          setLines((cur) => cur.map((x) => (x.key === l.key ? { ...x, qtyText: e.target.value.slice(0, 15) } : x)))
                        }
                        inputMode="decimal"
                        aria-invalid={bad}
                        className={`h-11 w-24 text-center ${bad ? "border-destructive" : ""}`}
                        disabled={saving}
                      />
                      <span className="w-12 text-sm text-muted-foreground">{l.uom_code || "un."}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 w-11 shrink-0 p-0 text-destructive hover:text-destructive"
                        onClick={() => setLines((cur) => cur.filter((x) => x.key !== l.key))}
                        disabled={saving}
                        aria-label={`Remover ${l.product_name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {invalidLines.length > 0 && (
              <p className="text-sm text-destructive">Cada linha tem de ter uma quantidade positiva.</p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="dn-product-search">Acrescentar produto</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="dn-product-search"
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="Nome, SKU ou código de barras"
                  autoComplete="off"
                  className="h-11 pl-9 text-base"
                  disabled={saving}
                />
              </div>
              {productSearching && <p className="text-sm text-muted-foreground">A procurar…</p>}
              {!productSearching && productError && (
                <p role="alert" className="text-sm text-destructive">
                  {productError}
                </p>
              )}
              {!productSearching && !productError && productQuery.trim().length >= 2 && productHits.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
              )}
              {productHits.length > 0 && (
                <ul className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-1">
                  {productHits.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addProductLine(p)}
                        className="flex min-h-[2.75rem] w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Plus className="h-4 w-4 shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1 break-words">
                          {p.name}
                          {p.sku && <span className="text-muted-foreground"> · {p.sku}</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {lines.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {lines.length} {lines.length === 1 ? "linha" : "linhas"} ·{" "}
                {fmtQty(lines.reduce((s, l) => s + (parseQty(l.qtyText) || 0), 0))} no total (na unidade de cada linha)
              </p>
            )}
          </section>

          {info && <p className="text-sm text-muted-foreground">{info}</p>}
          {duplicate && (
            <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden />
              <span className="min-w-0 flex-1">Já existe a {noteLabel(duplicate.number)} deste fornecedor — abrir?</span>
              {duplicate.id && (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    onOpenChange(false);
                    onOpenExisting(duplicate.id);
                  }}
                >
                  Abrir a guia existente
                </Button>
              )}
            </div>
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
          <Button type="button" className="h-11" onClick={() => void save()} disabled={!canSave}>
            {saving ? "A gravar…" : error && !duplicate ? "Gravar de novo" : "Gravar guia"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
