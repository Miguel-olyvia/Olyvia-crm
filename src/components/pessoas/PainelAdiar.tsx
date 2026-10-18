import { useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { somarDias } from "./acoesPessoa";
import { textoDiaMes } from "./formatoPessoas";
import { MolduraPainel, type PropsPainel } from "./PainelBase";
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
