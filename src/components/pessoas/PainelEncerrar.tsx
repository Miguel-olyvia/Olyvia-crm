// «Encerrar a abordagem»: o painel em linha da ficha que fecha a abordagem de uma pessoa sem criar negócio. Pede como terminou (sem interesse,
// ou obra inviável) e o motivo (um da lista, ou «Outro» com texto). O foco vai para Cancelar e confirmar exige tudo (a ação é grave, mas
// reativa-se). Substitui «Marcar como perdida».
import { useEffect, useId, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { BotoesPainel } from "./BotoesPainel";
import { classeCartao } from "./cartaoOpcao";
import { CamposMotivo, erroDoMotivo } from "./CamposMotivo";
import { ErroAcao } from "./ErroAcao";
import { RESULTADOS_ENCERRAMENTO } from "./acoesEncerrar";
import { Visto } from "./OpcoesResultado";
import { MolduraPainel, type PropsPainel } from "./PainelBase";
import type { MotivoEncerramento, ResultadoEncerramento } from "./pessoasTipos";
import { useExecutarAcao } from "./useExecutarAcao";
import { useFocoInicial } from "./useFocoInicial";

type PropsComTitulo = PropsPainel & { titulo: string };

export function PainelEncerrar({ id, titulo, ativo, pessoa, acoes, aoFechar, aoConcluir, aoMudarConteudo }: PropsComTitulo) {
  const { t } = useTranslation();
  const [resultado, setResultado] = useState<ResultadoEncerramento | "">("");
  const [motivo, setMotivo] = useState<MotivoEncerramento | "">("");
  const [motivoOutro, setMotivoOutro] = useState("");
  const cancelar = useFocoInicial<HTMLButtonElement>(ativo);
  const nome = useId();
  const idLegenda = useId();
  // Enquanto falta algo o botão de confirmar fica `aria-disabled` e a dica diz o que falta: não há erros a mostrar antes de tentar.
  const incompleto = resultado === "" || erroDoMotivo(motivo, motivoOutro) !== null;
  useEffect(() => aoMudarConteudo(resultado !== "" || motivo !== ""), [resultado, motivo, aoMudarConteudo]);
  const acao = useExecutarAcao();
  const confirmar = () => {
    if (resultado === "" || motivo === "" || incompleto) return;
    const mensagem = t("pessoasPagina.close.live.closed", { name: pessoa.nome });
    acao.executar(
      () => acoes.encerrar(pessoa.id, { resultado, motivo, motivoOutro: motivo === "outro" ? motivoOutro.trim() : undefined }),
      () => aoConcluir(mensagem),
      mensagem,
    );
  };
  return (
    <MolduraPainel id={id} titulo={titulo} ativo={ativo}>
      <p className="text-sm text-foreground">{t("pessoasPagina.close.hint")}</p>
      <div role="radiogroup" aria-labelledby={idLegenda} className="space-y-2">
        <p id={idLegenda} className="text-sm font-semibold text-foreground">{t("pessoasPagina.close.resultLabel")}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {RESULTADOS_ENCERRAMENTO.map((r) => (
            <label key={r} className="relative flex cursor-pointer">
              <input type="radio" name={nome} className="peer sr-only" checked={resultado === r} onChange={() => setResultado(r)} />
              <span className={classeCartao(resultado === r)}>
                {t(`pessoasPagina.close.result.${r}`)}
                <Visto escolhido={resultado === r} />
              </span>
            </label>
          ))}
        </div>
      </div>
      <CamposMotivo
        motivo={motivo} motivoOutro={motivoOutro} erro={null} rotulo={t("pessoasPagina.close.reasonLabel")}
        aoMudar={(p) => { if (p.motivo !== undefined) setMotivo(p.motivo); if (p.motivoOutro !== undefined) setMotivoOutro(p.motivoOutro); }}
      />
      <ErroAcao chave={acao.erro} chaveExtra={acao.erroExtra} />
      <BotoesPainel
        guardar={confirmar} aoCancelar={aoFechar} desativado={incompleto} dica={t("pessoasPagina.close.hintMissing")}
        rotuloGuardar={t("pessoasPagina.close.confirm")} destrutivo cancelarPrimeiro refCancelar={cancelar} aGuardar={acao.aGuardar}
      />
    </MolduraPainel>
  );
}
