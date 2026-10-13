import { useEffect, useId, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "@/components/negocio-metas/estilos";
import { somarDias } from "./acoesPessoa";
import { BotoesPainel } from "./BotoesPainel";
import { passoAtual } from "./etapaPessoa";
import { textoDiaMes } from "./formatoPessoas";
import { MOTIVOS_PERDA } from "./opcoesPessoa";
import { MolduraPainel, type PropsPainel } from "./PainelBase";
import type { MotivoPerda } from "./pessoasTipos";
import { useFocoInicial } from "./useFocoInicial";

type PropsComTitulo = PropsPainel & { titulo: string };

const OPCOES_ADIAR = [{ dias: 1, chave: "snooze1" }, { dias: 3, chave: "snooze3" }, { dias: 7, chave: "snooze7" }] as const;

/** Adiar: três botões (amanhã, em 3 dias, na próxima semana), cada um com a data; escolher um aplica logo. */
export function PainelAdiar({ id, titulo, ativo, pessoa, hoje, acoes, aoFechar, aoConcluir, aoMudarConteudo }: PropsComTitulo) {
  const { t } = useTranslation();
  const primeiro = useFocoInicial<HTMLButtonElement>(ativo);
  useEffect(() => aoMudarConteudo(false), [aoMudarConteudo]);
  return (
    <MolduraPainel id={id} titulo={titulo} ativo={ativo}>
      <div className="flex flex-wrap gap-2">
        {OPCOES_ADIAR.map(({ dias, chave }, i) => {
          const data = textoDiaMes(somarDias(hoje, dias));
          return (
            <Button
              key={dias} ref={i === 0 ? primeiro : undefined} type="button" variant="outline" className={cn("min-h-11", FOCO)}
              onClick={() => { acoes.adiar(pessoa.id, dias); aoConcluir(t("pessoasPagina.live.snooze", { date: data })); }}
            >
              {t(`pessoasPagina.panel.${chave}`, { date: data })}
            </Button>
          );
        })}
        <Button type="button" variant="ghost" className={cn("min-h-11", FOCO)} onClick={aoFechar}>{t("pessoasPagina.panel.cancel")}</Button>
      </div>
    </MolduraPainel>
  );
}

/** Marcar como perdida: um select nativo com rótulo; o foco vai para Cancelar e confirmar exige o motivo. */
export function PainelPerder({ id, titulo, ativo, pessoa, resumo, acoes, aoFechar, aoConcluir, aoMudarConteudo }: PropsComTitulo) {
  const { t } = useTranslation();
  const [motivo, setMotivo] = useState<MotivoPerda | "">("");
  const cancelar = useFocoInicial<HTMLButtonElement>(ativo);
  const idSelect = useId();
  const passo = passoAtual(resumo);
  const abertos = resumo.abertos.length;
  useEffect(() => aoMudarConteudo(motivo !== ""), [motivo, aoMudarConteudo]);
  const confirmar = () => {
    if (motivo === "") return;
    acoes.perder(pessoa.id, motivo, { passo, papel: resumo.papel });
    aoConcluir(t("pessoasPagina.live.lost", { name: pessoa.nome }));
  };
  return (
    <MolduraPainel id={id} titulo={titulo} ativo={ativo}>
      <div className="space-y-1 text-sm text-foreground">
        <p className="font-medium">{t("pessoasPagina.panel.lostAt", { step: t(`pessoasPagina.journey.step${passo}`) })}</p>
        {abertos > 0 && <p>{abertos === 1 ? t("pessoasPagina.panel.lostDeals.one") : t("pessoasPagina.panel.lostDeals.many", { count: abertos })}</p>}
      </div>
      <div className="space-y-1">
        <Label htmlFor={idSelect}>{t("pessoasPagina.panel.lostReason")}</Label>
        <NativeSelect
          id={idSelect} value={motivo} className="min-h-11" placeholder={t("pessoasPagina.panel.lostChoose")}
          options={MOTIVOS_PERDA.map((m) => ({ value: m, label: t(`pessoasPagina.lost.${m}`) }))}
          onValueChange={(v) => setMotivo(v as MotivoPerda)}
        />
      </div>
      <BotoesPainel
        guardar={confirmar} aoCancelar={aoFechar} desativado={motivo === ""} dica={t("pessoasPagina.panel.hintReason")}
        rotuloGuardar={t("pessoasPagina.panel.lostConfirm")} destrutivo cancelarPrimeiro refCancelar={cancelar}
      />
    </MolduraPainel>
  );
}
