// A fase Visita do assistente: «Visitas» (todas as visitas do negócio), um passo por secção do levantamento (as perguntas vêm do questionário da base, no
// próprio ecrã) e «Fechar levantamento», que só guarda. O levantamento é UM por negócio: as respostas ficam em rascunho (sobrevive a recarregar) até ao
// último passo, que grava de uma vez com a gravação que já existe (`useGuardarRegistos`). «Necessidades do cliente» e as fotografias ficam de fora.
// Sem negócio os passos que dependem dele mostram a razão e «Criar o negócio».
import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import type { FichaDb } from "@/hooks/pessoas/fichaTipos";
import { QuestionarioFormularioProvider } from "@/hooks/pessoas/QuestionarioFormularioProvider";
import { useAcoesVisita } from "@/hooks/pessoas/useAcoesVisita";
import { useGuardarRegistos } from "@/hooks/pessoas/useGuardarRegistos";
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { adaptarLinhaADivisao, levantamentoVazio, novaLinha, validarLevantamento, type LinhaForm } from "@/components/negocio-metas/levantamento";
import { temMorada } from "@/components/negocio-metas/moradaObra";
import type { RascunhoLevantamento } from "@/components/negocio-metas/novoNegocio";
import { todosOsBlocos } from "@/components/negocio-metas/questionarioForm";
import { validarRespostas } from "@/components/negocio-metas/respostasQuestionario";
import { alternarResposta, mudarResposta } from "@/components/negocio-metas/respostasVisita";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { textoDoErroGravar } from "@/components/pessoas-processo/textoDoErroGravar";
import type { Pessoa } from "../pessoasTipos";
import type { FaseFeita } from "../processo/passoGuiado";
import { AssistenteDoGuia } from "./AssistenteDoGuia";
import { passosDaVisita, seccoesDoAssistente } from "./modeloAssistente";
import { SemNegocio } from "./PassosContacto";
import { CorpoFechar, CorpoSeccao, CorpoVisitas } from "./PassosVisita";
import type { PassoAssistente } from "./tiposAssistente";
import { useAssistente } from "./useAssistente";
import { useRascunhoAssistente } from "./useRascunhoAssistente";

const A = "pessoasPagina.assistente.";

export interface VisitaDoGuiaProps {
  pessoa: Pessoa;
  /** Sem negócio, as secções e «Fechar levantamento» mostram a razão e «Criar o negócio». */
  negocio: { id: string } | null;
  /** TODAS as visitas ligadas a este negócio (ou, sem negócio, as da pessoa), as canceladas incluídas. */
  visitas: readonly VisitaPessoa[];
  /** O negócio já tem levantamento: é um por negócio, e já não se guarda outro aqui. */
  levantamentoGuardado: boolean;
  /** A ficha lida da base, com que se grava; `null` (o exemplo) não deixa guardar. */
  ficha: FichaDb | null;
  podeEditar: boolean;
  aoCriarNegocio?: () => void;
  /** Abre a agenda para marcar outra visita; sem isto não há botão. */
  aoMarcarOutra?: (origem: HTMLElement) => void;
  faseRotuloChave: string;
  feitas: readonly FaseFeita[];
  aoVerFase: (id: string) => void;
  nivel: "h2" | "h3";
  /** O que o guia mostra por baixo do passo (o prazo, a saúde do negócio...). */
  extra?: ReactNode;
}

export function VisitaDoGuia(props: VisitaDoGuiaProps) {
  return (
    <QuestionarioFormularioProvider>
      <VisitaInterior key={`${props.pessoa.id}-${props.negocio?.id ?? ""}`} {...props} />
    </QuestionarioFormularioProvider>
  );
}

function VisitaInterior({
  pessoa, negocio, visitas, levantamentoGuardado, ficha, podeEditar, aoCriarNegocio, aoMarcarOutra, faseRotuloChave, feitas, aoVerFase, nivel, extra,
}: VisitaDoGuiaProps) {
  const { t } = useTranslation();
  const { questionario, estado, repetir } = useQuestionario();
  // As visitas novas e o levantamento ficam ligados ao negócio, e o levantamento é sempre um novo (o que a pessoa tinha por ligar não se reescreve).
  const registos = useGuardarRegistos(ficha, { negocioId: negocio?.id ?? null, ignorarLevantamentoLivre: true });
  const acoesVisita = useAcoesVisita(pessoa.id, ficha);
  const [rascunho, atualizar] = useRascunhoAssistente(negocio?.id ?? `pessoa-${pessoa.id}`);
  const [tentou, setTentou] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [erroGuardar, setErroGuardar] = useState<string | null>(null);
  const [guardadoAgora, setGuardadoAgora] = useState(false);
  const guardado = levantamentoGuardado || guardadoAgora;

  const blocos = useMemo(() => todosOsBlocos(questionario), [questionario]);
  const seccoes = useMemo(() => seccoesDoAssistente(questionario, rascunho.respostas, rascunho.linhas.length), [questionario, rascunho.respostas, rascunho.linhas.length]);
  const passos = useMemo(
    () => passosDaVisita({ visitas: visitas.filter((v) => v.estado !== "cancelada").length, seccoes, guardado }),
    [visitas, seccoes, guardado],
  );
  const assistente = useAssistente(passos);
  const errosRespostas = useMemo(() => validarRespostas(questionario, rascunho.respostas, "visita"), [questionario, rascunho.respostas]);
  const errosMedidas = useMemo(() => validarLevantamento({ ...levantamentoVazio("", ""), linhas: rascunho.linhas }), [rascunho.linhas]);

  const mudarLinhas = (linhas: LinhaForm[]): void => atualizar({ linhas });
  const medidas = {
    linhas: rascunho.linhas, observacoes: rascunho.observacoes, erros: tentou ? { linhas: errosMedidas.linhas } : {},
    acoes: {
      adicionarLinha: () => mudarLinhas([...rascunho.linhas, novaLinha(crypto.randomUUID())]),
      mudarLinha: (id: string, parcial: Partial<LinhaForm>) => mudarLinhas(rascunho.linhas.map((l) => {
        if (l.id !== id) return l;
        const nova = { ...l, ...parcial };
        return parcial.divisao !== undefined ? adaptarLinhaADivisao(nova, parcial.divisao) : nova;
      })),
      removerLinha: (id: string) => mudarLinhas(rascunho.linhas.filter((l) => l.id !== id)),
      mudarObservacoes: (observacoes: string) => atualizar({ observacoes }),
    },
  };

  async function guardar(): Promise<void> {
    setTentou(true);
    setErroGuardar(null);
    if (Object.keys(errosRespostas).length > 0) { setErroGuardar(t("businessGoals.new.qform.invalid")); return; }
    if (errosMedidas.linhas) { setErroGuardar(t(`${A}fechar.medidasPorCorrigir`)); return; }
    // A morada da obra escrita no passo «Morada da obra» segue com o levantamento (é onde a base a guarda).
    const levantamento: RascunhoLevantamento = {
      linhas: rascunho.linhas, observacoes: rascunho.observacoes, respostas: rascunho.respostas,
      ...(temMorada(rascunho.morada) ? { moradaObra: rascunho.morada, moradaOrigem: rascunho.moradaOrigem } : {}),
    };
    setAGuardar(true);
    try {
      await registos.guardar([], levantamento, "");
      setGuardadoAgora(true);
    } catch (erro) {
      setErroGuardar(textoDoErroGravar(erro, t));
    } finally {
      setAGuardar(false);
    }
  }

  // Dar a visita como feita é manual (nada a fecha sozinho): grava só a visita escolhida, com a ação que já existe.
  async function marcarFeita(visita: VisitaPessoa): Promise<string | null> {
    try {
      await acoesVisita.concluir(visita.id);
      return null;
    } catch (erro) {
      return textoDoErroGravar(erro, t);
    }
  }

  const razaoDeNaoGuardar = ficha === null ? t(`${A}fechar.semFicha`) : !registos.pronto ? t(`${A}fechar.aCarregar`) : undefined;
  const corpoQueGrava = (corpo: JSX.Element): JSX.Element => {
    if (!negocio) return <SemNegocio aoCriar={aoCriarNegocio} />;
    if (!podeEditar) return <p className="rounded-lg border border-border bg-muted/40 p-4 text-base text-foreground">{t("pessoasPagina.guia.razao.semPermissao")}</p>;
    return corpo;
  };

  const renderCorpo = (passo: PassoAssistente): JSX.Element => {
    if (passo.id === "visitas") {
      return (
        <CorpoVisitas
          visitas={visitas} aoMarcarOutra={(origem) => aoMarcarOutra?.(origem)} podeMarcar={aoMarcarOutra !== undefined && podeEditar}
          aoMarcarFeita={podeEditar && ficha !== null ? marcarFeita : undefined}
        />
      );
    }
    if (passo.id === "fechar") {
      return corpoQueGrava(
        <CorpoFechar
          guardado={guardado} aGuardar={aGuardar} podeGuardar={razaoDeNaoGuardar === undefined} razao={razaoDeNaoGuardar} erro={erroGuardar}
          aoGuardar={() => { void guardar(); }}
        />,
      );
    }
    const seccao = questionario.seccoes.find((s) => `seccao:${s.id}` === passo.id);
    if (!seccao) return <></>;
    return corpoQueGrava(
      <CorpoSeccao
        seccao={seccao} respostas={rascunho.respostas} erros={errosRespostas} estado={estado} aoRepetir={repetir}
        aoEscolher={(pergunta, opcao) => atualizar({ respostas: alternarResposta(blocos, rascunho.respostas, pergunta, opcao) })}
        aoEscrever={(pergunta, valor) => atualizar({ respostas: mudarResposta(blocos, rascunho.respostas, pergunta, valor) })}
        medidas={seccao.especial === "medidas" ? medidas : undefined}
      />,
    );
  };

  return (
    <AssistenteDoGuia
      faseRotuloChave={faseRotuloChave} passos={passos} assistente={assistente} renderCorpo={renderCorpo} feitas={feitas} aoVerFase={aoVerFase} nivel={nivel} extra={extra}
    />
  );
}
