import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Table as TableIcon } from "lucide-react";
import {
  parseManualTables,
  updateManualTable,
  type ManualTableInfo,
} from "./manualTableConfig";

interface Props {
  bodyHtml: string;
  onBodyHtmlChange: (next: string) => void;
}

export function ManualTablesSection({ bodyHtml, onBodyHtmlChange }: Props) {
  const tables = useMemo(() => parseManualTables(bodyHtml), [bodyHtml]);

  if (tables.length === 0) {
    return (
      <div className="space-y-2">
        <Label className="text-sm font-medium">Tabelas inseridas</Label>
        <p className="text-xs text-muted-foreground">
          Quando inserir tabelas em branco no editor, elas aparecerão aqui para configurar nome, cor do
          cabeçalho, texto e borda — como na "Lista de Artigos".
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-sm font-medium">Tabelas inseridas</Label>
        <p className="text-xs text-muted-foreground">
          Configure cada tabela manual que adicionou ao editor.
        </p>
      </div>
      <div className="space-y-2">
        {tables.map((t, i) => (
          <ManualTableItem
            key={t.id}
            index={i + 1}
            info={t}
            onPatch={(patch) => onBodyHtmlChange(updateManualTable(bodyHtml, t.id, patch))}
          />
        ))}
      </div>
    </div>
  );
}

function ManualTableItem({
  index,
  info,
  onPatch,
}: {
  index: number;
  info: ManualTableInfo;
  onPatch: (patch: Partial<Omit<ManualTableInfo, "id">>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border bg-background">
      <button
        type="button"
        className="w-full flex items-center gap-2 p-2 hover:bg-muted/50 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <TableIcon className="h-3.5 w-3.5 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium truncate">{info.name || `Tabela ${index}`}</div>
          <div className="text-[10px] text-muted-foreground">ID: {info.id.slice(0, 10)}…</div>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="h-4 w-4 rounded border"
            style={{ backgroundColor: info.headerBg }}
            title={`Cabeçalho: ${info.headerBg}`}
          />
          <span
            className="h-4 w-4 rounded border"
            style={{ backgroundColor: info.borderColor }}
            title={`Borda: ${info.borderColor}`}
          />
        </div>
      </button>

      {open && (
        <div className="border-t p-3 space-y-3">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Nome</Label>
            <Input
              value={info.name}
              onChange={(e) => onPatch({ name: e.target.value })}
              className="h-8 text-xs"
              placeholder="Tabela"
            />
          </div>

          <ColorField
            label="Fundo do cabeçalho"
            value={info.headerBg}
            onChange={(v) => onPatch({ headerBg: v })}
          />
          <ColorField
            label="Texto do cabeçalho"
            value={info.headerText}
            onChange={(v) => onPatch({ headerText: v })}
          />
          <ColorField
            label="Cor da borda"
            value={info.borderColor}
            onChange={(v) => onPatch({ borderColor: v })}
          />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              onPatch({
                headerBg: "#f3f4f6",
                headerText: "#111827",
                borderColor: "#d1d5db",
              })
            }
          >
            Repor cores
          </Button>
        </div>
      )}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          className="h-8 w-12 rounded border cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs flex-1"
        />
      </div>
    </div>
  );
}
