// O estado do formulário de "Novo negócio", em pedaços: a aba Geral, as respostas (Qualificação e Visita), a morada da obra
// e o levantamento. Cada alteração
// avisa `aoSujar` (para o painel saber que há coisas por gravar). Nada aqui grava: é tudo exemplo, em memória.
import { useEffect, useMemo, useRef, useState } from "react";
import type { AcoesGeral, ValoresGeral } from "./AbaGeralNovoNegocio";
import { registosPorLigar } from "./acoesRegistos";
import { ligarInicial, type LigarRegistos } from "./ligarNegocio";
import type { AcoesLevantamento } from "./LevantamentoCampos";
import { adaptarLinhaADivisao, levantamentoVazio, novaLinha, type LevantamentoForm, type LinhaForm } from "./levantamento";
import { MORADA_VAZIA, type ChaveMorada, type MoradaObraForm } from "./moradaObra";
import type { Respostas } from "./perguntasTipos";
import { BLOCO_QUALIFICACAO } from "./qualificacaoExemplo";
import { useRegistosPessoa } from "./registosPessoa";
import { alternarResposta } from "./respostasVisita";
import { SECCOES_VISITA } from "./visitaExemplo";
import type { VisitaNegocio } from "./negocioMetas";
import {
  acrescentarVisita, alterarVisita, marcarFeita, moradaDasVisitas, novaVisita, ordenarVisitas, removerVisita, visitaParaAbrir,
  visitasIniciais,
} from "./visitasNegocio";
import {
  COMERCIAIS_EXEMPLO, COMERCIAL_POR_OMISSAO, CONTACTO_VAZIO, preencherContactoDaPessoa, reporContacto, type ChaveContacto,
  type PessoaOpcao, type RascunhoLevantamento, type ValoresIniciaisNegocio,
} from "./novoNegocio";

/** O comercial pedido, se for um dos que se podem escolher; senão o por omissão. */
const comercialValido = (comercial?: string): string =>
  comercial !== undefined && COMERCIAIS_EXEMPLO.includes(comercial) ? comercial : COMERCIAL_POR_OMISSAO;

export function useCamposGerais(pessoas: readonly PessoaOpcao[], aoSujar: () => void, pessoaInicialId?: string, comercialInicial?: string) {
  const [valores, setValores] = useState<ValoresGeral>(() => {
    const inicial = pessoas.find((p) => p.id === pessoaInicialId);
    return {
      pessoaId: inicial?.id ?? "", comercial: comercialValido(comercialInicial),
      contacto: inicial ? preencherContactoDaPessoa(inicial) : CONTACTO_VAZIO,
    };
  });
  const [tocados, setTocados] = useState<ReadonlySet<ChaveContacto>>(new Set());
  const mudar = (parcial: Partial<ValoresGeral>) => { aoSujar(); setValores((v) => ({ ...v, ...parcial })); };
  const acoes: AcoesGeral = {
    pessoa: (id) => {
      aoSujar();
      setValores((v) => ({ ...v, pessoaId: id, contacto: reporContacto(v.contacto, tocados, pessoas.find((p) => p.id === id)) }));
    },
    comercial: (comercial) => mudar({ comercial }),
    contacto: (chave, valor) => {
      aoSujar();
      setTocados((antes) => new Set(antes).add(chave));
      setValores((v) => ({ ...v, contacto: { ...v.contacto, [chave]: valor } }));
    },
  };
  return { valores, acoes };
}

/**
 * As linhas e as observações do levantamento. A data, quem fez e o estado deixam de ser daqui: derivam da lista de
 * visitas (ver `camposDoLevantamento`), por isso aqui ficam só com o valor de partida.
 */
export function useLevantamentoForm(hoje: string, aoSujar: () => void, comercial: string, inicial?: RascunhoLevantamento) {
  const [levantamento, setLevantamento] = useState<LevantamentoForm>(() => (
    inicial ? { ...levantamentoVazio(hoje, comercial), linhas: inicial.linhas, observacoes: inicial.observacoes } : levantamentoVazio(hoje, comercial)
  ));
  // As linhas guardadas já trazem ids (l1, l2...): as novas continuam a numeração, sem repetir nenhum.
  const sequencia = useRef(Math.max(0, ...(inicial?.linhas ?? []).map((l) => Number(l.id.slice(1)) || 0)));
  const alterar = (f: (l: LevantamentoForm) => LevantamentoForm) => { aoSujar(); setLevantamento(f); };
  const acoes: AcoesLevantamento = {
    mudar: (parcial) => alterar((l) => ({ ...l, ...parcial })),
    adicionarLinha: () => {
      sequencia.current += 1;
      const linha = novaLinha(`l${sequencia.current}`);
      alterar((l) => ({ ...l, linhas: [...l.linhas, linha] }));
    },
    mudarLinha: (id: string, parcial: Partial<LinhaForm>) =>
      alterar((l) => ({
        ...l,
        linhas: l.linhas.map((x) => {
          if (x.id !== id) return x;
          const nova = { ...x, ...parcial };
          return parcial.divisao === undefined ? nova : adaptarLinhaADivisao(nova, parcial.divisao);
        }),
      })),
    removerLinha: (id) => alterar((l) => ({ ...l, linhas: l.linhas.filter((x) => x.id !== id) })),
  };
  return { levantamento, acoes };
}

export interface AcoesVisitas {
  /** Acrescenta uma visita (Por fazer, Revisita) e abre-a; devolve o id. */
  adicionar: () => string;
  alterar: (id: string, parcial: Partial<VisitaNegocio>) => void;
  remover: (id: string) => void;
  marcarFeita: (id: string) => void;
  /** Abre a visita; se já estava aberta, fecha-a. */
  alternar: (id: string) => void;
}

const ID_DA_LISTA = /^v(\d+)$/;

/**
 * A lista de visitas do negócio: a do pedido (a primeira Feita já aberta para se ver); sem pedido, vazia. Uma visita nova é Por fazer,
 * Revisita, com o comercial do negócio, e o seu id `v<n>` continua a numeração das que a lista já traz (um pedido guardado antes não
 * fica com ids repetidos).
 */
export function useVisitasForm(hoje: string, aoSujar: () => void, comercial: string, doPedido?: readonly VisitaNegocio[]) {
  const [visitas, setVisitas] = useState<VisitaNegocio[]>(() => visitasIniciais(doPedido));
  const [aberta, setAberta] = useState<string | null>(() => (doPedido ? visitaParaAbrir(doPedido) : null));
  const sequencia = useRef(Math.max(0, ...(doPedido ?? []).map((v) => Number(ID_DA_LISTA.exec(v.id)?.[1] ?? 0))));
  const alterarLista = (f: (v: VisitaNegocio[]) => VisitaNegocio[]) => { aoSujar(); setVisitas(f); };
  const acoes: AcoesVisitas = {
    adicionar: () => {
      sequencia.current += 1;
      const id = `v${sequencia.current}`;
      alterarLista((v) => acrescentarVisita(v, novaVisita(id, hoje, comercial, ordenarVisitas(v).slice(-1)[0])));
      setAberta(id);
      return id;
    },
    alterar: (id, parcial) => alterarLista((v) => alterarVisita(v, id, parcial)),
    remover: (id) => { alterarLista((v) => removerVisita(v, id)); setAberta((a) => (a === id ? null : a)); },
    marcarFeita: (id) => alterarLista((v) => marcarFeita(v, id)),
    alternar: (id) => setAberta((a) => (a === id ? null : id)),
  };
  return { visitas, aberta, acoes };
}

/**
 * O que se liga ao negócio novo: os registos por ligar da pessoa escolhida (do store dos registos) e a escolha feita (marcados e levantamento).
 * Ao escolher outra pessoa a escolha recomeça, com os registos dela marcados. Cada alteração avisa `aoSujar`.
 */
export function useLigarRegistosForm(pessoaId: string, aoSujar: () => void) {
  const estado = useRegistosPessoa();
  const porLigar = useMemo(() => registosPorLigar(estado, pessoaId), [estado, pessoaId]);
  const [valor, setValor] = useState<LigarRegistos>(() => ligarInicial(porLigar));
  const [paraPessoa, setParaPessoa] = useState(pessoaId);
  // Outra pessoa, outros registos: a escolha de partida é a dela (a escolha da anterior não vale para ela).
  useEffect(() => {
    if (paraPessoa === pessoaId) return;
    setParaPessoa(pessoaId);
    setValor(ligarInicial(porLigar));
  }, [pessoaId, paraPessoa, porLigar]);
  const mudar = (novo: LigarRegistos) => { aoSujar(); setValor(novo); };
  return { porLigar, valor, mudar };
}

const TODOS_OS_BLOCOS = [BLOCO_QUALIFICACAO, ...SECCOES_VISITA.flatMap((s) => s.blocos)];

/** As respostas de escolha rápida das duas abas (os ids das perguntas são únicos): escolher, ou retirar se já estava. */
export function useRespostasForm(aoSujar: () => void, inicial?: Respostas) {
  const [respostas, setRespostas] = useState<Respostas>(inicial ?? {});
  const escolher = (pergunta: string, opcao: string) => {
    aoSujar();
    setRespostas((r) => alternarResposta(TODOS_OS_BLOCOS, r, pergunta, opcao));
  };
  return { respostas, escolher };
}

/** De onde veio a morada da obra: da visita (igual à morada da lead, ou outra); `null` quando foi escrita à mão. */
export type OrigemMorada = "visitaIgual" | "visitaOutra" | null;

/** De onde vem a morada de uma visita: igual à da lead, outra, ou escrita à mão (`null`). */
const origemDaVisita = (igualALead: boolean | null): OrigemMorada => (igualALead === null ? null : igualALead ? "visitaIgual" : "visitaOutra");

/** De onde parte a morada da obra quando há um pedido: a que já tinha guardada e/ou as visitas. */
export interface PartidaMorada {
  visitas?: readonly VisitaNegocio[];
  moradaObra?: MoradaObraForm;
}

/**
 * A morada da obra; "preencher" traz rua, código postal e localidade e deixa o andar como estava. Parte da guardada no pedido ou, sem
 * ela, da visita que representa o levantamento. Vinda da visita, guarda a origem para a dizer; ao escrever ou ao usar a morada do
 * contacto, deixa de ser "da visita".
 */
export function useMoradaForm(aoSujar: () => void, partida?: PartidaMorada) {
  const dasVisitas = partida?.visitas ? moradaDasVisitas(partida.visitas) : undefined;
  // A morada deriva das visitas de agora (as marcadas, no painel «Novo negócio»): enquanto ninguém a escreveu, acompanha-as; escrita à mão, manda.
  const [escrita, setEscrita] = useState<MoradaObraForm | null>(null);
  const morada = escrita ?? partida?.moradaObra ?? dasVisitas?.moradaObra ?? MORADA_VAZIA;
  const origem: OrigemMorada = escrita || partida?.moradaObra || !dasVisitas ? null : origemDaVisita(dasVisitas.igualALead);
  const mudar = (chave: ChaveMorada, valor: string) => { aoSujar(); setEscrita({ ...morada, [chave]: valor }); };
  const preencher = (nova: MoradaObraForm) => { aoSujar(); setEscrita({ ...nova, andar: morada.andar }); };
  return { morada, origem, mudar, preencher };
}
