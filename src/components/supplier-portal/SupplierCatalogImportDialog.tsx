import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  isNoSupplierAccess,
  spCatalogImport,
  spErrorMessage,
  type SpCatalogField,
  type SpCatalogImportResult,
  type SpCatalogRowInput,
  type SpImportRowResult,
} from "@/lib/supplierPortal/spRpc";
import {
  SUPPLIER_CATALOG_COLUMNS,
  SUPPLIER_CATALOG_MAX_ROWS,
  SupplierCatalogFileError,
  buildSupplierCatalogImportRows,
  downloadSupplierCatalogTemplate,
  readSupplierCatalogFile,
  supplierCatalogFieldLabels,
  supplierCatalogHeader,
  type ParsedSupplierCatalogFile,
} from "@/utils/supplierPortalCatalogTemplate";
import {
  mensagemDeChave,
  mensagemDeTexto,
  resolverMensagem,
  usePortalT,
  type MensagemDoPortal,
  type PortalIdioma,
} from "@/portal-i18n";

type Step = "file" | "map" | "preview" | "done";

interface SupplierCatalogImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
  onNoAccess: () => void;
}

// Lista longa: mostra-se no máximo isto por separador (o resto fica indicado).
const MAX_VISIBLE_ROWS = 300;

const IGNORE = "__ignore__";

type Traduzir = ReturnType<typeof usePortalT>["t"];

/** As opções do seletor de coluna, com os cabeçalhos no idioma do portal. */
function fieldOptions(t: Traduzir, idioma: PortalIdioma) {
  return [
    { value: IGNORE, label: t("sp.importar.mapa.ignorar") },
    ...SUPPLIER_CATALOG_COLUMNS.map((c) => {
      const header = supplierCatalogHeader(c.field, idioma);
      return {
        value: c.field,
        label: c.field === "supplier_ref" ? t("sp.importar.mapa.obrigatoria", { coluna: header }) : header,
      };
    }),
  ];
}

/** Valores pt-PT nos dois idiomas (os números não mudam); só «sim/não» e «(vazio)» seguem o idioma. */
function formatValue(v: unknown, t: Traduzir): string {
  if (v === null || v === undefined || v === "") return t("sp.importar.valor.vazio");
  if (typeof v === "boolean") return v ? t("sp.importar.valor.sim") : t("sp.importar.valor.nao");
  if (typeof v === "number") return v.toLocaleString("pt-PT", { maximumFractionDigits: 4 });
  if (Array.isArray(v)) return v.length ? v.join(", ") : t("sp.importar.valor.vazio");
  return String(v);
}

/**
 * Importar catálogo (XLSX/XLS/CSV) → mapear colunas → pré-visualizar
 * (sp_catalog_import dry_run=true) → gravar (dry_run=false). Só o owner.
 */
export function SupplierCatalogImportDialog({ open, onOpenChange, onImported, onNoAccess }: SupplierCatalogImportDialogProps) {
  const [step, setStep] = useState<Step>("file");
  const [parsed, setParsed] = useState<ParsedSupplierCatalogFile | null>(null);
  const [mapping, setMapping] = useState<(SpCatalogField | null)[]>([]);
  const [preview, setPreview] = useState<SpCatalogImportResult | null>(null);
  const [result, setResult] = useState<SpCatalogImportResult | null>(null);
  const [rows, setRows] = useState<SpCatalogRowInput[]>([]);
  const [busy, setBusy] = useState(false);
  const { t, idioma } = usePortalT();
  // O erro fica em estado como mensagem (chave ou texto do servidor) e traduz-se ao mostrar: mudar de idioma com o
  // erro visível muda também o erro. O que vem do servidor guarda-se como texto e fica como vem.
  const [erro, setErro] = useState<MensagemDoPortal | null>(null);
  const error = resolverMensagem(erro, idioma);
  const fieldOpts = useMemo(() => fieldOptions(t, idioma), [t, idioma]);
  const fieldLabels = useMemo(() => supplierCatalogFieldLabels(idioma), [idioma]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("file");
    setParsed(null);
    setMapping([]);
    setPreview(null);
    setResult(null);
    setRows([]);
    setErro(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const close = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleRpcError = (err: unknown) => {
    if (isNoSupplierAccess(err)) {
      reset();
      onOpenChange(false);
      onNoAccess();
      return;
    }
    // Mensagem do servidor (ou de reserva da biblioteca): fica como vem.
    setErro(mensagemDeTexto(spErrorMessage(err)));
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setErro(null);
    setBusy(true);
    try {
      const p = await readSupplierCatalogFile(file, idioma);
      setParsed(p);
      setMapping(p.autoMapping);
      setStep("map");
    } catch (err) {
      setErro(
        err instanceof SupplierCatalogFileError
          ? mensagemDeChave(err.chave, err.params)
          : err instanceof Error
            ? mensagemDeTexto(err.message)
            : mensagemDeChave("sp.importar.ficheiro.naoLeu"),
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
    } finally {
      setBusy(false);
    }
  };

  const setColumnField = (index: number, value: string) => {
    const field = value === IGNORE ? null : (value as SpCatalogField);
    setMapping((prev) => prev.map((f, i) => (i === index ? field : field && f === field ? null : f)));
  };

  const mappedFields = useMemo(() => new Set(mapping.filter(Boolean) as SpCatalogField[]), [mapping]);
  const hasRef = mappedFields.has("supplier_ref");

  const runPreview = async () => {
    if (!parsed) return;
    setErro(null);
    const built = buildSupplierCatalogImportRows(parsed, mapping);
    if (built.length === 0) {
      setErro(mensagemDeChave("sp.importar.mapa.semLinhas"));
      return;
    }
    if (built.length > SUPPLIER_CATALOG_MAX_ROWS) {
      setErro(mensagemDeChave("sp.importar.mapa.maximo", { max: SUPPLIER_CATALOG_MAX_ROWS }));
      return;
    }
    setBusy(true);
    try {
      const res = await spCatalogImport(built, true, parsed.fileName);
      setRows(built);
      setPreview(res);
      setStep("preview");
    } catch (err) {
      handleRpcError(err);
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!parsed || rows.length === 0) return;
    setErro(null);
    setBusy(true);
    try {
      const res = await spCatalogImport(rows, false, parsed.fileName);
      setResult(res);
      setStep("done");
      onImported();
    } catch (err) {
      handleRpcError(err);
    } finally {
      setBusy(false);
    }
  };

  const validCount = preview ? preview.new + preview.changed : 0;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("sp.importar.titulo")}</DialogTitle>
          <DialogDescription>
            {step === "file" && t("sp.importar.descricao.file")}
            {step === "map" && t("sp.importar.descricao.map")}
            {step === "preview" && t("sp.importar.descricao.preview")}
            {step === "done" && t("sp.importar.descricao.done")}
          </DialogDescription>
        </DialogHeader>

        {step === "file" && (
          <div className="space-y-4">
            <label
              htmlFor="sp-import-file"
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring"
            >
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">
                {busy ? t("sp.importar.ficheiro.aLer") : t("sp.importar.ficheiro.escolher")}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("sp.importar.ficheiro.formatos", { max: SUPPLIER_CATALOG_MAX_ROWS })}
              </span>
              <input
                ref={fileInputRef}
                id="sp-import-file"
                type="file"
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                className="sr-only"
                disabled={busy}
                onChange={(e) => void handleFile(e.target.files?.[0])}
              />
            </label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-muted-foreground">
              <span>{t("sp.importar.ficheiro.semFicheiro")}</span>
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={() => downloadSupplierCatalogTemplate(idioma)}>
                <Download className="h-4 w-4" aria-hidden="true" />
                {t("sp.importar.ficheiro.modelo")}
              </Button>
            </div>
          </div>
        )}

        {step === "map" && parsed && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{parsed.fileName}</span> ·{" "}
              {t(parsed.rows.length === 1 ? "sp.importar.mapa.linhas.um" : "sp.importar.mapa.linhas.varios", { n: parsed.rows.length })}
            </p>
            <div className="space-y-3">
              {parsed.headers.map((h, i) => {
                const sample = parsed.rows.find((r) => r.cells[i])?.cells[i] ?? "";
                return (
                  <div key={i} className="grid gap-1.5 sm:grid-cols-[1fr_16rem] sm:items-center rounded-md border p-3">
                    <div className="min-w-0">
                      <Label htmlFor={`sp-map-${i}`} className="font-medium">
                        {h || t("sp.importar.mapa.semTitulo", { n: i + 1 })}
                      </Label>
                      {sample && (
                        <p className="text-xs text-muted-foreground truncate" title={sample}>
                          {t("sp.importar.mapa.exemplo", { valor: sample })}
                        </p>
                      )}
                    </div>
                    <NativeSelect
                      id={`sp-map-${i}`}
                      className="h-11"
                      options={fieldOpts}
                      value={mapping[i] ?? IGNORE}
                      onValueChange={(v) => setColumnField(i, v)}
                    />
                  </div>
                );
              })}
            </div>
            {!hasRef && (
              <Alert variant="destructive">
                <AlertDescription>
                  {t("sp.importar.mapa.semReferencia", { coluna: supplierCatalogHeader("supplier_ref", idioma) })}
                </AlertDescription>
              </Alert>
            )}
            {hasRef && !mappedFields.has("name") && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{t("sp.importar.mapa.semNome")}</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">{t("sp.importar.mapa.nota")}</p>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-4">
            <SummaryCounts r={preview} />
            <ResultTabs r={preview} fieldLabels={fieldLabels} />
            {preview.errors > 0 && (
              <p className="text-xs text-muted-foreground">{t("sp.importar.previa.erroSaltado")}</p>
            )}
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                {result.new + result.changed === 0
                  ? t("sp.importar.fim.nada")
                  : t("sp.importar.fim.gravado", { novos: result.new, alterados: result.changed })}
                {result.errors > 0 &&
                  ` ${t(result.errors === 1 ? "sp.importar.fim.erros.um" : "sp.importar.fim.erros.varios", { n: result.errors })}`}
              </AlertDescription>
            </Alert>
            <SummaryCounts r={result} />
            {result.errors > 0 && <RowList rows={result.rows.filter((r) => r.status === "error")} fieldLabels={fieldLabels} />}
          </div>
        )}

        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "map" && (
            <>
              <Button type="button" variant="outline" className="h-11" onClick={reset} disabled={busy}>
                {t("sp.importar.botao.outroFicheiro")}
              </Button>
              <Button type="button" className="h-11 gap-2" onClick={() => void runPreview()} disabled={busy || !hasRef}>
                {busy ? t("sp.importar.botao.aVerificar") : t("sp.importar.botao.previsualizar")}
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button type="button" variant="outline" className="h-11" onClick={() => setStep("map")} disabled={busy}>
                {t("sp.importar.botao.voltar")}
              </Button>
              <Button type="button" className="h-11 gap-2" onClick={() => void runImport()} disabled={busy || validCount === 0}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                {busy
                  ? t("sp.importar.botao.aGravar")
                  : validCount === 0
                    ? t("sp.importar.botao.nadaGravar")
                    : t(validCount === 1 ? "sp.importar.botao.gravar.um" : "sp.importar.botao.gravar.varios", { n: validCount })}
              </Button>
            </>
          )}
          {(step === "file" || step === "done") && (
            <Button type="button" variant={step === "done" ? "default" : "outline"} className="h-11" onClick={() => close(false)} disabled={busy}>
              {step === "done" ? t("sp.importar.botao.fechar") : t("sp.importar.botao.cancelar")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCounts({ r }: { r: SpCatalogImportResult }) {
  const { t } = usePortalT();
  const items = [
    { label: t("sp.importar.resumo.novos"), value: r.new, className: "text-emerald-700 dark:text-emerald-400" },
    { label: t("sp.importar.resumo.alterados"), value: r.changed, className: "text-blue-700 dark:text-blue-400" },
    { label: t("sp.importar.resumo.iguais"), value: r.unchanged, className: "text-muted-foreground" },
    { label: t("sp.importar.resumo.comErro"), value: r.errors, className: r.errors > 0 ? "text-destructive" : "text-muted-foreground" },
  ];
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((i) => (
        <div key={i.label} className="rounded-md border p-3 text-center">
          <dt className="text-xs text-muted-foreground">{i.label}</dt>
          <dd className={`text-xl font-semibold ${i.className}`}>{i.value.toLocaleString("pt-PT")}</dd>
        </div>
      ))}
    </dl>
  );
}

function ResultTabs({ r, fieldLabels }: { r: SpCatalogImportResult; fieldLabels: Record<SpCatalogField, string> }) {
  const { t } = usePortalT();
  const groups = {
    new: r.rows.filter((x) => x.status === "new"),
    changed: r.rows.filter((x) => x.status === "changed"),
    error: r.rows.filter((x) => x.status === "error"),
  };
  const initial = groups.error.length > 0 ? "error" : groups.new.length > 0 ? "new" : "changed";
  return (
    <Tabs defaultValue={initial}>
      <TabsList className="w-full grid grid-cols-3 h-11">
        <TabsTrigger value="new" className="h-9">{t("sp.importar.separador.novos", { n: groups.new.length })}</TabsTrigger>
        <TabsTrigger value="changed" className="h-9">{t("sp.importar.separador.alterados", { n: groups.changed.length })}</TabsTrigger>
        <TabsTrigger value="error" className="h-9">{t("sp.importar.separador.erros", { n: groups.error.length })}</TabsTrigger>
      </TabsList>
      <TabsContent value="new"><RowList rows={groups.new} fieldLabels={fieldLabels} /></TabsContent>
      <TabsContent value="changed"><RowList rows={groups.changed} fieldLabels={fieldLabels} /></TabsContent>
      <TabsContent value="error"><RowList rows={groups.error} fieldLabels={fieldLabels} /></TabsContent>
    </Tabs>
  );
}

/** As mensagens de erro de cada linha (`r.errors`) vêm do servidor e ficam como vêm. */
function RowList({ rows, fieldLabels }: { rows: SpImportRowResult[]; fieldLabels: Record<SpCatalogField, string> }) {
  const { t } = usePortalT();
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">{t("sp.importar.lista.nenhuma")}</p>;
  const visible = rows.slice(0, MAX_VISIBLE_ROWS);
  return (
    <div className="space-y-2">
      <ul className="max-h-[45vh] overflow-y-auto divide-y rounded-md border">
        {visible.map((r, idx) => (
          <li key={`${r.row ?? "x"}-${idx}`} className="p-3 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {r.row !== null && <Badge variant="outline">{t("sp.importar.lista.linha", { n: r.row })}</Badge>}
              <span className="font-medium break-all">{r.supplier_ref || t("sp.importar.lista.semReferencia")}</span>
              {r.name && <span className="text-muted-foreground break-words">· {r.name}</span>}
            </div>
            {r.errors && r.errors.length > 0 && (
              <ul className="list-disc pl-5 text-destructive">
                {r.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            {r.changes && Object.keys(r.changes).length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {Object.entries(r.changes).map(([field, ch]) => (
                  <li key={field} className="break-words">
                    <span className="font-medium text-foreground">
                      {fieldLabels[field as SpCatalogField] ?? field}
                    </span>
                    : {formatValue(ch.old, t)} → {formatValue(ch.new, t)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {rows.length > MAX_VISIBLE_ROWS && (
        <p className="text-xs text-muted-foreground">
          {t("sp.importar.lista.aMostrar", { max: MAX_VISIBLE_ROWS, total: rows.length.toLocaleString("pt-PT") })}
        </p>
      )}
    </div>
  );
}
