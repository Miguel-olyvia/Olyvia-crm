// O painel «Novo negócio» da ficha real: a mesma casca do exemplo (`NovoNegocioDialogo`: painel lateral, foco, clique fora que não perde o que
// se escreveu) com o corpo real (`FormularioNovoNegocioReal`). Sem as mutações nem os dados da ficha real (o exemplo), ou sem permissão para
// criar, não desenha nada. Em sucesso fecha, avisa (toast e anúncio da ficha), diz os registos que ficaram por ligar e abre o negócio novo.
import { useState } from "react";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { QuestionarioFormularioProvider } from "@/hooks/pessoas/QuestionarioFormularioProvider";
import { toast } from "@/lib/toast";
import { useTranslation } from "@/hooks/useTranslation";
import { useAnunciar } from "@/components/ficha-comum/anuncioFicha";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { useMutacoesDaFicha, type ResultadoCriar } from "@/components/negocio-metas/mutacoesNegocio";
import { NovoNegocioDialogo } from "@/components/negocio-metas/NovoNegocioDialogo";
import { useAvisarNegocio } from "@/components/negocio-metas/useAvisarNegocio";
import { FormularioNovoNegocioReal } from "./FormularioNovoNegocioReal";

const C = "pessoasPagina.neg.create.";
const SEM_PESSOAS: never[] = [];

interface NovoNegocioRealProps {
  pessoaId: string;
  pessoaNome: string;
  /** A ficha aberta: as visitas e o levantamento novos gravam-se nela. */
  ficha: FichaDb;
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  /** O negócio foi criado (ou já existia, num reenvio): quem monta abre-o. */
  aoCriado: (negocioId: string) => void;
}

/** O foco, depois de cancelar, volta ao botão «Mais» da ficha (o que abriu o painel). */
const focarMais = (): boolean => {
  document.querySelector<HTMLElement>("[data-ficha-mais]")?.focus();
  return true;
};

export function NovoNegocioReal({ pessoaId, pessoaNome, ficha, aberto, aoMudarAberto, aoCriado }: NovoNegocioRealProps) {
  const { t } = useTranslation();
  const mutacoes = useMutacoesDaFicha();
  const dados = useDadosNegocio();
  const avisar = useAvisarNegocio();
  const anunciar = useAnunciar();
  // Estado (e não ref): o X do cabeçalho tem de se redesenhar a dizer que está ocupado enquanto a gravação corre.
  const [aGuardar, setAGuardar] = useState(false);
  if (!mutacoes || !dados || !dados.podeCriar) return null;

  const criado = (resultado: ResultadoCriar, titulo: string, aoCriou: () => void): void => {
    // O painel fecha por ter criado: o foco não volta ao «Mais», fica para o título do negócio novo.
    aoCriou();
    aoMudarAberto(false);
    avisar(t(`${C}done`, { title: titulo, name: pessoaNome }));
    // Um reenvio (mudou: false) já avisou na primeira vez: não se repete o aviso dos registos recusados.
    const recusados = resultado.mudou ? resultado.recusados.length : 0;
    if (recusados > 0) {
      const texto = recusados === 1 ? t(`${C}refused.one`) : t(`${C}refused.many`, { count: recusados });
      toast.info(texto);
      anunciar(texto);
    }
    aoCriado(resultado.negocioId);
  };

  return (
    <NovoNegocioDialogo
      pessoas={SEM_PESSOAS} semBotao aberto={aberto} aoMudarAberto={(a) => { if (a || !aGuardar) aoMudarAberto(a); }}
      aGuardar={aGuardar} titulo={t("businessGoals.new.title")} descricao={t(`${C}description`, { name: pessoaNome })} selo={null}
      aoDevolverFoco={(criou) => (criou ? true : focarMais())}
      corpo={({ aoSujar, aoCriou }) => {
        const formulario = (
          <FormularioNovoNegocioReal
            pessoaId={pessoaId} pessoaNome={pessoaNome} ficha={ficha} mutacoes={mutacoes} dados={dados} aoMudarOcupado={setAGuardar} aoSujar={aoSujar}
            aoCriado={(resultado, titulo) => criado(resultado, titulo, aoCriou)}
            aoFechar={() => aoMudarAberto(false)}
          />
        );
        // O levantamento novo precisa das perguntas da base (o fornecedor do questionário); nunca abre sobre as respostas de um levantamento que já existe.
        // Sem permissão de editar não há abas Visita nem Levantamento: não se leem as perguntas à toa.
        return dados.podeEditar ? <QuestionarioFormularioProvider>{formulario}</QuestionarioFormularioProvider> : formulario;
      }}
    />
  );
}
