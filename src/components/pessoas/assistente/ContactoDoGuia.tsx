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
import { guardarContactoDaPessoa } from "./guardarContactoDaPessoa";
import { passosDoContacto } from "./modeloAssistente";
import { CorpoChamada, CorpoMarcar, CorpoMorada, CorpoPreparar, CorpoQualificacao, SemNegocio } from "./PassosContacto";
import type { PassoAssistente } from "./tiposAssistente";
import { useAssistente } from "./useAssistente";
import { useRascunhoAssistente } from "./useRascunhoAssistente";

const C = "pessoasPagina.real.ficha.contact.";

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
  const [erroCampo, setErroCampo] = useState<"email" | "telefone" | null>(null);

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

  async function gravarContacto(): Promise<string | null> {
    const pedidoContacto = pedidoDeContacto(contacto, atualContacto);
    if (pedidoContacto.estado === "falta") {
      setErroCampo(pedidoContacto.campo);
      return t(`${C}${pedidoContacto.chaveErro}`);
    }
    setErroCampo(null);
    if (pedidoContacto.estado === "semAlteracao") return null;
    try {
      await guardarContactoDaPessoa(pedidoContacto.dados, { substituir, preferencias });
      return null;
    } catch (erro) {
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
    if (passo.id === "chamada") return gravarContacto();
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
