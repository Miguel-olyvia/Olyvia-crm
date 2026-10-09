/**
 * O cartao "Fim do contrato" do separador Contratos: a regra que se aplica a
 * ESTE contrato (e de onde vem: Organizacao ou Personalizado neste contrato),
 * quantas renovacoes ja houve, quando termina, e o que o RH pode fazer --
 * editar a excepcao do contrato, Renovar e Terminar.
 *
 * NENHUM NUMERO E DECIDIDO AQUI. Os dias de aviso, o maximo de renovacoes, a
 * duracao e o que acontece ao atingir o limite vem de `rpc_hr_vinculo_regra`
 * (a excepcao do contrato, ou a configuracao da organizacao). O ecra mostra e
 * a base decide: um Renovar que a regra nao permite volta com o erro
 * traduzido (HRV06 a HRV11).
 *
 * QUEM FAZ O QUE: o responsavel directo so INDICA (nao ve este cartao, nem a
 * ficha); renovar e terminar sao so do RH com `hr.pessoas.vinculos.edit`
 * (`podeEditar`), e Renovar prolonga o MESMO contrato, nao cria outro.
 *
 * SEM CONTRATO EM VIGOR nao mostra nada; fora do ambito (so contratos com
 * prazo, com data de fim) ou com a funcionalidade desligada, mostra uma nota.
 */
import { useState, type ReactNode } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccaoFimContratoDialog } from "@/components/hr/fimContrato/AccaoFimContratoDialog";
import { ExcepcaoContratoDialog } from "@/components/hr/fimContrato/ExcepcaoContratoDialog";
import { FimContratoHistorico } from "@/components/hr/fimContrato/FimContratoHistorico";
import { usePessoaContratoFim } from "@/hooks/usePessoaContratoFim";
import { useTranslation } from "@/hooks/useTranslation";
import { duracaoIgualInicial } from "@/lib/hr/fimContrato";
import { toast } from "@/lib/toast";
import type { PessoaVinculo } from "@/types/hr";

interface FimContratoCardProps {
  organizationId: string;
  /** O contrato em vigor; `null` = a pessoa nao tem (o cartao nao aparece). */
  vinculo: PessoaVinculo | null;
  /** `hr.pessoas.vinculos.edit`: excepcao, Renovar e Terminar. */
  podeEditar: boolean;
  /** Depois de renovar, terminar ou mudar a excepcao: o pai recarrega a ficha. */
  onMudou?: () => void;
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export function FimContratoCard({ organizationId, vinculo, podeEditar, onMudou }: FimContratoCardProps) {
  const { t } = useTranslation();
  const fim = usePessoaContratoFim(vinculo?.id ?? null, organizationId, onMudou);
  const [aRenovar, setARenovar] = useState(false);
  const [aTerminar, setATerminar] = useState(false);
  const [aEditar, setAEditar] = useState(false);

  if (!vinculo) return null;
  const { regra } = fim;

  const corpo = () => {
    if (fim.loading && !regra) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("common.loading")}
        </div>
      );
    }
    if (fim.erroLeitura && !regra) {
      return (
        <p className="text-sm text-destructive" role="alert">
          {t("hr.fimContrato.card.erroLeitura")}
        </p>
      );
    }
    if (!regra) return <p className="text-sm text-muted-foreground">{t("hr.fimContrato.card.semRegra")}</p>;
    if (!regra.no_ambito) {
      return <p className="text-sm text-muted-foreground">{t("hr.fimContrato.card.foraAmbito")}</p>;
    }
    if (!regra.ativo) {
      return <p className="text-sm text-muted-foreground">{t("hr.fimContrato.card.desligado")}</p>;
    }
    return (
      <div className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Linha rotulo={t("hr.fimContrato.card.terminaA")}>
            <span className="tabular-nums">{vinculo.data_fim ?? "—"}</span>
          </Linha>
          <Linha rotulo={t("hr.fimContrato.card.renovacoesRealizadas")}>
            <span className="tabular-nums">
              {t("hr.fimContrato.card.renovacoesValor", {
                realizadas: regra.renovacoes_realizadas,
                max: regra.max_renovacoes,
              })}
            </span>{" "}
            <span className="text-muted-foreground">
              ({t("hr.fimContrato.card.restantes", { n: regra.renovacoes_restantes })})
            </span>
          </Linha>
          <Linha rotulo={t("hr.fimContrato.diasAviso")}>
            {t("hr.fimContrato.card.diasAvisoValor", { dias: regra.dias_aviso })}
          </Linha>
          <Linha rotulo={t("hr.fimContrato.renovacaoAutomatica")}>
            {regra.renovacao_automatica ? t("common.yes") : t("common.no")}
          </Linha>
          <Linha rotulo={t("hr.fimContrato.card.duracaoRenovacao")}>
            {duracaoIgualInicial(regra.duracao_valor, regra.duracao_unidade)
              ? t("hr.fimContrato.igualInicial")
              : `${regra.duracao_valor} ${t(`hr.fimContrato.unidade.${regra.duracao_unidade}`)}`}
          </Linha>
          <Linha rotulo={t("hr.fimContrato.aoAtingirLimite")}>
            {t(`hr.fimContrato.limite.${regra.ao_atingir_limite}`)}
          </Linha>
        </dl>

        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setARenovar(true)} disabled={fim.saving}>
              {t("hr.fimContrato.renovar.botao")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setATerminar(true)} disabled={fim.saving}>
              {t("hr.fimContrato.terminar.botao")}
            </Button>
          </div>
        )}

        <FimContratoHistorico
          indicacoes={fim.indicacoes}
          renovacoes={fim.renovacoes}
          avisos={fim.avisos}
          dataFimActual={vinculo.data_fim}
        />
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          {t("hr.fimContrato.card.titulo")}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {regra && regra.no_ambito && (
            <Badge variant={regra.fonte === "personalizado" ? "default" : "secondary"} className="font-normal">
              {t("hr.fimContrato.card.fonte")}: {t(`hr.fimContrato.fonte.${regra.fonte}`)}
            </Badge>
          )}
          {podeEditar && regra && regra.no_ambito && (
            <Button size="sm" variant="outline" onClick={() => setAEditar(true)} disabled={fim.saving}>
              {t("hr.fimContrato.card.editarExcepcao")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>{corpo()}</CardContent>

      {regra && (
        <ExcepcaoContratoDialog
          open={aEditar}
          onOpenChange={setAEditar}
          regra={regra}
          saving={fim.saving}
          onGuardar={async (excepcao) => {
            const resultado = await fim.guardarExcepcao(excepcao);
            if (resultado.erro === null) toast.success(t("hr.fimContrato.excepcao.guardada"));
            return resultado.erro;
          }}
        />
      )}
      <AccaoFimContratoDialog
        open={aRenovar}
        onOpenChange={setARenovar}
        titulo={t("hr.fimContrato.renovar.titulo")}
        descricao={t("hr.fimContrato.renovar.descricao")}
        confirmarLabel={t("hr.fimContrato.renovar.confirmar")}
        saving={fim.saving}
        onConfirmar={async (motivo) => {
          const resultado = await fim.renovar(motivo);
          if (resultado.erro === null && "valor" in resultado) {
            toast.success(t("hr.fimContrato.renovar.sucesso", { data: String(resultado.valor) }));
          }
          return resultado.erro;
        }}
      />
      <AccaoFimContratoDialog
        open={aTerminar}
        onOpenChange={setATerminar}
        titulo={t("hr.fimContrato.terminar.titulo")}
        descricao={t("hr.fimContrato.terminar.descricao")}
        confirmarLabel={t("hr.fimContrato.terminar.confirmar")}
        saving={fim.saving}
        onConfirmar={async (motivo) => {
          const resultado = await fim.terminar(motivo);
          if (resultado.erro === null && "valor" in resultado) {
            toast.success(
              resultado.valor === "terminado"
                ? t("hr.fimContrato.terminar.terminado")
                : t("hr.fimContrato.terminar.agendado"),
            );
          }
          return resultado.erro;
        }}
      />
    </Card>
  );
}
