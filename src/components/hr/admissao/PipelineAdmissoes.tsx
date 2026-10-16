/**
 * O separador «Pipeline de admissoes» da lista de Pessoas (P4 da V3a): quem esta em admissao, do convite a ativacao, ligado
 * a `rpc_hr_admissao_listar` por `useAdmissoesPipeline`. Uma linha por processo (`CartaoAdmissao`: dois selos, validade,
 * faixa de progresso), filtros por estado (grupos que viram `p_estados`) e «Mostrar mais» (paginacao por cursor).
 *
 * «Rever» abre a revisao (`RevisaoAdmissaoDialog`, so de consulta na V3a) e so existe com `hr.onboarding.approve`. A
 * organizacao e a ativa no ecra: quem monta este componente deve dar-lhe `key` com o id da organizacao, para uma troca de
 * organizacao fechar a revisao e recomecar o filtro.
 */
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { CartaoAdmissao } from "@/components/hr/admissao/CartaoAdmissao";
import { RevisaoAdmissaoDialog } from "@/components/hr/admissao/RevisaoAdmissaoDialog";
import { useAdmissoesPipeline, type ErroPipeline } from "@/hooks/useAdmissoesPipeline";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import {
  GRUPOS_PIPELINE,
  chaveDoErro,
  contagemDoGrupo,
  type GrupoPipelineId,
  type ItemPipeline,
} from "@/lib/hr/admissaoPipeline";
import { cn } from "@/lib/utils";

const chip = (ativo: boolean): string =>
  cn(
    "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-sm motion-reduce:transition-none",
    FOCO,
    ativo ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40",
  );

interface FiltrosProps {
  grupo: GrupoPipelineId | null;
  contadores: Readonly<Record<string, number>>;
  aoEscolher: (grupo: GrupoPipelineId | null) => void;
}

function Filtros({ grupo, contadores, aoEscolher }: FiltrosProps) {
  const { t } = useTranslation();
  const total = Object.values(contadores).reduce((soma, n) => soma + n, 0);
  return (
    <div role="group" aria-label={t("rhAdm.pipeline.filtros")} className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={grupo === null} className={chip(grupo === null)} onClick={() => aoEscolher(null)}>
        {grupo === null && <Check className="h-4 w-4" aria-hidden="true" />}
        {t("rhAdm.pipeline.todas")} <span className="tabular-nums">{total}</span>
      </button>
      {GRUPOS_PIPELINE.map((g) => (
        <button key={g.id} type="button" aria-pressed={grupo === g.id} className={chip(grupo === g.id)} onClick={() => aoEscolher(g.id)}>
          {grupo === g.id && <Check className="h-4 w-4" aria-hidden="true" />}
          {t(`rhAdm.grupo.${g.id}`)} <span className="tabular-nums">{contagemDoGrupo(g, contadores)}</span>
        </button>
      ))}
    </div>
  );
}

function ErroDoPipeline({ erro, aoTentar }: { erro: ErroPipeline; aoTentar: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 p-4">
      <p className="text-sm text-destructive">{t(chaveDoErro(erro.codigo, "rhAdm.erro.generico"))}</p>
      <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoTentar}>
        {t("common.retry")}
      </Button>
    </div>
  );
}

export function PipelineAdmissoes({ aoAbrirFicha }: { aoAbrirFicha: (pessoaId: string) => void }) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const podeRever = hasPermission("hr.onboarding.approve");
  const [grupoId, setGrupoId] = useState<GrupoPipelineId | null>(null);
  const [emRevisao, setEmRevisao] = useState<ItemPipeline | null>(null);

  const estados = useMemo(() => GRUPOS_PIPELINE.find((g) => g.id === grupoId)?.estados ?? null, [grupoId]);
  const { itens, contadores, carregando, aCarregarMais, temMais, erro, carregarMais, recarregar } = useAdmissoesPipeline({
    estados: estados ? [...estados] : null,
  });

  const resumo = carregando
    ? t("rhAdm.pipeline.carregando")
    : itens.length === 1
      ? t("rhAdm.pipeline.resumoUma")
      : t("rhAdm.pipeline.resumo", { n: itens.length });
  const vazio = !carregando && !erro && itens.length === 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("rhAdm.pipeline.explicacao")}</p>
      <Filtros grupo={grupoId} contadores={contadores} aoEscolher={setGrupoId} />
      <p role="status" aria-live="polite" aria-atomic="true" className="min-h-5 text-sm tabular-nums text-muted-foreground">
        {erro && itens.length === 0 ? "" : resumo}
      </p>

      {erro && <ErroDoPipeline erro={erro} aoTentar={recarregar} />}

      {vazio && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
          <p className="text-sm text-foreground">{grupoId ? t("rhAdm.pipeline.vazioFiltro") : t("rhAdm.pipeline.vazio")}</p>
          {grupoId && (
            <Button type="button" className={cn("min-h-11", FOCO)} onClick={() => setGrupoId(null)}>
              {t("rhAdm.pipeline.verTodas")}
            </Button>
          )}
        </div>
      )}

      {itens.length > 0 && (
        <ul aria-label={t("rhAdm.pipeline.lista")} className="divide-y overflow-hidden rounded-xl border border-border bg-card">
          {itens.map((item) => (
            <CartaoAdmissao key={item.conviteId} item={item} podeRever={podeRever} aoRever={setEmRevisao} aoAbrirFicha={aoAbrirFicha} />
          ))}
        </ul>
      )}

      {temMais && (
        <Button
          type="button"
          variant="outline"
          className={cn("min-h-11", FOCO)}
          aria-disabled={aCarregarMais || undefined}
          onClick={() => {
            if (!aCarregarMais) void carregarMais();
          }}
        >
          {aCarregarMais ? t("rhAdm.pipeline.aCarregar") : t("rhAdm.pipeline.mostrarMais")}
        </Button>
      )}

      <RevisaoAdmissaoDialog item={emRevisao} aoFechar={() => setEmRevisao(null)} />
    </div>
  );
}
