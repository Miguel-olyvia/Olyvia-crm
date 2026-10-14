// O estado do formulário de "Novo negócio", em pedaços: a aba Geral, as respostas (Qualificação e Visita), a morada da obra
// e o levantamento. Cada alteração
// avisa `aoSujar` (para o painel saber que há coisas por gravar). Nada aqui grava: é tudo exemplo, em memória.
import { useRef, useState } from "react";
import type { AcoesGeral, ValoresGeral } from "./AbaGeralNovoNegocio";
import type { AcoesLevantamento } from "./LevantamentoCampos";
import { adaptarLinhaADivisao, levantamentoVazio, novaLinha, type LevantamentoForm, type LinhaForm } from "./levantamento";
import { MORADA_VAZIA, type ChaveMorada, type MoradaObraForm } from "./moradaObra";
import type { Respostas } from "./perguntasTipos";
import { BLOCO_QUALIFICACAO } from "./qualificacaoExemplo";
import { alternarResposta } from "./respostasVisita";
import { SECCOES_VISITA } from "./visitaExemplo";
import {
  COMERCIAIS_EXEMPLO, COMERCIAL_POR_OMISSAO, CONTACTO_VAZIO, preencherContactoDaPessoa, reporContacto, type ChaveContacto,
  type PessoaOpcao, type ValoresIniciaisNegocio,
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

export function useLevantamentoForm(hoje: string, aoSujar: () => void, inicial?: ValoresIniciaisNegocio["visita"]) {
  const [levantamento, setLevantamento] = useState<LevantamentoForm>(() => {
    const vazio = levantamentoVazio(inicial?.data ?? hoje, comercialValido(inicial?.quemFez));
    return inicial ? { ...vazio, estado: inicial.estado } : vazio;
  });
  const sequencia = useRef(0);
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

const TODOS_OS_BLOCOS = [BLOCO_QUALIFICACAO, ...SECCOES_VISITA.flatMap((s) => s.blocos)];

/** As respostas de escolha rápida das duas abas (os ids das perguntas são únicos): escolher, ou retirar se já estava. */
export function useRespostasForm(aoSujar: () => void) {
  const [respostas, setRespostas] = useState<Respostas>({});
  const escolher = (pergunta: string, opcao: string) => {
    aoSujar();
    setRespostas((r) => alternarResposta(TODOS_OS_BLOCOS, r, pergunta, opcao));
  };
  return { respostas, escolher };
}

/** De onde veio a morada da obra: da visita (igual à morada da lead, ou outra); `null` quando foi escrita à mão. */
export type OrigemMorada = "visitaIgual" | "visitaOutra" | null;

/**
 * A morada da obra; "preencher" traz rua, código postal e localidade e deixa o andar como estava. Vinda da visita, guarda a
 * origem para a dizer; ao escrever ou ao usar a morada do contacto, deixa de ser "da visita".
 */
export function useMoradaForm(aoSujar: () => void, inicial?: ValoresIniciaisNegocio["visita"]) {
  const [morada, setMorada] = useState<MoradaObraForm>(inicial?.moradaObra ?? MORADA_VAZIA);
  const [origem, setOrigem] = useState<OrigemMorada>(inicial ? (inicial.igualALead ? "visitaIgual" : "visitaOutra") : null);
  const mudar = (chave: ChaveMorada, valor: string) => { aoSujar(); setOrigem(null); setMorada((m) => ({ ...m, [chave]: valor })); };
  const preencher = (nova: MoradaObraForm) => { aoSujar(); setOrigem(null); setMorada((m) => ({ ...nova, andar: m.andar })); };
  return { morada, origem, mudar, preencher };
}
