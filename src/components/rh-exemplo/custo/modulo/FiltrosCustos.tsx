/** Os filtros do módulo «Custos»: pesquisa por nome, centro ou filial e tipo de contrato. */
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { SEM_FILTRO, type FiltrosCusto, type LinhaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface Props {
  linhas: readonly LinhaCusto[];
  filtros: FiltrosCusto;
  aoMudar: (parcial: Partial<FiltrosCusto>) => void;
  aoLimpar: () => void;
  visiveis: number;
}

/** Os pares (id, nome) distintos, pela ordem em que aparecem; ignora os vazios. */
function paresUnicos(pares: ReadonlyArray<readonly [string | null, string | null]>): Array<[string, string]> {
  const mapa = new Map<string, string>();
  pares.forEach(([id, nome]) => id !== null && !mapa.has(id) && mapa.set(id, nome ?? id));
  return [...mapa.entries()];
}

export function FiltrosCustos({ linhas, filtros, aoMudar, aoLimpar, visiveis }: Props) {
  const { t } = useTranslation();
  const filiais = paresUnicos(linhas.map((l) => [l.filialId, l.filial] as const));
  const centros = paresUnicos(linhas.map((l) => [l.centroId, l.centro] as const));
  const contratos = [...new Set(linhas.flatMap((l) => (l.tipoContrato ? [l.tipoContrato] : [])))];
  const opcoesLocal = [
    { value: SEM_FILTRO, label: t("rhCustos.local.todos") },
    ...filiais.map(([id, nome]) => ({ value: `f:${id}`, label: t("rhCustos.local.filial", { nome }) })),
    ...centros.map(([id, nome]) => ({ value: `l:${id}`, label: t("rhCustos.local.centro", { nome }) })),
  ];
  const opcoesContrato = [
    { value: SEM_FILTRO, label: t("rhCustos.contrato.todos") },
    ...contratos.map((c) => ({ value: c, label: t(`hr.tipoContrato.${c}`) })),
  ];
  const filtrado = filtros.texto !== "" || filtros.local !== SEM_FILTRO || filtros.contrato !== SEM_FILTRO;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-56 flex-1 space-y-1.5">
        <Label htmlFor="rhCustos-procurar">{t("rhCustos.procurar")}</Label>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="rhCustos-procurar" type="search" value={filtros.texto} placeholder={t("rhCustos.procurarMarca")}
            onChange={(e) => aoMudar({ texto: e.target.value })} className={cn("h-11 pl-9", FOCO)}
          />
        </div>
      </div>
      <div className="w-60 space-y-1.5">
        <Label htmlFor="rhCustos-local">{t("rhCustos.local")}</Label>
        <NativeSelect id="rhCustos-local" className="h-11" options={opcoesLocal} value={filtros.local} onValueChange={(local) => aoMudar({ local })} />
      </div>
      <div className="w-52 space-y-1.5">
        <Label htmlFor="rhCustos-contrato">{t("rhCustos.contrato")}</Label>
        <NativeSelect id="rhCustos-contrato" className="h-11" options={opcoesContrato} value={filtros.contrato} onValueChange={(contrato) => aoMudar({ contrato })} />
      </div>
      <p role="status" className="pb-3 text-sm tabular-nums text-muted-foreground">{t("rhCustos.resumoFiltro", { n: visiveis, total: linhas.length })}</p>
      {filtrado && <Button type="button" variant="outline" onClick={aoLimpar} className={cn("min-h-11", FOCO)}>{t("rhCustos.limpar")}</Button>}
    </div>
  );
}
