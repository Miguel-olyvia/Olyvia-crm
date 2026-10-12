import { LayoutList, Columns3, Search } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { VistaRapida, FiltrosQuadro } from "./logicaQuadro";
import type { ModoVista } from "./vistaGuardada";

interface BarraQuadroProps {
  filtros: FiltrosQuadro;
  comerciais: string[];
  vistas: VistaRapida[];
  total: number;
  modo: ModoVista;
  aoMudarFiltros: (parcial: Partial<FiltrosQuadro>) => void;
  aoAlternarVista: (id: VistaRapida["id"]) => void;
  aoMudarModo: (modo: ModoVista) => void;
}

/** Pesquisa, filtro de comercial, chips com contagem e o seletor Quadro | Lista. */
export function BarraQuadro(p: BarraQuadroProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-72">
          <span className="sr-only">{t("businessGoals.search.label")}</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            value={p.filtros.q}
            onChange={(e) => p.aoMudarFiltros({ q: e.target.value })}
            placeholder={t("businessGoals.search.placeholder")}
            className="h-11 pl-9"
          />
        </label>
        <div className="w-full sm:w-56">
          <NativeSelect
            aria-label={t("businessGoals.filter.rep")}
            value={p.filtros.comercial}
            onValueChange={(v) => p.aoMudarFiltros({ comercial: v })}
            options={[
              { value: "", label: t("businessGoals.filter.allReps") },
              ...p.comerciais.map((c) => ({ value: c, label: c })),
            ]}
            className="h-11"
          />
        </div>
        <div
          role="group"
          aria-label={t("businessGoals.view.label")}
          className="ml-auto flex items-center gap-1 rounded-lg bg-muted p-1"
        >
          <Button
            type="button"
            size="sm"
            variant={p.modo === "quadro" ? "default" : "ghost"}
            aria-pressed={p.modo === "quadro"}
            className="h-9 gap-1.5"
            onClick={() => p.aoMudarModo("quadro")}
          >
            <Columns3 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("businessGoals.view.board")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={p.modo === "lista" ? "default" : "ghost"}
            aria-pressed={p.modo === "lista"}
            className="h-9 gap-1.5"
            onClick={() => p.aoMudarModo("lista")}
          >
            <LayoutList className="h-3.5 w-3.5" aria-hidden="true" />
            {t("businessGoals.view.list")}
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("businessGoals.quick.label")} className="flex flex-wrap gap-2">
          {p.vistas.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={v.ativo}
              onClick={() => p.aoAlternarVista(v.id)}
              className={cn(
                "min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                v.ativo
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card hover:border-foreground/40",
              )}
            >
              {t(`businessGoals.quick.${v.id}`)}{" "}
              <span className="tabular-nums opacity-70">{v.n}</span>
            </button>
          ))}
        </div>
        <p role="status" aria-live="polite" className="ml-auto text-sm tabular-nums text-muted-foreground">
          {p.total === 1 ? t("businessGoals.countOne") : t("businessGoals.count", { count: p.total })}
        </p>
      </div>
    </div>
  );
}
