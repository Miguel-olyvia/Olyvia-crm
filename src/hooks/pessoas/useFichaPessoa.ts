import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { CHAVES_ERRO_NEG } from "./errosNeg";
import { TIPOS_SECCAO, type FichaDb, type SeccaoDb, type TipoSeccao } from "./fichaTipos";
import { comoErroNeg, repetir } from "./useListaPessoas";
import { useFontePessoas } from "./useFontePessoas";

// A ficha refaz-se sempre que se volta a ela (propostas, contratos e orçamentos criados noutros ecrãs): nada de cache fresca.
const STALE_TIME_MS = 0;
/** Itens por página de cada secção (a função aceita de 1 a 100). */
const LIMITE_FICHA = 30;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A pessoa já não está disponível, ou a funcionalidade não está ativa: a ficha não abre e não vale a pena repetir. */
const CODIGOS_INDISPONIVEL = ["NG003", "NG008"];

export type EstadoFicha = "a-carregar" | "ok" | "indisponivel" | "erro";
type ErrosMais = Partial<Record<TipoSeccao, ErroNeg>>;

/** Sem `pessoaId` devolve o prefixo (a organização), para invalidar todas as fichas dela. */
export function fichaPessoaQueryKey(organizationId: string | null | undefined, pessoaId?: string | null) {
  const base = ["neg-ficha-pessoa", organizationId ?? null] as const;
  return pessoaId ? ([...base, pessoaId] as const) : base;
}

export interface FichaPessoaLida {
  /** A ficha da pessoa pedida; nula enquanto carrega (nunca a da pessoa anterior: não há `placeholderData`). */
  ficha: FichaDb | null;
  estado: EstadoFicha;
  /** O erro da última leitura. Com a ficha em cache e uma atualização que falhou, continua `ok` mas o erro fica aqui. */
  erro: ErroNeg | null;
  /** A ficha mostrada é a de uma leitura anterior porque a atualização falhou: a ficha deve dizê-lo. */
  atualizacaoFalhou: boolean;
  /** Pede a página seguinte de uma secção e junta-a ao que já está (sem repetir ids). Nunca lança: a falha fica em `errosMais`. */
  carregarMais: (tipo: TipoSeccao) => Promise<void>;
  /** Os estados de «carregar mais» são DESTA pessoa: não passam de uma pessoa a outra. */
  aCarregarMais: boolean;
  carregandoTipos: TipoSeccao[];
  errosMais: ErrosMais;
  /** O erro da última secção que falhou ao carregar mais (para quem só precisa de um). */
  erroAoCarregarMais: ErroNeg | null;
  recarregar: () => void;
}

/**
 * As secções a que já se acrescentaram páginas («carregar mais»), por cliente de consultas e por pessoa: só estas se preservam numa leitura
 * nova (uma leitura mais curta, sem isso, é a verdade). Não se marca no objeto: o react-query copia os dados ao guardá-los.
 */
const alargadasPorCliente = new WeakMap<QueryClient, Map<string, Set<TipoSeccao>>>();

function alargadasDe(client: QueryClient, organizationId: string | null, pessoaId: string): Set<TipoSeccao> {
  let porPessoa = alargadasPorCliente.get(client);
  if (!porPessoa) {
    porPessoa = new Map();
    alargadasPorCliente.set(client, porPessoa);
  }
  const marca = `${organizationId}:${pessoaId}`;
  let tipos = porPessoa.get(marca);
  if (!tipos) {
    tipos = new Set();
    porPessoa.set(marca, tipos);
  }
  return tipos;
}

/** Junta a página nova de uma secção à que já estava: os ids novos vão para o fim; o resto (total, cursor) é o da página nova. Copia, nunca muta. */
function juntarSeccao<T extends { id: string }>(antiga: SeccaoDb<T> | null, nova: SeccaoDb<T>): SeccaoDb<T> {
  const vistos = new Set((antiga?.itens ?? []).map((i) => i.id));
  return { ...nova, itens: [...(antiga?.itens ?? []), ...nova.itens.filter((i) => !vistos.has(i.id))] };
}

function juntarFicha(antiga: FichaDb, nova: FichaDb, tipo: TipoSeccao): FichaDb {
  const parte = nova[tipo] as SeccaoDb<{ id: string }> | null;
  if (!parte) return antiga;
  return { ...antiga, [tipo]: juntarSeccao(antiga[tipo] as SeccaoDb<{ id: string }> | null, parte) } as FichaDb;
}

/**
 * Uma leitura nova (primeira página de tudo) por cima de uma ficha em que já se tinha carregado mais: os itens já carregados não se perdem.
 * A página nova vai à frente (pode ter itens novos); os mais antigos que já estavam ficam a seguir, com o cursor de quem os carregou.
 */
export function preservarCarregados(nova: FichaDb, anterior: FichaDb | undefined, alargadas: ReadonlySet<TipoSeccao>): FichaDb {
  if (!anterior || anterior.pessoa.id !== nova.pessoa.id) return nova;
  let resultado = nova;
  for (const tipo of TIPOS_SECCAO) {
    const antes = anterior[tipo] as SeccaoDb<{ id: string }> | null;
    const agora = nova[tipo] as SeccaoDb<{ id: string }> | null;
    if (!antes || !agora || !alargadas.has(tipo)) continue;
    const vistos = new Set(agora.itens.map((i) => i.id));
    const juntos: SeccaoDb<{ id: string }> = {
      ...agora,
      itens: [...agora.itens, ...antes.itens.filter((i) => !vistos.has(i.id))],
      tem_mais: agora.tem_mais && antes.tem_mais,
      proximo: agora.tem_mais ? antes.proximo : null,
    };
    resultado = { ...resultado, [tipo]: juntos } as FichaDb;
  }
  return resultado;
}

function pedirFicha(organizationId: string, pessoaId: string, extra: { depois: unknown; partes: TipoSeccao[] | null }): Promise<FichaDb> {
  return chamarNeg<FichaDb | null>("neg_ficha_pessoa", {
    p_organization_id: organizationId,
    p_entity_id: pessoaId,
    p_limite: LIMITE_FICHA,
    p_depois: extra.depois,
    p_partes: extra.partes,
  }).then((ficha) => {
    // Uma resposta vazia é uma pessoa que já não está disponível.
    if (!ficha) throw new ErroNeg(null, "NG003", CHAVES_ERRO_NEG.NG003);
    return ficha;
  });
}

/** Teto de páginas seguintes por pedido: protege de uma base que nunca diga «acabou». */
const MAX_PAGINAS_SEGUINTES = 100;

/**
 * Pede a página seguinte de uma secção e junta-a. Com `todas`, repete enquanto `tem_mais` for verdadeiro (pára se a base repetir o cursor).
 * Nunca lança: numa falha devolve o que já juntou e o erro.
 */
async function pedirSeguintes(
  organizationId: string, pessoaId: string, inicial: FichaDb, tipo: TipoSeccao, todas: boolean,
): Promise<{ ficha: FichaDb; erro: unknown }> {
  let atual = inicial;
  for (let i = 0; i < MAX_PAGINAS_SEGUINTES; i += 1) {
    const seccao = atual[tipo];
    if (!seccao || !seccao.tem_mais || !seccao.proximo) break;
    try {
      const nova = await pedirFicha(organizationId, pessoaId, { depois: { [tipo]: seccao.proximo }, partes: [tipo] });
      const parte = nova[tipo];
      if (!parte) break;
      atual = juntarFicha(atual, nova, tipo);
      if (!todas || JSON.stringify(parte.proximo) === JSON.stringify(seccao.proximo)) break;
    } catch (erro) {
      return { ficha: atual, erro };
    }
  }
  return { ficha: atual, erro: null };
}

interface EstadoMais {
  carregando: TipoSeccao[];
  erros: ErrosMais;
}
const SEM_MAIS: EstadoMais = { carregando: [], erros: {} };

/**
 * A ficha de uma pessoa (neg_ficha_pessoa). Só lê em modo «real», com organização e um identificador com forma de uuid; senão fica
 * «indisponivel» sem pedir nada. Não mostra a ficha da pessoa anterior enquanto a nova carrega (quem mostra tem de fazer o mesmo).
 */
export function useFichaPessoa(pessoaId: string | null): FichaPessoaLida {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const ativo = !!organizationId && !!pessoaId && UUID.test(pessoaId);
  const chave = fichaPessoaQueryKey(organizationId, pessoaId);

  // Os estados de «carregar mais» ficam por pessoa: um carregamento a meio de A não aparece em B.
  const [maisPorPessoa, setMaisPorPessoa] = useState<Record<string, EstadoMais>>({});
  const emCurso = useRef(new Set<string>());
  const mexer = useCallback((id: string, mudar: (e: EstadoMais) => EstadoMais) => {
    setMaisPorPessoa((todos) => ({ ...todos, [id]: mudar(todos[id] ?? SEM_MAIS) }));
  }, []);

  const consulta = useQuery({
    queryKey: chave,
    queryFn: async () => {
      const primeira = await pedirFicha(organizationId as string, pessoaId as string, { depois: null, partes: null });
      // Os levantamentos vêm todos: «o mais recente por ligar» só é fiável com todas as páginas. Uma falha deixa a ficha com o que veio.
      const { ficha, erro } = await pedirSeguintes(organizationId as string, pessoaId as string, primeira, "levantamentos", true);
      const falha = comoErroNeg(erro) ?? undefined;
      mexer(pessoaId as string, (e) => ({ ...e, erros: { ...semChave(e.erros, "levantamentos"), ...(falha ? { levantamentos: falha } : {}) } }));
      return preservarCarregados(ficha, client.getQueryData<FichaDb>(chave), alargadasDe(client, organizationId, pessoaId as string));
    },
    enabled: ativo,
    staleTime: STALE_TIME_MS,
    refetchOnMount: "always",
    retry: repetir,
  });

  const carregarMais = useCallback(async (tipo: TipoSeccao): Promise<void> => {
    const atual = client.getQueryData<FichaDb>(chave);
    const seccao = atual?.[tipo];
    const marca = `${pessoaId}:${tipo}`;
    if (!ativo || !pessoaId || emCurso.current.has(marca) || !seccao || !seccao.tem_mais || !seccao.proximo) return;
    emCurso.current.add(marca);
    mexer(pessoaId, (e) => ({ carregando: [...e.carregando, tipo], erros: { ...e.erros, [tipo]: undefined } }));
    try {
      // Os levantamentos pedem-se até ao fim; as outras secções, uma página de cada vez.
      const { ficha: completa, erro } = await pedirSeguintes(organizationId as string, pessoaId, atual as FichaDb, tipo, tipo === "levantamentos");
      if (completa !== atual) {
        client.setQueryData<FichaDb>(chave, (velha) => (velha ? { ...velha, [tipo]: completa[tipo] } as FichaDb : velha));
        alargadasDe(client, organizationId, pessoaId).add(tipo);
      }
      const falha = comoErroNeg(erro) ?? undefined;
      mexer(pessoaId, (e) => ({ carregando: e.carregando.filter((t) => t !== tipo), erros: { ...semChave(e.erros, tipo), ...(falha ? { [tipo]: falha } : {}) } }));
    } finally {
      emCurso.current.delete(marca);
    }
    // `chave` muda com a organização e a pessoa; o resto vem delas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, ativo, organizationId, pessoaId, mexer]);

  const recarregar = useCallback(() => { if (ativo) void consulta.refetch(); }, [ativo, consulta]);

  // Uma falha em cache não conta enquanto há uma nova leitura a correr (reabrir a mesma pessoa): só a falha firme, depois de acabar.
  const erro = consulta.isError && !consulta.isFetching ? comoErroNeg(consulta.error) : null;
  const ficha = ativo ? consulta.data ?? null : null;
  let estado: EstadoFicha;
  if (!ativo) estado = "indisponivel";
  else if (ficha) estado = "ok";
  else if (erro) estado = erro.codigo && CODIGOS_INDISPONIVEL.includes(erro.codigo) ? "indisponivel" : "erro";
  else estado = "a-carregar";

  const mais = (ativo && pessoaId ? maisPorPessoa[pessoaId] : undefined) ?? SEM_MAIS;
  const erroAoCarregarMais = (Object.values(mais.erros).find(Boolean) as ErroNeg | undefined) ?? null;
  return {
    ficha, estado, erro, atualizacaoFalhou: ficha !== null && erro !== null, carregarMais, aCarregarMais: mais.carregando.length > 0,
    carregandoTipos: mais.carregando, errosMais: limparIndefinidos(mais.erros), erroAoCarregarMais, recarregar,
  };
}

function semChave(erros: ErrosMais, tipo: TipoSeccao): ErrosMais {
  const copia = { ...erros };
  delete copia[tipo];
  return copia;
}

function limparIndefinidos(erros: ErrosMais): ErrosMais {
  return Object.fromEntries(Object.entries(erros).filter(([, v]) => v !== undefined)) as ErrosMais;
}
