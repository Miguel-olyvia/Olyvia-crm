// A fase Contacto do assistente, ligada à gravação que já existe: Chamada (telefone, email e preferências da pessoa), Qualificação (as perguntas do
// questionário e o pedido do cliente, no negócio), Morada da obra e Preparar a visita (rascunho do assistente, que sobrevive a recarregar) e Marcar a
// visita (a agenda existente, com o que se preparou). Os passos que gravam no negócio, sem negócio, mostram a razão e «Criar o negócio». Só se
// reaproveita a GRAVAÇÃO (hooks e funções que já existem); o desenho é o do assistente.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { QuestionarioFormularioProvider } from "@/hooks/pessoas/QuestionarioFormularioProvider";
import { useGuardarQualificacao } from "@/hooks/pessoas/useGuardarQualificacao";
import { useGuardarContactoPessoa } from "@/hooks/pessoas/useGuardarContactoPessoa";
import { useSubstituirContactoPessoa } from "@/hooks/pessoas/useSubstituirContactoPessoa";
import { useGuardarNifPessoa } from "@/hooks/pessoas/useGuardarNifPessoa";
import { useGuardarIdentidadePessoa } from "@/hooks/pessoas/useGuardarIdentidadePessoa";
import { compactar, formularioInicial, pedidoDeIdentidade, type FormularioIdentidade, type IdentidadeAtual } from "@/components/pessoas-lista/identidadeFormulario";
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { MORADA_VAZIA, validarCodigoPostal, type ChaveMorada, type MoradaObraForm, type OrigemMoradaObra } from "@/components/negocio-metas/moradaObra";
import { blocosDaQualificacao } from "@/components/negocio-metas/questionarioForm";
import { chavesDaAba, respostasDeGravadas, validarRespostas, type RespostaGravada } from "@/components/negocio-metas/respostasQuestionario";
import { alternarResposta, contarRespostas, mudarResposta } from "@/components/negocio-metas/respostasVisita";
import type { Respostas } from "@/components/negocio-metas/perguntasTipos";
import { formularioDeContacto, pedidoDeContacto, type FormularioContacto } from "@/components/pessoas-lista/contactoFormulario";
import { entradaQualificacao } from "@/components/pessoas-processo/entradaQualificacao";
import { textoDoErroGravar } from "@/components/pessoas-processo/textoDoErroGravar";
import type { AberturaVisita } from "../marcarVisitaContexto";
import type { Pessoa, ResultadoContacto } from "../pessoasTipos";
import type { FaseFeita } from "../processo/passoGuiado";
import { AssistenteDoGuia } from "./AssistenteDoGuia";
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";
import { comAvisoDeParcial } from "./comAvisoDeParcial";
import { guardarContactoDaPessoa } from "./guardarContactoDaPessoa";
import type { CampoQuemPede } from "./GrupoQuemPede";
import { pedidoDeNif, tipoIdentidadeDe } from "./quemPedeFormulario";
import { passosDoContacto } from "./modeloAssistente";
import { CorpoChamada, CorpoMarcar, CorpoMorada, CorpoPreparar, CorpoQualificacao, SemNegocio } from "./PassosContacto";
import type { PassoAssistente } from "./tiposAssistente";
import { useAssistente } from "./useAssistente";
import { useRascunhoAssistente } from "./useRascunhoAssistente";

const C = "pessoasPagina.real.ficha.contact.";
const I = "pessoasPagina.real.ficha.identity.";
const Q = "pessoasPagina.assistente.quemPede.";
const CODIGO_NIF_REPETIDO = "NG030";

/** O negócio a que o assistente grava: o que a Qualificação precisa de saber dele. */
export interface NegocioDoAssistente {
  id: string;
  pedidoCliente?: string;
  qualificacaoGravada?: readonly RespostaGravada[];
}

export interface ContactoDoGuiaProps {
  pessoa: Pessoa;
  /** Sem negócio, os passos que gravam nele mostram a razão e «Criar o negócio». */
  negocio: NegocioDoAssistente | null;
  chamadas: number;
  visitaMarcada: boolean;
  /** O resultado da última chamada: «Sem interesse» e «Número errado» avisam e travam só «Marcar a visita» (outra chamada regista-se sempre). */
  ultimoResultado?: ResultadoContacto | null;
  /** Pode escrever na pessoa e no negócio. */
  podeEditar: boolean;
  podeRegistarChamada: boolean;
  aoRegistarChamada: (origem: HTMLElement) => void;
  aoCriarNegocio?: () => void;
  /** Abre a agenda para marcar a visita; sem isto não há botão. */
  aoMarcarVisita?: (preparar: NonNullable<AberturaVisita["preparar"]>, origem: HTMLElement) => void;
  faseRotuloChave: string;
  feitas: readonly FaseFeita[];
  aoVerFase: (id: string) => void;
  nivel: "h2" | "h3";
  /** O que o guia mostra por baixo do passo (o prazo, «Alterar prazo»...). */
  extra?: ReactNode;
}

export function ContactoDoGuia(props: ContactoDoGuiaProps) {
  // As respostas gravadas do negócio aparecem com o texto que a pessoa viu (o questionário pode ter mudado entretanto).
  return (
    <QuestionarioFormularioProvider gravadas={props.negocio?.qualificacaoGravada ? [...props.negocio.qualificacaoGravada] : undefined}>
      {/* A chave é só a pessoa: criar o negócio a meio não remonta o assistente (perdia o que se escreveu); o rascunho migra para a chave do negócio. */}
      <ContactoInterior key={props.pessoa.id} {...props} />
    </QuestionarioFormularioProvider>
  );
}

const moradaDaEntidade = (p: Pessoa): MoradaObraForm | null => (p.moradaCampos ? { ...p.moradaCampos } : null);

function ContactoInterior({
  pessoa, negocio, chamadas, visitaMarcada, ultimoResultado, podeEditar, podeRegistarChamada, aoRegistarChamada, aoCriarNegocio, aoMarcarVisita, faseRotuloChave, feitas, aoVerFase, nivel, extra,
}: ContactoDoGuiaProps) {
  const { t } = useTranslation();
  const { questionario, estado, repetir } = useQuestionario();
  const qualificacao = useGuardarQualificacao();
  const { guardar: substituir } = useSubstituirContactoPessoa(pessoa.id);
  const { guardar: preferencias } = useGuardarContactoPessoa(pessoa.id);
  const [rascunho, atualizar] = useRascunhoAssistente(negocio?.id ?? `pessoa-${pessoa.id}`);
  const idDoNegocio = negocio?.id ?? null;

  // Chamada: o formulário parte do que a pessoa tem; depois de gravar, a ficha refaz-se e o «atual» acompanha.
  const atualContacto = useMemo(() => ({
    telefone: pessoa.contacto.telefone, email: pessoa.contacto.email, contacto: pessoa.contactoPreferido, hora: pessoa.horaPreferida, lingua: pessoa.lingua,
  }), [pessoa.contacto.telefone, pessoa.contacto.email, pessoa.contactoPreferido, pessoa.horaPreferida, pessoa.lingua]);
  const [contacto, setContacto] = useState<FormularioContacto>(() => formularioDeContacto(atualContacto));
  const [erroCampo, setErroCampo] = useState<"email" | "telefone" | CampoQuemPede | null>(null);

  // Quem pede: o tipo de cliente e o NIF, gravados pelos hooks próprios. O NIF abre vazio (nunca se lê da base) e só se grava o que se tocou.
  const { guardar: guardarNif } = useGuardarNifPessoa(pessoa.id);
  const { guardar: guardarIdentidade } = useGuardarIdentidadePessoa(pessoa.id, pessoa.tipoCliente);
  const tipoAtual = tipoIdentidadeDe(pessoa.tipoCliente);
  const empresaNome = pessoa.empresa?.nome ?? null;
  const identidadeAtual = useMemo<IdentidadeAtual | null>(
    () => (tipoAtual ? { nome: pessoa.nome, tipo: tipoAtual, empresaNome } : null), [tipoAtual, pessoa.nome, empresaNome],
  );
  const [quemPede, setQuemPede] = useState<FormularioIdentidade>(() => formularioInicial(identidadeAtual ?? { nome: pessoa.nome, tipo: "person", empresaNome: null }));
  // O formulário só parte do que a base tem quando o tipo passa de desconhecido a conhecido (a ficha acabou de carregar) ou depois de uma gravação própria
  // do tipo; uma ficha que se refaz por outra razão (outro ecrã, outra gravação) não pisa o que se está a escrever.
  const tipoConhecido = useRef(identidadeAtual !== null);
  const reporAposGravar = useRef(false);
  useEffect(() => {
    const jaConhecido = tipoConhecido.current;
    tipoConhecido.current = identidadeAtual !== null;
    if (!identidadeAtual) return;
    if (jaConhecido && !reporAposGravar.current) return;
    reporAposGravar.current = false;
    setQuemPede(formularioInicial(identidadeAtual));
  }, [identidadeAtual]);
  const [nif, setNif] = useState("");
  const [nifTocado, setNifTocado] = useState(false);

  // Qualificação: o que o negócio já tem, e o que se escreve agora. `gravado` é o que está na base (para só mandar o que mudou).
  const gravadasDoNegocio = negocio?.qualificacaoGravada ?? [];
  const [respostas, setRespostas] = useState<Respostas>(() => respostasDeGravadas(gravadasDoNegocio));
  const [pedido, setPedido] = useState(negocio?.pedidoCliente ?? "");
  const gravado = useRef({ respostas, pedido });
  // Quando o negócio aparece depois de montar (a pessoa acabou de o criar) o que ele já tem passa para o ecrã; sem negócio a Qualificação estava escondida,
  // por isso não havia nada escrito que se possa perder. Só corre quando o id muda: uma gravação que refaz a ficha não pisa o que se está a escrever.
  const negocioAgora = useRef(negocio);
  negocioAgora.current = negocio;
  const negocioVisto = useRef(idDoNegocio);
  useEffect(() => {
    if (negocioVisto.current === idDoNegocio) return;
    negocioVisto.current = idDoNegocio;
    const novas = respostasDeGravadas(negocioAgora.current?.qualificacaoGravada ?? []);
    const novoPedido = negocioAgora.current?.pedidoCliente ?? "";
    gravado.current = { respostas: novas, pedido: novoPedido };
    setRespostas(novas);
    setPedido(novoPedido);
  }, [idDoNegocio]);
  const blocos = useMemo(() => blocosDaQualificacao(questionario), [questionario]);
  const contagem = useMemo(() => contarRespostas(blocos, respostas), [blocos, respostas]);
  const errosRespostas = useMemo(() => validarRespostas(questionario, respostas, "qualificacao"), [questionario, respostas]);

  const passos = useMemo(() => passosDoContacto({
    chamadas, visitaMarcada, perguntas: contagem,
    morada: rascunho.morada, preparar: { duracao: rascunho.preparar.duracao, quem: rascunho.preparar.quem },
  }), [chamadas, visitaMarcada, contagem, rascunho.morada, rascunho.preparar.duracao, rascunho.preparar.quem]);
  // Com o questionário a carregar não há perguntas (a Qualificação contava como completa): o passo inicial espera por ele.
  const assistente = useAssistente(passos, { pronto: estado === "pronto" });

  const mudarMorada = (chave: ChaveMorada, valor: string): void => atualizar({ morada: { ...rascunho.morada, [chave]: valor }, moradaOrigem: "manual" });
  const preencherMorada = (morada: MoradaObraForm, origem: OrigemMoradaObra): void => atualizar({ morada: { ...morada }, moradaOrigem: origem });
  const erroCodigoPostal = validarCodigoPostal(rascunho.morada.codigoPostal) !== null;

  /** Valida o que se escreveu em «Quem pede» antes de gravar fosse o que fosse: o campo em falta e a mensagem, ou os pedidos a fazer. */
  function validarQuemPede() {
    const tipo = identidadeAtual && podeEditar ? pedidoDeIdentidade(quemPede, identidadeAtual) : null;
    if (tipo?.estado === "falta") {
      const campo: CampoQuemPede = tipo.chaveErro === "errorCompany" ? "empresa" : compactar(quemPede.nomeProprio) === "" ? "nomeProprio" : "apelido";
      return { falta: { campo, texto: t(`${I}${tipo.chaveErro}`) } } as const;
    }
    const nifPedido = podeEditar ? pedidoDeNif(nif, nifTocado, pessoa) : ({ estado: "semAlteracao" } as const);
    if (nifPedido.estado === "invalido") return { falta: { campo: "nif" as CampoQuemPede, texto: t(`${Q}nifInvalido`) } } as const;
    return { tipo: tipo?.estado === "guardar" ? tipo.dados : null, nif: nifPedido } as const;
  }

  async function gravarChamada(): Promise<string | null> {
    const pedidoContacto = pedidoDeContacto(contacto, atualContacto);
    if (pedidoContacto.estado === "falta") {
      setErroCampo(pedidoContacto.campo);
      return t(`${C}${pedidoContacto.chaveErro}`);
    }
    const quem = validarQuemPede();
    if ("falta" in quem) {
      setErroCampo(quem.falta.campo);
      return quem.falta.texto;
    }
    setErroCampo(null);
    try {
      let gravou = false;
      if (pedidoContacto.estado === "guardar") {
        await guardarContactoDaPessoa(pedidoContacto.dados, { substituir, preferencias });
        gravou = true;
      }
      const { tipo, nif: pedidoNif } = quem;
      if (tipo) {
        reporAposGravar.current = true;
        try {
          await comAvisoDeParcial(gravou, pedidoNif.estado === "semAlteracao" ? `${Q}parcialSoTipo` : `${Q}parcialTipo`, () => guardarIdentidade(tipo));
        } catch (erro) {
          reporAposGravar.current = false;
          throw erro;
        }
        gravou = true;
      }
      if (pedidoNif.estado === "guardar" || pedidoNif.estado === "limpar") {
        await comAvisoDeParcial(gravou, `${Q}parcialNif`, () => guardarNif(pedidoNif.estado === "guardar" ? pedidoNif.nif : ""));
        setNifTocado(false);
        setNif("");
      }
      return null;
    } catch (erro) {
      if (erro instanceof ErroNeg && erro.codigo === CODIGO_NIF_REPETIDO) setErroCampo("nif");
      return textoDoErroGravar(erro, t);
    }
  }

  async function gravarQualificacao(): Promise<string | null> {
    if (!negocio) return null;
    const entrada = entradaQualificacao({
      negocioId: negocio.id, entityId: pessoa.id, chavesQualificacao: chavesDaAba(questionario, "qualificacao"),
      inicial: gravado.current, rascunho: { respostas, pedidoCliente: pedido },
    });
    if (!entrada) return null;
    try {
      await qualificacao.guardar(entrada);
      gravado.current = { respostas, pedido };
      return null;
    } catch (erro) {
      return textoDoErroGravar(erro, t);
    }
  }

  const aoContinuar = (passo: PassoAssistente): Promise<string | null> | string | null => {
    if (passo.id === "chamada") return gravarChamada();
    if (passo.id === "qualificacao") return podeEditar ? gravarQualificacao() : null;
    if (passo.id === "morada" && negocio && erroCodigoPostal) return t("businessGoals.new.error.postal.invalido");
    return null;
  };

  const corpoQueGrava = (corpo: JSX.Element): JSX.Element => {
    if (!negocio) return <SemNegocio aoCriar={aoCriarNegocio} />;
    if (!podeEditar) return <p className="rounded-lg border border-border bg-muted/40 p-4 text-base text-foreground">{t("pessoasPagina.guia.razao.semPermissao")}</p>;
    return corpo;
  };

  const renderCorpo = (passo: PassoAssistente): JSX.Element => {
    switch (passo.id) {
      case "chamada":
        return (
          <CorpoChamada
            chamadas={chamadas} form={contacto} aoMudar={(parcial) => { setErroCampo(null); setContacto((f) => ({ ...f, ...parcial })); }}
            podeEditar={podeEditar} erroCampo={erroCampo} aoRegistar={aoRegistarChamada} podeRegistar={podeRegistarChamada}
            quemPede={{
              form: quemPede, tipoAtual, nif, nifUltimos3: pessoa.nifUltimos3 ?? null, nifRegistado: Boolean(pessoa.nifUltimos3 || pessoa.temNif),
              aoMudarForm: (parcial) => { setErroCampo(null); reporAposGravar.current = false; setQuemPede((f) => ({ ...f, ...parcial })); },
              aoMudarNif: (valor) => { setErroCampo(null); setNifTocado(true); setNif(valor); },
            }}
          />
        );
      case "qualificacao":
        return corpoQueGrava((
          <CorpoQualificacao
            blocos={blocos} respostas={respostas} erros={errosRespostas} pedido={pedido} aoMudarPedido={setPedido} estado={estado} aoRepetir={repetir}
            aoEscolher={(pergunta, opcao) => setRespostas((r) => alternarResposta(blocos, r, pergunta, opcao))}
            aoEscrever={(pergunta, valor) => setRespostas((r) => mudarResposta(blocos, r, pergunta, valor))}
          />
        ));
      case "morada":
        return corpoQueGrava((
          <CorpoMorada
            morada={rascunho.morada ?? MORADA_VAZIA} origem={rascunho.moradaOrigem} aoMudar={mudarMorada} aoPreencherDe={preencherMorada}
            moradaEntidade={moradaDaEntidade(pessoa)} erroCodigoPostal={erroCodigoPostal}
          />
        ));
      case "preparar":
        return corpoQueGrava(<CorpoPreparar valor={rascunho.preparar} aoMudar={(parcial) => atualizar({ preparar: { ...rascunho.preparar, ...parcial } })} />);
      default:
        return (
          <CorpoMarcar
            preparar={rascunho.preparar} marcada={visitaMarcada} podeMarcar={aoMarcarVisita !== undefined && podeEditar}
            razaoBloqueio={ultimoResultado === "semInteresse" || ultimoResultado === "numeroErrado" ? t(`pessoasPagina.guia.razao.${ultimoResultado}`) : undefined}
            aoMarcar={(origem) => aoMarcarVisita?.({ duracao: rascunho.preparar.duracao, quemVaiEstar: rascunho.preparar.quem, nota: rascunho.preparar.nota }, origem)}
          />
        );
    }
  };

  return (
    <AssistenteDoGuia
      faseRotuloChave={faseRotuloChave} passos={passos} assistente={assistente} renderCorpo={renderCorpo} aoContinuar={aoContinuar}
      feitas={feitas} aoVerFase={aoVerFase} nivel={nivel} extra={extra}
    />
  );
}
