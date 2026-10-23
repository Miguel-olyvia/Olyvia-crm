import { useId } from "react";
import { Check, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { FOCO, chip } from "@/components/negocio-metas/estilos";
import { RESULTADOS_FILTRO } from "@/components/pessoas/opcoesPessoa";
import type { ResultadoOuNenhum } from "@/components/pessoas/pessoasTipos";
import type { FiltrosLista } from "@/hooks/pessoas/listaPessoasTipos";
import { useFormulariosPessoas } from "@/hooks/pessoas/useFormulariosPessoas";

const R = "pessoasPagina.real.";
const LINHA = "flex min-h-11 items-center justify-between gap-3";

export interface FiltrosExtraRealProps {
  filtros: FiltrosLista;
  soMinhas: boolean;
  /** Sem o utilizador da sessão conhecido «Só as minhas» fica desativado. */
  podeSoMinhas: boolean;
  aoMudarSoMinhas: (ligado: boolean) => void;
  aoMudarAtrasada: (ligado: boolean) => void;
  aoMudarVoltou: (ligado: boolean) => void;
  aoMudarFormulario: (formularioId: string | null) => void;
  aoMudarResultado: (resultado: ResultadoOuNenhum | null) => void;
  aoLimpar: () => void;
}

/**
 * Um botão de alternar: o ativo leva ✓ além da cor, e o estado vai em aria-pressed. Desativado, `motivo` explica porquê (aria-describedby
 * e dica ao passar o rato), para não ficar um botão apagado sem explicação.
 */
function ChipAlternar({ ligado, desativado, motivo, texto, aoMudar }: {
  ligado: boolean; desativado?: boolean; motivo?: string; texto: string; aoMudar: (v: boolean) => void;
}) {
  const idMotivo = useId();
  const explicar = desativado && motivo ? motivo : undefined;
  return (
    <>
      <button
        type="button" aria-pressed={ligado} disabled={desativado} onClick={() => aoMudar(!ligado)} title={explicar}
        aria-describedby={explicar ? idMotivo : undefined}
        className={cn(chip(ligado), desativado && "cursor-not-allowed opacity-50")}
      >
        {ligado && <Check className="h-4 w-4" aria-hidden="true" />}
        {texto}
      </button>
      {explicar && <span id={idMotivo} className="sr-only">{explicar}</span>}
    </>
  );
}

function SeletorFormulario({ valor, aoMudar }: { valor: string | null; aoMudar: (id: string | null) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const { formularios, aCarregar, erro, repetir } = useFormulariosPessoas();
  const idCarga = useId();
  const opcoes = formularios.map((f) => ({ value: f.id, label: f.nome }));
  // O escolhido que ainda não está na lista (a carregar, ou em erro) aparece na mesma: não volta a «Todos» em silêncio.
  if (valor !== null && !opcoes.some((o) => o.value === valor)) opcoes.push({ value: valor, label: t(`${R}filters.formSelected`) });
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">{t("pessoasPagina.filters.formulario")}</Label>
      <NativeSelect
        id={id} value={valor ?? ""} onValueChange={(v) => aoMudar(v === "" ? null : v)} className={cn("h-11", FOCO)}
        disabled={aCarregar} aria-busy={aCarregar || undefined} aria-describedby={aCarregar ? idCarga : undefined}
        options={[{ value: "", label: t("pessoasPagina.filters.all") }, ...opcoes]}
      />
      {aCarregar && <p id={idCarga} role="status" className="text-sm text-muted-foreground">{t(`${R}filters.formsLoading`)}</p>}
      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-destructive">{t(`${R}filters.formsError`)}</p>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={repetir}>{t(`${R}retry`)}</Button>
        </div>
      )}
    </div>
  );
}

function SeletorResultado({ valor, aoMudar }: { valor: ResultadoOuNenhum | null; aoMudar: (r: ResultadoOuNenhum | null) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-sm">{t("pessoasPagina.filters.resultado")}</Label>
      <NativeSelect
        id={id} value={valor ?? ""} className={cn("h-11", FOCO)}
        onValueChange={(v) => aoMudar(RESULTADOS_FILTRO.find((r) => r === v) ?? null)}
        options={[
          { value: "", label: t("pessoasPagina.filters.all") },
          ...RESULTADOS_FILTRO.map((r) => ({ value: r, label: t(`pessoasPagina.result.${r}`) })),
        ]}
      />
    </div>
  );
}

/** O texto do botão «Filtros»: com os ativos contados (o número é visual; quem ouve recebe «, 3 ativos»). */
function ConteudoBotao({ ativos }: { ativos: number }) {
  const { t } = useTranslation();
  return (
    <>
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
      {t("pessoasPagina.filters.button")}
      {ativos > 0 && (
        <>
          <span aria-hidden="true" className="rounded-full bg-primary px-2 text-xs font-semibold tabular-nums text-primary-foreground">{ativos}</span>
          <span className="sr-only">
            {ativos === 1 ? t("pessoasPagina.filters.activeSr.one") : t("pessoasPagina.filters.activeSr.many", { count: ativos })}
          </span>
        </>
      )}
    </>
  );
}

/**
 * Os filtros que a base aceita além do tipo, da etapa e da pesquisa: «Atrasadas» e «Só as minhas» em botões de alternar, e o painel
 * «Filtros» com «Voltou a contactar», o formulário e o resultado do último contacto («Sem contacto» é uma das opções do resultado).
 * Tudo filtra na base (a lista é paginada: filtrar só a página carregada seria errado).
 */
export function FiltrosExtraReal(p: FiltrosExtraRealProps) {
  const { t } = useTranslation();
  const idVoltou = useId();
  const ativos = [p.filtros.voltou, p.filtros.formularioId !== null, p.filtros.ultimoResultado !== null].filter(Boolean).length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t(`${R}filters.chipsLabel`)} className="flex flex-wrap gap-2">
        <ChipAlternar ligado={p.filtros.atrasada} texto={t("pessoasPagina.chip.atrasadas")} aoMudar={p.aoMudarAtrasada} />
        <ChipAlternar
          ligado={p.soMinhas} desativado={!p.podeSoMinhas} motivo={t(`${R}filters.mineWaiting`)} texto={t("pessoasPagina.chip.mine")}
          aoMudar={p.aoMudarSoMinhas}
        />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)}><ConteudoBotao ativos={ativos} /></Button>
        </PopoverTrigger>
        <PopoverContent align="start" aria-label={t("pessoasPagina.filters.title")} className="w-80 space-y-4 motion-reduce:animate-none">
          <div className={LINHA}>
            <Label htmlFor={idVoltou} className="flex-1 cursor-pointer text-sm">{t("pessoasPagina.switch.voltou")}</Label>
            <Switch id={idVoltou} checked={p.filtros.voltou} onCheckedChange={p.aoMudarVoltou} className={FOCO} />
          </div>
          <SeletorFormulario valor={p.filtros.formularioId} aoMudar={p.aoMudarFormulario} />
          <SeletorResultado valor={p.filtros.ultimoResultado} aoMudar={p.aoMudarResultado} />
          <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} onClick={p.aoLimpar}>{t("pessoasPagina.filters.clear")}</Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
