import { useId } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { FOCO } from "@/components/negocio-metas/estilos";
import { FORMULARIO_MANUAL, ORDENS, filtrosAtivos } from "./filtrosPessoas";
import { RESULTADOS_FILTRO } from "./opcoesPessoa";
import type { ChipPessoa, FiltrosPessoas as Filtros, OrdemPessoa, ResultadoOuNenhum } from "./pessoasTipos";

/** O que se escolhe nos selects: os comerciais e os formulários que existem, e se há pessoas registadas à mão. */
export interface OpcoesFiltros {
  comerciais: string[];
  formularios: string[];
  temManual: boolean;
}

interface PopoverFiltrosProps {
  filtros: Filtros;
  ordem: OrdemPessoa;
  opcoes: OpcoesFiltros;
  /** O interruptor "Voltou a contactar" só existe com permissão para ver submissões. */
  comVoltou: boolean;
  aoMudar: (v: Partial<Filtros>) => void;
  aoMudarChip: (chip: ChipPessoa) => void;
  aoMudarOrdem: (ordem: OrdemPessoa) => void;
  aoLimpar: () => void;
}

const LINHA = "flex min-h-11 items-center justify-between gap-3";

function Interruptor({ rotulo, ligado, aoMudar }: { rotulo: string; ligado: boolean; aoMudar: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className={LINHA}>
      <Label htmlFor={id} className="flex-1 cursor-pointer text-sm">{rotulo}</Label>
      <Switch id={id} checked={ligado} onCheckedChange={aoMudar} className={FOCO} />
    </div>
  );
}

function Seletor(p: { rotulo: string; valor: string; opcoes: { value: string; label: string }[]; aoMudar: (v: string) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">{p.rotulo}</Label>
      <NativeSelect
        id={id} value={p.valor} onValueChange={p.aoMudar} className={cn("h-11", FOCO)}
        options={[{ value: "", label: t("pessoasPagina.filters.all") }, ...p.opcoes]}
      />
    </div>
  );
}

function Ordenar({ ordem, aoMudar }: { ordem: OrdemPessoa; aoMudar: (o: OrdemPessoa) => void }) {
  const { t } = useTranslation();
  const nome = useId();
  return (
    <fieldset className="space-y-0.5">
      <legend className="text-sm font-semibold text-foreground">{t("pessoasPagina.filters.sort")}</legend>
      {ORDENS.map((o) => (
        <label key={o} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-foreground">
          <input type="radio" name={nome} className="h-4 w-4 accent-primary" checked={ordem === o} onChange={() => aoMudar(o)} />
          {t(`pessoasPagina.sort.${o}`)}
        </label>
      ))}
    </fieldset>
  );
}

function Interruptores({ filtros, comVoltou, aoMudar, aoMudarChip }: PopoverFiltrosProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t("pessoasPagina.filters.show")} className="space-y-0.5">
      <p className="text-sm font-semibold text-foreground">{t("pessoasPagina.filters.show")}</p>
      {comVoltou && <Interruptor rotulo={t("pessoasPagina.switch.voltou")} ligado={filtros.voltou} aoMudar={(voltou) => aoMudar({ voltou })} />}
      <Interruptor rotulo={t("pessoasPagina.switch.comVisita")} ligado={filtros.comVisita} aoMudar={(comVisita) => aoMudar({ comVisita })} />
      <Interruptor
        rotulo={t("pessoasPagina.switch.atrasadas")} ligado={filtros.chip === "atrasadas"}
        aoMudar={(ligado) => aoMudarChip(ligado ? "atrasadas" : "todas")}
      />
      <Interruptor rotulo={t("pessoasPagina.switch.soMinhas")} ligado={filtros.soMinhas} aoMudar={(soMinhas) => aoMudar({ soMinhas })} />
    </div>
  );
}

function Selects({ filtros, opcoes, aoMudar }: PopoverFiltrosProps) {
  const { t } = useTranslation();
  const formularios = opcoes.formularios.map((f) => ({ value: f, label: f }));
  if (opcoes.temManual) formularios.push({ value: FORMULARIO_MANUAL, label: t("pessoasPagina.filters.manual") });
  return (
    <div className="space-y-3">
      <Seletor
        rotulo={t("pessoasPagina.filters.comercial")} valor={filtros.comercial} aoMudar={(comercial) => aoMudar({ comercial })}
        opcoes={opcoes.comerciais.map((c) => ({ value: c, label: c }))}
      />
      <Seletor rotulo={t("pessoasPagina.filters.formulario")} valor={filtros.formulario} aoMudar={(formulario) => aoMudar({ formulario })} opcoes={formularios} />
      <Seletor
        rotulo={t("pessoasPagina.filters.resultado")} valor={filtros.resultado} aoMudar={(v) => aoMudar({ resultado: v as ResultadoOuNenhum | "" })}
        opcoes={RESULTADOS_FILTRO.map((r) => ({ value: r, label: t(`pessoasPagina.result.${r}`) }))}
      />
    </div>
  );
}

/** O botão "Filtros" (com o contador dos ativos) e o popover: ordenar, interruptores e selects. */
export function PopoverFiltros(p: PopoverFiltrosProps) {
  const { t } = useTranslation();
  const ativos = filtrosAtivos(p.filtros);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)}>
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          {t("pessoasPagina.filters.button")}
          {ativos > 0 && (
            <>
              <span aria-hidden="true" className="rounded-full bg-primary px-2 text-xs font-semibold tabular-nums text-primary-foreground">{ativos}</span>
              <span className="sr-only">{ativos === 1 ? t("pessoasPagina.filters.activeSr.one") : t("pessoasPagina.filters.activeSr.many", { count: ativos })}</span>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label={t("pessoasPagina.filters.title")} className="w-80 space-y-4 motion-reduce:animate-none">
        <Ordenar ordem={p.ordem} aoMudar={p.aoMudarOrdem} />
        <Interruptores {...p} />
        <Selects {...p} />
        <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} onClick={p.aoLimpar}>{t("pessoasPagina.filters.clear")}</Button>
      </PopoverContent>
    </Popover>
  );
}
