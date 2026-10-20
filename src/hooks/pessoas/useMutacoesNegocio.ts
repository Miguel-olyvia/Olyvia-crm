import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import {
  TIPOS_DOCUMENTO, type MutacoesNegocio, type PedidoCriarNegocio, type PedidoPerder, type RefRegistoBase,
} from "@/components/negocio-metas/mutacoesNegocio";
import { chamarNeg, ErroNeg, type NomeNeg } from "./chamarNeg";
import type { FichaDb } from "./fichaTipos";
import { invalidarPessoas } from "./invalidarPessoas";
import { erroGenerico, erroLocal, lerCriado, lerGanho, lerMudou, textoDeEstado, tipoDeRegisto, tituloENotas } from "./paramsNegocio";
import { useFontePessoas } from "./useFontePessoas";

/**
 * A M6 já está aplicada na base (confirmado a 20/10): `neg_criar_negocio` aceita orçamentos, propostas e contratos em `p_registos`.
 * A true, o formulário oferece documentos e o criar envia-os. A false, o formulário não os oferece e o criar recusa-os; um documento
 * ligava-se então depois de o negócio existir, um a um, com `neg_ligar_registo` (que aceita os seis tipos).
 */
const FUNCOES_M6_APLICADAS = true;

/**
 * Os erros depois dos quais o que o ecrã mostra já está desatualizado (o negócio mudou, o registo já não é livre, o contrato já não se liga,
 * o contrato já não se liga): refaz-se a ficha. NG003 e NG008 não refazem nada: fecham a ficha (ver abaixo).
 */
const CODIGOS_QUE_REFRESCAM = ["NG001", "NG002", "NG004", "NG013", "NG014"];

/** Os erros que tiram a própria ficha do ar (a pessoa já não está disponível, ou a funcionalidade não está ativa): fecha-se a ficha. */
const CODIGOS_QUE_FECHAM_A_FICHA = ["NG003", "NG008"];

export interface OpcoesMutacoes {
  /** Só para os testes: sobrepõe a bandeira da M6. */
  comDocumentos?: boolean;
  /**
   * NG003 e NG008: a ficha já não pode ficar aberta. Recebe a chave de tradução do erro e a pessoa a que a mutação pertence (quem monta avisa
   * e só volta à Lista se essa pessoa ainda for a aberta: o erro pode chegar depois de se passar a outra).
   */
  aoIndisponivel?: (chave: string, pessoaId: string) => void;
}

/**
 * As mutações de um negócio da ficha real, ligadas às funções neg_*. Cada uma lança `ErroNeg` se falhar (o ecrã traduz-lhe a chave) e,
 * depois de escrever (também com `mudou: false`), refaz a ficha e as listas. Um pedido igual a outro que ainda corre (duplo clique) não
 * faz outra chamada: partilha a resposta. O `p_id` de criar vem do pedido (o diálogo gera-o ao abrir).
 */
export function useMutacoesNegocio(pessoaId: string, ficha: FichaDb | null, opcoes: OpcoesMutacoes = {}): MutacoesNegocio {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const comDocumentos = opcoes.comDocumentos ?? FUNCOES_M6_APLICADAS;
  // A ficha mais recente sem refazer as mutações a cada leitura (atualiza-se depois de cada render, nunca durante).
  const fichaRef = useRef(ficha);
  const indisponivelRef = useRef(opcoes.aoIndisponivel);
  useEffect(() => {
    fichaRef.current = ficha;
    indisponivelRef.current = opcoes.aoIndisponivel;
  });
  const [emVoo] = useState(() => new Map<string, Promise<unknown>>());
  return useMemo(
    () => criarMutacoes({
      organizationId, pessoaId, client, emVoo, comDocumentos, ficha: () => fichaRef.current, indisponivel: (chave, pessoa) => indisponivelRef.current?.(chave, pessoa),
    }),
    [organizationId, pessoaId, client, emVoo, comDocumentos],
  );
}

interface Contexto {
  organizationId: string | null;
  pessoaId: string;
  client: QueryClient;
  emVoo: Map<string, Promise<unknown>>;
  comDocumentos: boolean;
  ficha: () => FichaDb | null;
  indisponivel: (chave: string, pessoaId: string) => void;
}

const ehDocumento = (ref: RefRegistoBase): boolean => TIPOS_DOCUMENTO.includes(ref.tipo);

function criarMutacoes(c: Contexto): MutacoesNegocio {
  const invalidar = (): void => { void invalidarPessoas(c.client, c.organizationId, c.pessoaId); };
  const org = (): string => {
    if (!c.organizationId) throw erroGenerico();
    return c.organizationId;
  };

  /**
   * Uma escrita: sem repetir um pedido igual em curso, a refazer a ficha depois de escrever (e de erros que a deixam desatualizada).
   * `fazer` chama a base e devolve a resposta em bruto; a ficha refaz-se logo a seguir e só depois `ler` a interpreta, porque uma resposta com
   * uma forma inesperada (que lança) não desfaz o que a base já escreveu.
   */
  function escrever<T>(chave: string, fazer: () => Promise<unknown>, ler: (resposta: unknown) => T): Promise<T> {
    const atual = c.emVoo.get(chave);
    if (atual) return atual as Promise<T>;
    const corrida = (async () => {
      try {
        const resposta = await fazer();
        invalidar();
        return ler(resposta);
      } catch (erro) {
        if (erro instanceof ErroNeg && erro.codigo && CODIGOS_QUE_REFRESCAM.includes(erro.codigo)) invalidar();
        if (erro instanceof ErroNeg && erro.codigo && CODIGOS_QUE_FECHAM_A_FICHA.includes(erro.codigo)) c.indisponivel(erro.chave, c.pessoaId);
        throw erro;
      }
    })().finally(() => { c.emVoo.delete(chave); });
    c.emVoo.set(chave, corrida);
    return corrida;
  }

  const chamar = (nome: NomeNeg, params: Record<string, unknown>): Promise<unknown> => chamarNeg<unknown>(nome, params);

  const perder = ({ negocioId, fase, motivo }: PedidoPerder) => escrever(`perder:${negocioId}:${fase}:${motivo}`, async () => {
    org();
    const texto = textoDeEstado(motivo);
    return chamar("neg_perder_negocio", { p_negocio_id: negocioId, p_fase: fase, p_motivo: texto });
  }, lerMudou);

  const anular = (negocioId: string, razao: string) => escrever(`anular:${negocioId}:${razao}`, async () => {
    org();
    const texto = textoDeEstado(razao);
    return chamar("neg_anular_perda", { p_negocio_id: negocioId, p_motivo_reabertura: texto });
  }, lerMudou);

  const mudarLigacao = (nome: "neg_ligar_registo" | "neg_desligar_registo", negocioId: string, ref: RefRegistoBase) =>
    escrever(`${nome}:${negocioId}:${ref.tipo}:${ref.id}`, async () => {
      org();
      return chamar(nome, { p_negocio_id: negocioId, p_tipo: tipoDeRegisto(ref.tipo), p_registo_id: ref.id });
    }, (resposta) => { lerMudou(resposta); });

  const ganhar = (negocioId: string, leadId: string | null) => escrever(`ganhar:${negocioId}:${leadId}`, async () => {
    org();
    return chamar("neg_ganhar_negocio", { p_negocio_id: negocioId, p_lead_id: leadId });
  }, lerGanho);

  const criar = (p: PedidoCriarNegocio) => escrever(`criar:${p.id}`, async () => {
    const o = org();
    const { titulo, notas } = tituloENotas(p.titulo, p.notas);
    // A base ainda não aceita documentos em p_registos (M6): recusa-se aqui, em vez de os largar em silêncio.
    if (!c.comDocumentos && p.registos.some(ehDocumento)) throw erroGenerico();
    const atual = c.ficha();
    if (!atual || atual.pessoa.id !== c.pessoaId) throw erroGenerico();
    if (!atual.permissoes.criar) throw erroLocal("42501");
    // Ligar exige «editar»: só com «criar» o negócio nasce sem registos (a base recusaria tudo com NG001).
    const podeLigar = atual.permissoes.editar;
    return chamar("neg_criar_negocio", {
      p_id: p.id, p_organization_id: o, p_entity_id: c.pessoaId, p_titulo: titulo, p_notas: notas, p_assigned_to: p.comercialId,
      p_registos: podeLigar ? p.registos.map(({ tipo, id }) => ({ tipo: tipoDeRegisto(tipo), id })) : [],
      p_levantamento_id: podeLigar ? p.levantamentoId : null, p_lead_id: p.leadId, p_reabrir_abordagem: p.reabrirAbordagem,
    });
  }, lerCriado);

  return {
    perder, anular, ganhar, criar, criarComDocumentos: c.comDocumentos, refrescar: invalidar,
    ligar: (negocioId, ref) => mudarLigacao("neg_ligar_registo", negocioId, ref),
    desligar: (negocioId, ref) => mudarLigacao("neg_desligar_registo", negocioId, ref),
  };
}
