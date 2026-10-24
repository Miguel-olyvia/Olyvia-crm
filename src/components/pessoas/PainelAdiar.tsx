import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { somarDias } from "./acoesPessoa";
import { textoDiaMes } from "./formatoPessoas";
import { ErroAcao } from "./ErroAcao";
import { MolduraPainel, type PropsPainel } from "./PainelBase";
import { useExecutarAcao } from "./useExecutarAcao";
import { useFocoInicial } from "./useFocoInicial";

type PropsComTitulo = PropsPainel & { titulo: string };

const OPCOES_ADIAR = [{ dias: 1, chave: "snooze1" }, { dias: 3, chave: "snooze3" }, { dias: 7, chave: "snooze7" }] as const;

/** Adiar: três botões (amanhã, em 3 dias, na próxima semana), cada um com a data; escolher um aplica logo. */
export function PainelAdiar({ id, titulo, ativo, pessoa, hoje, acoes, aoFechar, aoConcluir, aoMudarConteudo }: PropsComTitulo) {
  const { t } = useTranslation();
  const primeiro = useFocoInicial<HTMLButtonElement>(ativo);
  const acao = useExecutarAcao();
  // A opção escolhida fica `aria-busy` enquanto a base responde; as outras ignoram cliques (continuam focáveis).
  const [escolhida, setEscolhida] = useState<number | null>(null);
  useEffect(() => aoMudarConteudo(false), [aoMudarConteudo]);
  return (
    <MolduraPainel id={id} titulo={titulo} ativo={ativo}>
      <div className="flex flex-wrap gap-2">
        {OPCOES_ADIAR.map(({ dias, chave }, i) => {
          const data = textoDiaMes(somarDias(hoje, dias));
          return (
            <Button
              key={dias} ref={i === 0 ? primeiro : undefined} type="button" variant="outline" className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
              aria-disabled={acao.aGuardar || undefined} aria-busy={acao.aGuardar && escolhida === dias ? true : undefined}
              onClick={() => {
                if (acao.aGuardar) return;
                setEscolhida(dias);
                const mensagem = t("pessoasPagina.live.snooze", { date: data });
                acao.executar(() => acoes.adiar(pessoa.id, dias), () => aoConcluir(mensagem), mensagem);
              }}
            >
              {t(`pessoasPagina.panel.${chave}`, { date: data })}
            </Button>
          );
        })}
        <Button
          type="button" variant="ghost" className={cn("min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50", FOCO)}
          aria-disabled={acao.aGuardar || undefined} onClick={() => { if (!acao.aGuardar) aoFechar(); }}
        >
          {t("pessoasPagina.panel.cancel")}
        </Button>
      </div>
      <ErroAcao chave={acao.erro} chaveExtra={acao.erroExtra} />
    </MolduraPainel>
  );
}
