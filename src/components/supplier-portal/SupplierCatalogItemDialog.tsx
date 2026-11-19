import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ImagePlus, Loader2, RotateCcw, Star, Trash2, X } from "lucide-react";
import {
  spCatalogCategorias,
  spCatalogClassificarItem,
  spCatalogUpsertItem,
  spErrorMessage,
  isNoSupplierAccess,
  type SpCatalogItem,
  type SpCatalogRowInput,
  type SpCategoria,
} from "@/lib/supplierPortal/spRpc";
import { skuPrevisto } from "@/lib/supplierPortal/skuPortal";
import { UNIDADES } from "@/lib/supplierPortal/listasArtigo";
import { UNIDADES_SERVICO, kindOf, useDistritos, type ItemKind } from "@/lib/supplierPortal/servicoCatalogo";
// Fotos: importadas do módulo próprio (o spRpc reexporta-as) para os testes que simulam o spRpc continuarem válidos.
import {
  CATALOG_IMAGE_MAX_COUNT,
  CATALOG_IMAGE_MIME,
  CatalogImageError,
  catalogImageUrl,
  removeCatalogImage,
  setMainCatalogImage,
  uploadCatalogImage,
} from "@/lib/supplierPortal/catalogImages";
import {
  corCanonicaPortal,
  juntarMensagens,
  mensagemErroFoto,
  opcoesDeCor,
  opcoesDeUnidade,
  validarFotoCatalogo,
} from "@/lib/supplierPortal/textosCatalogo";
import { mensagemDeChave, mensagemDeTexto, resolverMensagem, traduzir, usePortalT, type MensagemDoPortal } from "@/portal-i18n";

/** As categorias por empresa cliente, pela ordem em que vêm (a base já ordena por empresa). */
export function gruposEmpresa(cs: readonly SpCategoria[]): [string, SpCategoria[]][] {
  const m = new Map<string, SpCategoria[]>();
  for (const c of cs) { const k = c.empresa ?? ""; m.set(k, [...(m.get(k) ?? []), c]); }
  return [...m];
}

interface SupplierCatalogItemDialogProps {
  open: boolean;
  /** null = criar artigo novo. */
  item: SpCatalogItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (item: SpCatalogItem, created: boolean) => void;
  onNoAccess: () => void;
  /** As fotos mudaram sem fechar o diálogo (carregar/remover/principal): o artigo atualizado. */
  onImagesChanged?: (item: SpCatalogItem) => void;
  /** Só o titular (owner) altera as fotos; os outros só as veem. */
  canEditPhotos?: boolean;
}

/** Foto escolhida que ainda não está no artigo (fila até gravar, ou a carregar). */
interface PendingPhoto {
  key: string;
  file: File;
  /** URL local (object URL) para a pré-visualização; vazio sem suporte. */
  preview: string;
  status: "queued" | "uploading" | "error";
  /** A mensagem fica como mensagem (chave ou texto do servidor) e traduz-se ao mostrar. */
  error?: MensagemDoPortal;
}

let pendingSeq = 0;
const makePreview = (file: File): string =>
  typeof URL !== "undefined" && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : "";
const revokePreview = (url: string) => {
  if (url && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
};
const isNoAccessImageError = (err: unknown) => err instanceof CatalogImageError && err.code === "no_supplier_access";
/** O artigo devolvido pela Edge traz o JSON completo; junta-se ao atual por cautela. */
const mergeItem = (base: SpCatalogItem, fromEdge: { image_paths: string[] }): SpCatalogItem =>
  ({ ...base, ...(fromEdge as Partial<SpCatalogItem>), image_paths: fromEdge.image_paths ?? [] });

interface FormState {
  supplier_ref: string;
  name: string;
  barcode: string;
  brand: string;
  description: string;
  unit_label: string;
  units_per_pack: string;
  base_price: string;
  currency: string;
  moq: string;
  lead_time_days: string;
  is_active: boolean;
  // 29/10: a classificação que dá o SKU (categoria-subcategoria-medida-cor)
  categoria_id: string;
  subcategoria_id: string;
  medida: string;
  cor: string;
  // Fase 5: produto | serviço (subempreitada)
  item_kind: ItemKind;
  service_districts: string[];
  mobilization_days: string;
}

const numToText = (n: number | null | undefined): string =>
  n === null || n === undefined ? "" : String(n).replace(".", ",");

function toForm(item: SpCatalogItem | null): FormState {
  return {
    supplier_ref: item?.supplier_ref ?? "",
    name: item?.name ?? "",
    barcode: item?.barcode ?? "",
    brand: item?.brand ?? "",
    description: item?.description ?? "",
    unit_label: item?.unit_label ?? "",
    units_per_pack: numToText(item?.units_per_pack),
    base_price: numToText(item?.base_price),
    currency: item?.currency ?? "EUR",
    moq: numToText(item?.moq),
    lead_time_days: item?.lead_time_days === null || item?.lead_time_days === undefined ? "" : String(item.lead_time_days),
    is_active: item?.is_active ?? true,
    categoria_id: item?.categoria_id ?? "",
    subcategoria_id: item?.subcategoria_id ?? "",
    medida: item?.medida ?? "",
    cor: item?.cor ?? "",
    item_kind: item ? kindOf(item) : "produto",
    service_districts: item?.service_districts ?? [],
    mobilization_days: item?.mobilization_days === null || item?.mobilization_days === undefined ? "" : String(item.mobilization_days),
  };
}

const SELECT = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50";

const TEXT_FIELDS = [
  "supplier_ref", "name", "barcode", "brand", "description", "unit_label",
  "units_per_pack", "base_price", "currency", "moq", "lead_time_days",
] as const;

// Serviço: sem código de barras, marca, embalagem, mínimo nem prazo de entrega (tem prazo de mobilização).
const SERVICE_TEXT_FIELDS = ["supplier_ref", "name", "description", "unit_label", "base_price", "currency", "mobilization_days"] as const;

/** Criar/editar um artigo (sp_catalog_upsert_item). Só para o owner. */
export function SupplierCatalogItemDialog({
  open, item: itemProp, onOpenChange, onSaved, onNoAccess, onImagesChanged, canEditPhotos = true,
}: SupplierCatalogItemDialogProps) {
  const { t, idioma } = usePortalT();
  const [form, setForm] = useState<FormState>(() => toForm(itemProp));
  const [saving, setSaving] = useState(false);
  // Os erros ficam em estado como mensagens (chave, texto do servidor ou função do idioma) e traduzem-se ao mostrar:
  // mudar de idioma com o erro visível muda também o erro. O que vem do servidor fica como vem.
  const [erro, setErro] = useState<MensagemDoPortal | null>(null);
  const error = resolverMensagem(erro, idioma);
  // Artigo novo gravado nesta abertura (as fotos falharam e o diálogo ficou aberto): passa a editar esse.
  const [createdItem, setCreatedItem] = useState<SpCatalogItem | null>(null);
  const item = itemProp ?? createdItem;
  const isEdit = !!item;

  // Fotos: as gravadas no artigo (ordem = apresentação; a 1.ª é a principal) e as por carregar.
  const [paths, setPaths] = useState<string[]>(() => itemProp?.image_paths ?? []);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [photoErro, setPhotoErro] = useState<MensagemDoPortal | null>(null);
  const photoError = photoErro ? resolverMensagem(photoErro, idioma) : null;
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<PendingPhoto[]>([]);
  pendingRef.current = pending;
  const uploading = pending.some((p) => p.status === "uploading");
  const photoCount = paths.length + pending.length;
  // null: a lista ainda não veio ou a base não a tem (migration por aplicar): o formulário fica como antes, sem SKU
  const [categorias, setCategorias] = useState<SpCategoria[] | null>(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(itemProp));
      setErro(null);
      setCreatedItem(null);
      setPaths(itemProp?.image_paths ?? []);
      setPending((prev) => { prev.forEach((p) => revokePreview(p.preview)); return []; });
      setPhotoBusy(null);
      setPhotoErro(null);
      setConfirmRemove(null);
    }
  }, [open, itemProp]);
  // Liberta as pré-visualizações locais ao desmontar.
  useEffect(() => () => pendingRef.current.forEach((p) => revokePreview(p.preview)), []);
  useEffect(() => {
    if (!open || categorias) return;
    let vivo = true;
    spCatalogCategorias().then((c) => { if (vivo) setCategorias(c.length ? c : null); }).catch(() => { /* sem a lista, sem SKU */ });
    return () => { vivo = false; };
  }, [open, categorias]);

  const categoria = categorias?.find((c) => c.id === form.categoria_id);
  const subcategoria = categoria?.subcategorias.find((s) => s.id === form.subcategoria_id);
  const skuVisto = skuPrevisto(categoria?.codigo, subcategoria?.codigo, form.medida, form.cor, item?.sku,
    !!item && item.categoria_id === form.categoria_id && (item.subcategoria_id ?? null) === (form.subcategoria_id || null));

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const isService = form.item_kind === "servico";
  const unidades = isService ? UNIDADES_SERVICO : UNIDADES;
  const { distritos, erro: distritosErro } = useDistritos(open && isService);

  // Mudar o tipo: a unidade só fica se existir na lista do outro tipo.
  const setKind = (kind: ItemKind) =>
    setForm((f) => {
      if (f.item_kind === kind) return f;
      const lista = kind === "servico" ? UNIDADES_SERVICO : UNIDADES;
      return { ...f, item_kind: kind, unit_label: lista.some(([v]) => v === f.unit_label) ? f.unit_label : "" };
    });
  const toggleDistrito = (code: string, on: boolean) =>
    setForm((f) => ({
      ...f,
      service_districts: on ? [...new Set([...f.service_districts, code])] : f.service_districts.filter((c) => c !== code),
    }));

  // ─── Fotos ──────────────────────────────────────────────────────────────
  const updatePending = (key: string, patch: Partial<PendingPhoto>) =>
    setPending((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const dropPending = (key: string) =>
    setPending((prev) => {
      const gone = prev.find((p) => p.key === key);
      if (gone) revokePreview(gone.preview);
      return prev.filter((p) => p.key !== key);
    });

  /**
   * Carrega as fotos em fila, uma de cada vez (ficam no fim, pela ordem). As que falham ficam na
   * fila com o erro, para tentar de novo. Devolve o artigo mais recente e o 1.º erro.
   */
  const uploadPending = async (
    base: SpCatalogItem,
    entries: PendingPhoto[],
  ): Promise<{ latest: SpCatalogItem | null; failed: number; firstError: MensagemDoPortal | null; noAccess: boolean }> => {
    let latest: SpCatalogItem | null = null;
    let failed = 0;
    let firstError: MensagemDoPortal | null = null;
    for (const entry of entries) {
      updatePending(entry.key, { status: "uploading", error: undefined });
      try {
        const res = await uploadCatalogImage(base.id, entry.file);
        latest = mergeItem(latest ?? base, res.item);
        setPaths(latest.image_paths ?? []);
        dropPending(entry.key);
      } catch (err) {
        if (isNoAccessImageError(err)) return { latest, failed: failed + 1, firstError, noAccess: true };
        const msg = mensagemErroFoto(err);
        failed += 1;
        firstError ??= msg;
        updatePending(entry.key, { status: "error", error: msg });
      }
    }
    return { latest, failed, firstError, noAccess: false };
  };

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0 || !canEditPhotos) return;
    setPhotoErro(null);
    const accepted: PendingPhoto[] = [];
    const problems: MensagemDoPortal[] = [];
    let count = photoCount;
    for (const file of Array.from(list)) {
      const why = validarFotoCatalogo(file, count);
      if (why) {
        // «nome.jpg: motivo» (o nome do ficheiro não se traduz); no limite, só o motivo.
        problems.push(
          count >= CATALOG_IMAGE_MAX_COUNT ? why : { de: (idioma) => `${file.name}: ${resolverMensagem(why, idioma)}` },
        );
        if (count >= CATALOG_IMAGE_MAX_COUNT) break;
        continue;
      }
      count += 1;
      accepted.push({ key: `p${++pendingSeq}`, file, preview: makePreview(file), status: "queued" });
    }
    if (problems.length) setPhotoErro(juntarMensagens(problems));
    if (accepted.length === 0) return;
    setPending((prev) => [...prev, ...accepted]);
    // Artigo já existe: carrega já. Artigo novo: ficam em fila até gravar.
    if (item) {
      const r = await uploadPending(item, accepted);
      if (r.noAccess) { onNoAccess(); return; }
      if (r.latest) onImagesChanged?.(r.latest);
      if (r.failed) setPhotoErro(r.firstError);
    }
  };

  const retryPending = async (entry: PendingPhoto) => {
    if (!item) return;
    setPhotoErro(null);
    const r = await uploadPending(item, [entry]);
    if (r.noAccess) { onNoAccess(); return; }
    if (r.latest) onImagesChanged?.(r.latest);
    if (r.failed) setPhotoErro(r.firstError);
    else if (!pendingRef.current.some((p) => p.key !== entry.key && p.status === "error")) setErro(null);
  };

  /** Artigo novo: a foto em fila passa a ser a 1.ª (a principal ao gravar). */
  const queueAsMain = (key: string) =>
    setPending((prev) => {
      const e = prev.find((p) => p.key === key);
      return e ? [e, ...prev.filter((p) => p.key !== key)] : prev;
    });

  const runPhotoAction = async (path: string, action: () => Promise<{ item: { image_paths: string[] } }>) => {
    if (!item) return;
    setPhotoBusy(path);
    setPhotoErro(null);
    try {
      const res = await action();
      const next = mergeItem(item, res.item);
      setPaths(next.image_paths ?? []);
      onImagesChanged?.(next);
    } catch (err) {
      if (isNoAccessImageError(err)) { onNoAccess(); return; }
      setPhotoErro(mensagemErroFoto(err));
    } finally {
      setPhotoBusy(null);
    }
  };
  const makeMain = (path: string) => item && runPhotoAction(path, () => setMainCatalogImage(item.id, paths, path));
  const removePhoto = (path: string) => item && runPhotoAction(path, () => removeCatalogImage(item.id, path));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!form.supplier_ref.trim() || !form.name.trim()) {
      setErro(mensagemDeChave("sp.catalogo.artigo.erro.obrigatorios"));
      return;
    }
    if (isService) {
      if (!form.unit_label) {
        setErro(mensagemDeChave("sp.catalogo.artigo.erro.unidadeServico"));
        return;
      }
      if (form.service_districts.length === 0) {
        setErro(mensagemDeChave("sp.catalogo.artigo.erro.zona"));
        return;
      }
    } else {
      if (categorias && !categoria) {
        setErro(mensagemDeChave("sp.catalogo.artigo.erro.categoria"));
        return;
      }
      if (categorias && categoria && categoria.subcategorias.length && !subcategoria) {
        setErro(mensagemDeChave("sp.catalogo.artigo.erro.subcategoria"));
        return;
      }
    }

    // Editar: envia todas as chaves (vazio = limpar). Criar: só as preenchidas.
    const payload: SpCatalogRowInput & { id?: string } = { item_kind: form.item_kind };
    for (const k of isService ? SERVICE_TEXT_FIELDS : TEXT_FIELDS) {
      const v = form[k].trim();
      if (isEdit || v !== "") payload[k] = v;
    }
    if (isService) payload.service_districts = form.service_districts;
    if (isEdit) {
      payload.id = item!.id;
      payload.is_active = form.is_active;
    }

    setSaving(true);
    try {
      const res = await spCatalogUpsertItem(payload);
      // Criado nesta abertura (mesmo que agora seja a 2.ª gravação, depois de uma foto falhar).
      const created = res.created || !!createdItem;
      let saved: SpCatalogItem = res.item;
      // 29/10: a classificação grava-se a seguir; a base gera o SKU e devolve o artigo com ele
      let classifyError: MensagemDoPortal | null = null;
      if (!isService && categorias && categoria) {
        try {
          saved = (await spCatalogClassificarItem(saved.id, {
            categoria_id: categoria.id, subcategoria_id: subcategoria?.id ?? null, medida: form.medida.trim(), cor: form.cor.trim(),
          })).item;
        } catch (err) {
          if (isNoSupplierAccess(err)) { onNoAccess(); return; }
          // o artigo ficou gravado; falta a classificação
          classifyError = mensagemDeChave("sp.catalogo.artigo.erro.categoriaNaoGravada", { erro: spErrorMessage(err) });
        }
      }
      // Fotos em fila (artigo novo, ou as que falharam antes): só agora há id. O artigo já está gravado.
      const queue = pendingRef.current.filter((p) => p.status !== "uploading");
      if (queue.length && canEditPhotos) {
        if (!itemProp) setCreatedItem(saved);
        const r = await uploadPending(saved, queue);
        if (r.noAccess) { onNoAccess(); return; }
        if (r.latest) saved = { ...saved, image_paths: r.latest.image_paths };
        if (r.failed) {
          onImagesChanged?.(saved);
          const nFalhas = r.failed;
          const primeiroErro = r.firstError;
          setErro({
            de: (lang) => {
              const fotos = traduzir(lang, nFalhas === 1 ? "sp.catalogo.artigo.erro.fotoUma" : "sp.catalogo.artigo.erro.fotosVarias", { n: nFalhas });
              const motivo = traduzir(lang, "sp.catalogo.artigo.erro.fotosFalharam", { fotos, erro: resolverMensagem(primeiroErro, lang) });
              return `${classifyError ? `${resolverMensagem(classifyError, lang)} ` : ""}${motivo}`;
            },
          });
          return;
        }
      }
      if (classifyError) setErro(classifyError);
      onSaved(saved, created);
    } catch (err) {
      if (isNoSupplierAccess(err)) {
        onNoAccess();
        return;
      }
      setErro(mensagemDeTexto(spErrorMessage(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && !uploading && !photoBusy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit
              ? (isService ? t("sp.catalogo.artigo.tituloEditarServico") : t("sp.catalogo.artigo.tituloEditar"))
              : isService ? t("sp.catalogo.artigo.tituloNovoServico") : t("sp.catalogo.artigo.tituloNovo")}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? t("sp.catalogo.artigo.descricaoEditar")
              : isService
                ? t("sp.catalogo.artigo.descricaoNovoServico")
                : t("sp.catalogo.artigo.descricaoNovo")}
          </DialogDescription>
        </DialogHeader>

        <form id="sp-item-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label id="sp-kind-label">{t("sp.catalogo.artigo.tipo")}</Label>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="sp-kind-label">
              {(["produto", "servico"] as const).map((k) => (
                <Button key={k} type="button" role="radio" aria-checked={form.item_kind === k} className="h-11"
                  variant={form.item_kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
                  {k === "produto" ? t("sp.catalogo.tipo.produto") : t("sp.catalogo.tipo.servico")}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {isService ? t("sp.catalogo.artigo.tipoServicoDica") : t("sp.catalogo.artigo.tipoProdutoDica")}
            </p>
          </div>
          <Field id="sp-ref" label={t("sp.catalogo.artigo.referencia")}>
            <Input id="sp-ref" className="h-11" maxLength={100} value={form.supplier_ref}
              onChange={(e) => set("supplier_ref", e.target.value)} required autoComplete="off" />
          </Field>
          {isService ? (
            <div className="hidden sm:block" aria-hidden="true" />
          ) : (
            <Field id="sp-barcode" label={t("sp.catalogo.artigo.codigoBarras")} hint={t("sp.catalogo.artigo.codigoBarrasDica")}>
              <Input id="sp-barcode" className="h-11" inputMode="numeric" maxLength={20} value={form.barcode}
                onChange={(e) => set("barcode", e.target.value)} autoComplete="off" />
            </Field>
          )}
          <Field id="sp-name" label={t("sp.catalogo.artigo.nome")} className="sm:col-span-2">
            <Input id="sp-name" className="h-11" maxLength={300} value={form.name}
              onChange={(e) => set("name", e.target.value)} required />
          </Field>
          <Field id="sp-desc" label={t("sp.catalogo.artigo.descricao")} className="sm:col-span-2">
            <Textarea id="sp-desc" rows={3} maxLength={2000} value={form.description}
              onChange={(e) => set("description", e.target.value)} />
          </Field>
          {!isService && (
            <Field id="sp-brand" label={t("sp.catalogo.artigo.marca")}>
              <Input id="sp-brand" className="h-11" maxLength={100} value={form.brand}
                onChange={(e) => set("brand", e.target.value)} />
            </Field>
          )}
          <Field id="sp-unit" label={isService ? t("sp.catalogo.artigo.unidadeObrigatoria") : t("sp.catalogo.artigo.unidade")}>
            <select id="sp-unit" className={SELECT} value={form.unit_label}
              onChange={(e) => set("unit_label", e.target.value)}>
              <option value="">{t("sp.catalogo.artigo.escolhaUnidade")}</option>
              {form.unit_label && !unidades.some(([v]) => v === form.unit_label) && <option value={form.unit_label}>{form.unit_label}</option>}
              {opcoesDeUnidade(isService, idioma).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          {isService ? (
            <Field id="sp-mob" label={t("sp.catalogo.artigo.mobilizacao")} hint={t("sp.catalogo.artigo.mobilizacaoDica")}>
              <Input id="sp-mob" className="h-11" inputMode="numeric" value={form.mobilization_days}
                onChange={(e) => set("mobilization_days", e.target.value)} />
            </Field>
          ) : (
            <Field id="sp-upp" label={t("sp.catalogo.artigo.unidadesEmbalagem")}>
              <Input id="sp-upp" className="h-11" inputMode="decimal" value={form.units_per_pack}
                onChange={(e) => set("units_per_pack", e.target.value)} />
            </Field>
          )}
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            <Field id="sp-price" label={t("sp.catalogo.artigo.preco")}>
              <Input id="sp-price" className="h-11" inputMode="decimal" value={form.base_price}
                onChange={(e) => set("base_price", e.target.value)} />
            </Field>
            <Field id="sp-currency" label={t("sp.catalogo.artigo.moeda")}>
              <Input id="sp-currency" className="h-11 uppercase" maxLength={3} value={form.currency}
                onChange={(e) => set("currency", e.target.value.toUpperCase())} />
            </Field>
          </div>
          {isService && (
            <fieldset className="sm:col-span-2 space-y-1.5">
              <legend className="text-sm font-medium leading-none">{t("sp.catalogo.artigo.zona")}</legend>
              <p className="text-xs text-muted-foreground">{t("sp.catalogo.artigo.zonaDica")}</p>
              {distritosErro ? (
                <p className="text-sm text-destructive">{distritosErro}</p>
              ) : !distritos ? (
                <p className="text-sm text-muted-foreground">{t("sp.catalogo.artigo.aCarregarDistritos")}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="h-9"
                      onClick={() => set("service_districts", distritos.map((d) => d.code))}>
                      {t("sp.catalogo.artigo.todos")}
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-9" disabled={form.service_districts.length === 0}
                      onClick={() => set("service_districts", [])}>
                      {t("sp.catalogo.artigo.limpar")}
                    </Button>
                    <span className="text-xs text-muted-foreground self-center">{t("sp.catalogo.artigo.escolhidos", { n: form.service_districts.length })}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 rounded-md border p-3 max-h-56 overflow-y-auto">
                    {distritos.map((d) => (
                      <label key={d.code} className="flex items-center gap-2 min-h-9 text-sm cursor-pointer">
                        <Checkbox checked={form.service_districts.includes(d.code)}
                          onCheckedChange={(v) => toggleDistrito(d.code, v === true)} aria-label={d.name} />
                        {d.name}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </fieldset>
          )}
          {!isService && (
            <>
              <Field id="sp-moq" label={t("sp.catalogo.artigo.minimo")}>
                <Input id="sp-moq" className="h-11" inputMode="decimal" value={form.moq}
                  onChange={(e) => set("moq", e.target.value)} />
              </Field>
              <Field id="sp-lead" label={t("sp.catalogo.artigo.prazo")}>
                <Input id="sp-lead" className="h-11" inputMode="numeric" value={form.lead_time_days}
                  onChange={(e) => set("lead_time_days", e.target.value)} />
              </Field>
            </>
          )}
          {categorias && !isService && (
            <>
              <Field id="sp-cat" label={t("sp.catalogo.artigo.categoria")}>
                <select id="sp-cat" className={SELECT} value={form.categoria_id}
                  onChange={(e) => setForm((f) => ({ ...f, categoria_id: e.target.value, subcategoria_id: "" }))}>
                  <option value="">{t("sp.catalogo.artigo.escolhaCategoria")}</option>
                  {/* as categorias são de cada empresa cliente: com mais de uma empresa, agrupam-se pelo nome dela */}
                  {gruposEmpresa(categorias).length > 1
                    ? gruposEmpresa(categorias).map(([empresa, cs]) => (
                        <optgroup key={empresa} label={empresa}>
                          {cs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </optgroup>
                      ))
                    : categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Field>
              <Field id="sp-subcat" label={categoria?.subcategorias.length ? t("sp.catalogo.artigo.subcategoriaObrigatoria") : t("sp.catalogo.artigo.subcategoria")}>
                <select id="sp-subcat" className={SELECT} value={form.subcategoria_id} disabled={!categoria?.subcategorias.length}
                  onChange={(e) => set("subcategoria_id", e.target.value)}>
                  <option value="">{categoria && !categoria.subcategorias.length ? t("sp.catalogo.artigo.semSubcategorias") : t("sp.catalogo.artigo.escolhaSubcategoria")}</option>
                  {categoria?.subcategorias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                </select>
              </Field>
              <Field id="sp-medida" label={t("sp.catalogo.artigo.medida")} hint={t("sp.catalogo.artigo.medidaDica")}>
                <Input id="sp-medida" className="h-11" maxLength={40} value={form.medida}
                  onChange={(e) => set("medida", e.target.value)} autoComplete="off" />
              </Field>
              <Field id="sp-cor" label={t("sp.catalogo.artigo.cor")} hint={t("sp.catalogo.artigo.corDica")}>
                <Input id="sp-cor" className="h-11" maxLength={40} value={form.cor} list="sp-cores"
                  onChange={(e) => set("cor", e.target.value)} onBlur={() => set("cor", corCanonicaPortal(form.cor, idioma))} autoComplete="off" />
                {/* O valor que se grava é o nome em português; em inglês o rótulo mostra o nome inglês. */}
                <datalist id="sp-cores">
                  {opcoesDeCor(idioma).map((c) => <option key={c.value} value={c.value} label={idioma === "pt" ? undefined : c.label} />)}
                </datalist>
              </Field>
              <div className="sm:col-span-2 rounded-md border bg-muted/40 p-3" aria-live="polite">
                <p className="text-sm text-muted-foreground">{t("sp.catalogo.artigo.sku")}</p>
                <p className="font-mono text-base">
                  {skuVisto ?? t("sp.catalogo.artigo.skuEscolha")}
                </p>
                <p className="text-xs text-muted-foreground">{t("sp.catalogo.artigo.skuNota")}</p>
              </div>
            </>
          )}
          <PhotosSection
            name={form.name.trim() || item?.name || t("sp.catalogo.foto.nomePadrao")}
            paths={paths}
            pending={pending}
            canEdit={canEditPhotos}
            isNew={!item}
            busyPath={photoBusy}
            disabled={saving}
            error={photoError}
            fileInputRef={fileInputRef}
            onFiles={(files) => void handleFiles(files)}
            onMakeMain={(path) => void makeMain(path)}
            onAskRemove={setConfirmRemove}
            onRetry={(entry) => void retryPending(entry)}
            onDropPending={dropPending}
            onQueueAsMain={queueAsMain}
          />
          {isEdit && (
            <div className="sm:col-span-2 flex items-center justify-between rounded-md border p-3 min-h-11">
              <Label htmlFor="sp-active" className="cursor-pointer">{t("sp.catalogo.artigo.ativo")}</Label>
              <Switch id="sp-active" checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
            </div>
          )}
        </form>

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("sp.catalogo.artigo.cancelar")}
          </Button>
          <Button type="submit" form="sp-item-form" className="h-11" disabled={saving || uploading || !!photoBusy}>
            {saving
              ? (uploading ? t("sp.catalogo.artigo.aCarregarFotos") : t("sp.catalogo.artigo.aGuardar"))
              : isEdit ? t("sp.catalogo.artigo.guardar") : t("sp.catalogo.artigo.criar")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("sp.catalogo.foto.remover.titulo")}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmRemove && paths[0] === confirmRemove && paths.length > 1
                ? `${t("sp.catalogo.foto.remover.principal")} `
                : ""}
              {t("sp.catalogo.foto.remover.apagada")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">{t("sp.catalogo.artigo.cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const path = confirmRemove;
                setConfirmRemove(null);
                if (path) void removePhoto(path);
              }}
            >
              {t("sp.catalogo.foto.remover.botao")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

interface PhotosSectionProps {
  name: string;
  paths: string[];
  pending: PendingPhoto[];
  canEdit: boolean;
  /** Artigo ainda por gravar: as fotos ficam em fila. */
  isNew: boolean;
  busyPath: string | null;
  disabled: boolean;
  error: string | null;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFiles: (files: FileList | null) => void;
  onMakeMain: (path: string) => void;
  onAskRemove: (path: string) => void;
  onRetry: (entry: PendingPhoto) => void;
  onDropPending: (key: string) => void;
  onQueueAsMain: (key: string) => void;
}

const TILE = "relative aspect-square overflow-hidden rounded-md border bg-muted";
const MAIN_BADGE = "absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[11px] font-medium text-primary-foreground";

/** "Fotos (até 4)": grelha das gravadas + as em fila/a carregar. A 1.ª é a principal. */
function PhotosSection({
  name, paths, pending, canEdit, isNew, busyPath, disabled, error, fileInputRef,
  onFiles, onMakeMain, onAskRemove, onRetry, onDropPending, onQueueAsMain,
}: PhotosSectionProps) {
  const { t, idioma } = usePortalT();
  const total = paths.length + pending.length;
  const full = total >= CATALOG_IMAGE_MAX_COUNT;
  const locked = disabled || !!busyPath || pending.some((p) => p.status === "uploading");
  const photoAlt = (i: number) =>
    i === 0 ? t("sp.catalogo.foto.altPrincipal", { nome: name }) : t("sp.catalogo.foto.alt", { nome: name, n: i + 1 });

  return (
    <fieldset className="sm:col-span-2 space-y-2">
      <legend className="text-sm font-medium leading-none">{t("sp.catalogo.foto.titulo", { max: CATALOG_IMAGE_MAX_COUNT })}</legend>
      <p className="text-xs text-muted-foreground">
        {canEdit
          ? `${t("sp.catalogo.foto.ajuda")}${isNew ? ` ${t("sp.catalogo.foto.ajudaNovo")}` : ""}`
          : t("sp.catalogo.foto.soLeitura")}
      </p>

      {total === 0 && !canEdit && <p className="text-sm text-muted-foreground">{t("sp.catalogo.foto.semFotos")}</p>}

      {(total > 0 || canEdit) && (
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2" aria-label={t("sp.catalogo.foto.lista", { nome: name })}>
          {paths.map((path, i) => {
            const url = catalogImageUrl(path);
            const busy = busyPath === path;
            return (
              <li key={path} className="space-y-1">
                <div className={TILE} aria-busy={busy}>
                  {url && <img src={url} alt={photoAlt(i)} loading="lazy" decoding="async" className="h-full w-full object-cover" />}
                  {i === 0 && <span className={MAIN_BADGE}>{t("sp.catalogo.foto.principal")}</span>}
                  {busy && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                      <Loader2 className="h-5 w-5 animate-spin" aria-label={t("sp.catalogo.foto.aAtualizar")} />
                    </span>
                  )}
                </div>
                {canEdit && (
                  <div className="flex gap-1">
                    {i > 0 && (
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={locked}
                        onClick={() => onMakeMain(path)} aria-label={t("sp.catalogo.foto.marcarN", { n: i + 1 })} title={t("sp.catalogo.foto.marcarTitulo")}>
                        <Star className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={locked}
                      onClick={() => onAskRemove(path)} aria-label={t("sp.catalogo.foto.removerN", { n: i + 1 })} title={t("sp.catalogo.foto.removerTitulo")}>
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
          {pending.map((p, j) => {
            const i = paths.length + j;
            return (
              <li key={p.key} className="space-y-1" data-testid="sp-photo-pending">
                <div className={TILE} aria-busy={p.status === "uploading"}>
                  {p.preview ? (
                    <img src={p.preview} alt={photoAlt(i)} className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-1 text-center text-[11px] text-muted-foreground break-all">{p.file.name}</span>
                  )}
                  {i === 0 && <span className={MAIN_BADGE}>{t("sp.catalogo.foto.principal")}</span>}
                  <span className="absolute bottom-0 left-0 right-0 bg-background/85 px-1 text-[11px] leading-5 text-center">
                    {p.status === "uploading"
                      ? t("sp.catalogo.foto.aCarregar")
                      : p.status === "error"
                        ? t("sp.catalogo.foto.falhou")
                        : t("sp.catalogo.foto.porCarregar")}
                  </span>
                  {p.status === "uploading" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/50">
                      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    </span>
                  )}
                </div>
                {p.status === "error" && p.error && <p className="text-xs text-destructive">{resolverMensagem(p.error, idioma)}</p>}
                {canEdit && p.status !== "uploading" && (
                  <div className="flex gap-1">
                    {p.status === "error" && !isNew && (
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={locked}
                        onClick={() => onRetry(p)} aria-label={t("sp.catalogo.foto.tentarNovamenteNome", { nome: p.file.name })} title={t("sp.catalogo.foto.tentarNovamente")}>
                        <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                    {isNew && paths.length === 0 && j > 0 && (
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={locked}
                        onClick={() => onQueueAsMain(p.key)} aria-label={t("sp.catalogo.foto.marcarNome", { nome: p.file.name })} title={t("sp.catalogo.foto.marcarTitulo")}>
                        <Star className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                    <Button type="button" variant="outline" size="icon" className="h-9 w-9" disabled={locked}
                      onClick={() => onDropPending(p.key)} aria-label={t("sp.catalogo.foto.retirarNome", { nome: p.file.name })} title={t("sp.catalogo.foto.retirar")}>
                      <X className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
          {canEdit && !full && (
            <li>
              <Button type="button" variant="outline" disabled={locked}
                className="aspect-square h-auto w-full flex-col gap-1 border-dashed text-xs"
                onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="h-5 w-5" aria-hidden="true" />
                {t("sp.catalogo.foto.adicionar")}
                <span className="text-muted-foreground">{total}/{CATALOG_IMAGE_MAX_COUNT}</span>
              </Button>
            </li>
          )}
        </ul>
      )}
      {canEdit && (
        <input
          ref={fileInputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-label={t("sp.catalogo.foto.escolher")}
          accept={CATALOG_IMAGE_MIME.join(",")}
          multiple
          disabled={locked || full}
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      )}
      {canEdit && full && <p className="text-xs text-muted-foreground">{t("sp.catalogo.foto.maximo", { max: CATALOG_IMAGE_MAX_COUNT })}</p>}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </fieldset>
  );
}

function Field({ id, label, hint, className, children }: {
  id: string;
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className ? `space-y-1.5 ${className}` : "space-y-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
