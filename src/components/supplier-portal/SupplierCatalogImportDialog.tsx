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
  SUPPLIER_CATALOG_FIELD_LABELS,
  SUPPLIER_CATALOG_MAX_ROWS,
  buildSupplierCatalogImportRows,
  downloadSupplierCatalogTemplate,
  readSupplierCatalogFile,
  type ParsedSupplierCatalogFile,
} from "@/utils/supplierPortalCatalogTemplate";

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
const FIELD_OPTIONS = [
  { value: IGNORE, label: "Ignorar esta coluna" },
  ...SUPPLIER_CATALOG_COLUMNS.map((c) => ({
    value: c.field,
    label: c.field === "supplier_ref" ? `${c.header} (obrigatória)` : c.header,
  })),
];

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(vazio)";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (typeof v === "number") return v.toLocaleString("pt-PT", { maximumFractionDigits: 4 });
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
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("file");
    setParsed(null);
    setMapping([]);
    setPreview(null);
    setResult(null);
    setRows([]);
    setError(null);
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
    setError(spErrorMessage(err));
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const p = await readSupplierCatalogFile(file);
      setParsed(p);
      setMapping(p.autoMapping);
      setStep("map");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível ler o ficheiro.");
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
    setError(null);
    const built = buildSupplierCatalogImportRows(parsed, mapping);
    if (built.length === 0) {
      setError("Nenhuma linha com valores nas colunas escolhidas.");
      return;
    }
    if (built.length > SUPPLIER_CATALOG_MAX_ROWS) {
      setError(`Máximo ${SUPPLIER_CATALOG_MAX_ROWS} linhas por importação.`);
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
    setError(null);
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
          <DialogTitle>Importar catálogo</DialogTitle>
          <DialogDescription>
            {step === "file" && "Escolha um ficheiro Excel (.xlsx, .xls) ou CSV com os seus artigos."}
            {step === "map" && "Indique o que contém cada coluna do ficheiro."}
            {step === "preview" && "Confira o que vai mudar antes de gravar. Nada foi gravado ainda."}
            {step === "done" && "Importação concluída."}
          </DialogDescription>
        </DialogHeader>

        {step === "file" && (
          <div className="space-y-4">
            <label
              htmlFor="sp-import-file"
              className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 sm:p-8 text-center cursor-pointer hover:bg-muted/50 focus-within:ring-2 focus-within:ring-ring"
            >
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">{busy ? "A ler o ficheiro…" : "Toque para escolher o ficheiro"}</span>
              <span className="text-xs text-muted-foreground">
                .xlsx, .xls ou .csv · até {SUPPLIER_CATALOG_MAX_ROWS} linhas · máx. 10 MB
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
              <span>Não tem um ficheiro preparado?</span>
              <Button type="button" variant="outline" className="h-11 gap-2" onClick={downloadSupplierCatalogTemplate}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Descarregar modelo
              </Button>
            </div>
          </div>
        )}

        {step === "map" && parsed && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{parsed.fileName}</span> · {parsed.rows.length} linha(s) de artigos
            </p>
            <div className="space-y-3">
              {parsed.headers.map((h, i) => {
                const sample = parsed.rows.find((r) => r.cells[i])?.cells[i] ?? "";
                return (
                  <div key={i} className="grid gap-1.5 sm:grid-cols-[1fr_16rem] sm:items-center rounded-md border p-3">
                    <div className="min-w-0">
                      <Label htmlFor={`sp-map-${i}`} className="font-medium">
                        {h || `Coluna ${i + 1} (sem título)`}
                      </Label>
                      {sample && (
                        <p className="text-xs text-muted-foreground truncate" title={sample}>
                          ex.: {sample}
                        </p>
                      )}
                    </div>
                    <NativeSelect
                      id={`sp-map-${i}`}
                      className="h-11"
                      options={FIELD_OPTIONS}
                      value={mapping[i] ?? IGNORE}
                      onValueChange={(v) => setColumnField(i, v)}
                    />
                  </div>
                );
              })}
            </div>
            {!hasRef && (
              <Alert variant="destructive">
                <AlertDescription>Escolha a coluna da referência (Ref.) — é obrigatória.</AlertDescription>
              </Alert>
            )}
            {hasRef && !mappedFields.has("name") && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Sem coluna de Nome: só será possível atualizar artigos que já existem.</AlertDescription>
              </Alert>
            )}
            <p className="text-xs text-muted-foreground">
              Uma coluna presente com a célula vazia apaga esse valor no artigo (exceto Nome e Ativo). Para não mexer
              num campo, escolha «Ignorar esta coluna». Artigos que não estejam no ficheiro não são alterados nem desativados.
            </p>
          </div>
        )}

        {step === "preview" && preview && (
          <div className="space-y-4">
            <SummaryCounts r={preview} />
            <ResultTabs r={preview} />
            {preview.errors > 0 && (
              <p className="text-xs text-muted-foreground">
                As linhas com erro são saltadas. Pode corrigi-las no ficheiro e voltar a importar mais tarde.
              </p>
            )}
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                {result.new + result.changed === 0
                  ? "Nenhum artigo foi alterado."
                  : `Gravado: ${result.new} novo(s) e ${result.changed} alterado(s).`}
                {result.errors > 0 && ` ${result.errors} linha(s) com erro foram saltadas.`}
              </AlertDescription>
            </Alert>
            <SummaryCounts r={result} />
            {result.errors > 0 && <RowList rows={result.rows.filter((r) => r.status === "error")} />}
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
                Outro ficheiro
              </Button>
              <Button type="button" className="h-11 gap-2" onClick={() => void runPreview()} disabled={busy || !hasRef}>
                {busy ? "A verificar…" : "Pré-visualizar"}
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button type="button" variant="outline" className="h-11" onClick={() => setStep("map")} disabled={busy}>
                Voltar
              </Button>
              <Button type="button" className="h-11 gap-2" onClick={() => void runImport()} disabled={busy || validCount === 0}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                {busy ? "A gravar…" : validCount === 0 ? "Nada para gravar" : `Gravar ${validCount} linha(s) válida(s)`}
              </Button>
            </>
          )}
          {(step === "file" || step === "done") && (
            <Button type="button" variant={step === "done" ? "default" : "outline"} className="h-11" onClick={() => close(false)} disabled={busy}>
              {step === "done" ? "Fechar" : "Cancelar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummaryCounts({ r }: { r: SpCatalogImportResult }) {
  const items = [
    { label: "Novos", value: r.new, className: "text-emerald-700 dark:text-emerald-400" },
    { label: "Alterados", value: r.changed, className: "text-blue-700 dark:text-blue-400" },
    { label: "Iguais", value: r.unchanged, className: "text-muted-foreground" },
    { label: "Com erro", value: r.errors, className: r.errors > 0 ? "text-destructive" : "text-muted-foreground" },
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

function ResultTabs({ r }: { r: SpCatalogImportResult }) {
  const groups = {
    new: r.rows.filter((x) => x.status === "new"),
    changed: r.rows.filter((x) => x.status === "changed"),
    error: r.rows.filter((x) => x.status === "error"),
  };
  const initial = groups.error.length > 0 ? "error" : groups.new.length > 0 ? "new" : "changed";
  return (
    <Tabs defaultValue={initial}>
      <TabsList className="w-full grid grid-cols-3 h-11">
        <TabsTrigger value="new" className="h-9">Novos ({groups.new.length})</TabsTrigger>
        <TabsTrigger value="changed" className="h-9">Alterados ({groups.changed.length})</TabsTrigger>
        <TabsTrigger value="error" className="h-9">Erros ({groups.error.length})</TabsTrigger>
      </TabsList>
      <TabsContent value="new"><RowList rows={groups.new} /></TabsContent>
      <TabsContent value="changed"><RowList rows={groups.changed} /></TabsContent>
      <TabsContent value="error"><RowList rows={groups.error} /></TabsContent>
    </Tabs>
  );
}

function RowList({ rows }: { rows: SpImportRowResult[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma linha.</p>;
  const visible = rows.slice(0, MAX_VISIBLE_ROWS);
  return (
    <div className="space-y-2">
      <ul className="max-h-[45vh] overflow-y-auto divide-y rounded-md border">
        {visible.map((r, idx) => (
          <li key={`${r.row ?? "x"}-${idx}`} className="p-3 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {r.row !== null && <Badge variant="outline">Linha {r.row}</Badge>}
              <span className="font-medium break-all">{r.supplier_ref || "(sem referência)"}</span>
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
                      {SUPPLIER_CATALOG_FIELD_LABELS[field as SpCatalogField] ?? field}
                    </span>
                    : {formatValue(ch.old)} → {formatValue(ch.new)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {rows.length > MAX_VISIBLE_ROWS && (
        <p className="text-xs text-muted-foreground">
          A mostrar {MAX_VISIBLE_ROWS} de {rows.length.toLocaleString("pt-PT")} linhas.
        </p>
      )}
    </div>
  );
}
