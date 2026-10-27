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
import type { LevantamentoPessoa, VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import { textoDoErroGravar } from "@/components/pessoas-processo/textoDoErroGravar";
import { textoDiaCompleto } from "../formatoPessoas";
import type { Pessoa } from "../pessoasTipos";
import type { FaseFeita } from "../processo/passoGuiado";
import { AssistenteDoGuia } from "./AssistenteDoGuia";
import { levantamentoMaisRecente } from "./hidratarAssistente";
import { passosDaVisita, seccoesDoAssistente } from "./modeloAssistente";
import { SemNegocio, SoLeitura } from "./PassosContacto";
import { CorpoFechar, CorpoSeccao, CorpoVisitas } from "./PassosVisita";
import type { PassoAssistente } from "./tiposAssistente";
import { useAssistente } from "./useAssistente";
import { apagarRascunho, novoIdLocal } from "./rascunhoAssistente";
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
  /** Os levantamentos guardados deste negócio: com o rascunho do navegador já apagado, as secções e as medidas abrem com o que ficou na base. */
  levantamentos?: readonly LevantamentoPessoa[];
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
  /** Quando se VÊ esta fase já feita (o negócio avançou): os mesmos passos, preenchidos e só para ler, e nada se grava. */
  fasePassada?: { id: string; aoVoltar: () => void };
  /** Depois de trocar de fase vista: o foco vai para o título do passo ao montar. */
  focarAoMontar?: boolean;
}

export function VisitaDoGuia(props: VisitaDoGuiaProps) {
  // O texto das perguntas é o que a pessoa viu quando guardou (o questionário pode ter mudado entretanto).
  const salvo = props.levantamentoGuardado ? levantamentoMaisRecente(props.levantamentos) : undefined;
  return (
    <QuestionarioFormularioProvider gravadas={salvo?.rascunho.gravadas}>
      {/* A chave é só a pessoa: criar o negócio a meio não remonta o assistente (perdia o que se escreveu); o rascunho migra para a chave do negócio. */}
      <VisitaInterior key={props.pessoa.id} {...props} />
    </QuestionarioFormularioProvider>
  );
}

function VisitaInterior({
  pessoa, negocio, visitas, levantamentoGuardado, levantamentos, ficha, podeEditar: podeEditarNaFicha, aoCriarNegocio, aoMarcarOutra, faseRotuloChave, feitas, aoVerFase, nivel, extra,
  fasePassada, focarAoMontar,
}: VisitaDoGuiaProps) {
  const { t } = useTranslation();
  // Numa fase feita nada se escreve, tenha a pessoa a permissão que tiver.
  const podeEditar = podeEditarNaFicha && fasePassada === undefined;
  const passada = fasePassada !== undefined;
  const { questionario, estado, repetir } = useQuestionario();
  // As visitas novas e o levantamento ficam ligados ao negócio, e o levantamento é sempre um novo (o que a pessoa tinha por ligar não se reescreve).
  const registos = useGuardarRegistos(ficha, { negocioId: negocio?.id ?? null, ignorarLevantamentoLivre: true });
  const acoesVisita = useAcoesVisita(pessoa.id, ficha);
  const chaveRascunho = negocio?.id ?? `pessoa-${pessoa.id}`;
  const [rascunho, atualizar] = useRascunhoAssistente(chaveRascunho);
  const [tentou, setTentou] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);
  const [erroGuardar, setErroGuardar] = useState<string | null>(null);
  const [guardadoAgora, setGuardadoAgora] = useState(false);
  const [nadaNovo, setNadaNovo] = useState(false);
  const guardado = levantamentoGuardado || guardadoAgora;
  // Guardado, o que se mostra é o que a base tem (o rascunho do navegador já foi apagado); sem levantamento lido, o que está em memória.
  const salvo = levantamentoGuardado ? levantamentoMaisRecente(levantamentos) : undefined;
  const vista = salvo ? { respostas: salvo.rascunho.respostas, linhas: salvo.rascunho.linhas, observacoes: salvo.rascunho.observacoes } : rascunho;

  const blocos = useMemo(() => todosOsBlocos(questionario), [questionario]);
  const seccoes = useMemo(() => seccoesDoAssistente(questionario, vista.respostas, vista.linhas.length), [questionario, vista.respostas, vista.linhas.length]);
  // Conta-se fora do memo: `visitas` pode ser um array novo em cada render, e o número é que interessa.
  const visitasMarcadas = visitas.filter((v) => v.estado !== "cancelada").length;
  const passos = useMemo(() => passosDaVisita({ visitas: visitasMarcadas, seccoes, guardado }), [visitasMarcadas, seccoes, guardado]);
  // Com o questionário a carregar não há secções: o passo inicial espera por ele (senão abria em «Fechar levantamento»).
  const assistente = useAssistente(passos, { pronto: estado === "pronto", ...(passada ? { inicial: 0 } : {}) });
  // Guardado já não se corrige: não há erros a mostrar num levantamento que se lê.
  const errosRespostas = useMemo(() => (guardado ? {} : validarRespostas(questionario, rascunho.respostas, "visita")), [guardado, questionario, rascunho.respostas]);
  const errosMedidas = useMemo(() => validarLevantamento({ ...levantamentoVazio("", ""), linhas: vista.linhas }), [vista.linhas]);

  const mudarLinhas = (linhas: LinhaForm[]): void => atualizar({ linhas });
  const medidas = {
    linhas: vista.linhas, observacoes: vista.observacoes, erros: tentou && !guardado ? { linhas: errosMedidas.linhas } : {},
    acoes: {
      adicionarLinha: () => mudarLinhas([...rascunho.linhas, novaLinha(novoIdLocal())]),
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
    setNadaNovo(false);
    if (Object.keys(errosRespostas).length > 0) { setErroGuardar(t("businessGoals.new.qform.invalid")); return; }
    if (errosMedidas.linhas) { setErroGuardar(t(`${A}fechar.medidasPorCorrigir`)); return; }
    // A morada da obra escrita no passo «Morada da obra» segue com o levantamento (é onde a base a guarda).
    const levantamento: RascunhoLevantamento = {
      linhas: rascunho.linhas, observacoes: rascunho.observacoes, respostas: rascunho.respostas,
      ...(temMorada(rascunho.morada) ? { moradaObra: rascunho.morada, moradaOrigem: rascunho.moradaOrigem } : {}),
    };
    setAGuardar(true);
    try {
      const resultado = await registos.guardar([], levantamento, "");
      // Sem nada gravado (plano vazio) não se diz «guardado» e o rascunho fica: não houve nada que o substituísse.
      if (resultado.feitos.length === 0) { setNadaNovo(true); return; }
      setGuardadoAgora(true);
      // A base é que guarda agora: o rascunho do navegador já não serve (e não deve voltar a aparecer depois de recarregar).
      apagarRascunho(chaveRascunho);
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
  // Sem permissão, ou com o levantamento já guardado, mostra-se o MESMO ecrã do passo, preenchido e só para ler (e uma frase a dizer porquê).
  const corpoQueGrava = (corpo: JSX.Element, fechadoPorGuardar = false): JSX.Element => {
    if (!negocio) return <SemNegocio aoCriar={passada ? undefined : aoCriarNegocio} />;
    const aviso = passada ? t("pessoasPagina.assistente.leitura.faseFeita") : !podeEditar ? t("pessoasPagina.guia.razao.semPermissao") : t(`${A}seccao.somenteLeitura`);
    return <SoLeitura ativo={!podeEditar || fechadoPorGuardar} aviso={aviso}>{corpo}</SoLeitura>;
  };
  const detalheDoGuardado: string[] = [];
  if (salvo) {
    const quando = textoDiaCompleto(salvo.data);
    detalheDoGuardado.push(salvo.feitoPor ? t(`${A}fechar.guardadoPor`, { data: quando, quem: salvo.feitoPor }) : t(`${A}fechar.guardadoEm`, { data: quando }));
    detalheDoGuardado.push(t(`${A}fechar.guardadoContagem`, { r: Object.values(salvo.rascunho.respostas).filter((v) => v !== "").length, m: salvo.rascunho.linhas.length }));
  }

  const renderCorpo = (passo: PassoAssistente): JSX.Element => {
    if (passo.id === "visitas") {
      return (
        <CorpoVisitas
          visitas={visitas} aoMarcarOutra={(origem) => aoMarcarOutra?.(origem)} podeMarcar={aoMarcarOutra !== undefined && podeEditar}
          aoMarcarFeita={podeEditar && ficha !== null ? marcarFeita : undefined}
          aoCancelar={podeEditar && ficha !== null ? (visitaId) => acoesVisita.cancelar(visitaId) : undefined} nomePessoa={pessoa.nome}
        />
      );
    }
    if (passo.id === "fechar") {
      return corpoQueGrava(
        <CorpoFechar
          guardado={guardado} aGuardar={aGuardar} podeGuardar={razaoDeNaoGuardar === undefined} razao={razaoDeNaoGuardar} erro={erroGuardar} nadaNovo={nadaNovo}
          aoGuardar={() => { void guardar(); }} detalhe={detalheDoGuardado}
        />,
        passada,
      );
    }
    const seccao = questionario.seccoes.find((s) => `seccao:${s.id}` === passo.id);
    if (!seccao) return <></>;
    return corpoQueGrava(
      <CorpoSeccao
        seccao={seccao} respostas={vista.respostas} erros={errosRespostas} estado={estado} aoRepetir={repetir}
        aoEscolher={(pergunta, opcao) => atualizar({ respostas: alternarResposta(blocos, rascunho.respostas, pergunta, opcao) })}
        aoEscrever={(pergunta, valor) => atualizar({ respostas: mudarResposta(blocos, rascunho.respostas, pergunta, valor) })}
        medidas={seccao.especial === "medidas" ? medidas : undefined}
      />,
      guardado || passada,
    );
  };

  return (
    <AssistenteDoGuia
      faseRotuloChave={faseRotuloChave} passos={passos} assistente={assistente} renderCorpo={renderCorpo} feitas={feitas} aoVerFase={aoVerFase} nivel={nivel} extra={extra} fasePassada={fasePassada} focarAoMontar={focarAoMontar}
    />
  );
}
