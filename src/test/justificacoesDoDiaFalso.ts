/**
 * A base das justificações do dia, simulada em memória, para os testes dos ecrãs de /rh-exemplo.
 *
 * Os ecrãs lêem e escrevem as justificações pelo wrapper `@/components/rh-exemplo/hooks/useJustificacoesDoDia`, que fala com a
 * base por RPC e precisa de um `CompanyProvider`. Os testes que só querem ver o ecrã trocam o wrapper por este módulo:
 *
 *   vi.mock("@/components/rh-exemplo/hooks/useJustificacoesDoDia", async () => (await import("@/test/justificacoesDoDiaFalso")).wrapperFalso());
 *
 * Esta «base» faz o que a base faz e que o ecrã vê: uma linha por envio, uma só decisão por justificação, aceitar devolve o id
 * de uma falta e o mês fechado, recusar não devolve falta. Sobrevive a desmontar e montar de novo um ecrã (o que a memória do
 * browser não fazia ao recarregar). Nada toca em base nenhuma.
 */
import { useEffect, useMemo, useState } from "react";
import type { JustificacaoDia } from "@/components/rh-exemplo/lib/justificacaoDia";
import type { ArgumentosDeRegisto, DecisaoJustificacaoDiaDb } from "@/lib/hr/justificacaoDia";

export interface DecisaoRegistada {
  justificacaoId: string;
  decisao: DecisaoJustificacaoDiaDb;
  motivo: string | null;
}

export const FALTA_DA_BASE = "falta-da-base-1";

export const baseFalsa = {
  justificacoes: [] as JustificacaoDia[],
  registos: [] as ArgumentosDeRegisto[],
  decisoes: [] as DecisaoRegistada[],
  leituras: [] as { pessoaId: string | null; de: string | null; ate: string | null; soPendentes: boolean }[],
  textos: {} as Record<string, string>,
  acessos: [] as { quem: string; quando: string }[],
  textosLidos: [] as string[],
  /** A RPC ainda não existe na base: leituras `indisponivel` e escritas com a chave do erro. */
  indisponivel: false,
  /** Uma chave de tradução que as escritas devolvem em vez de gravar (prazo, falta já marcada, permissão...). */
  erroDeEscrita: null as string | null,
  /** O mês do dia já está fechado: aceitar exige `confirmarMesFechado`, como a base. */
  mesFechado: false,
  /** A ficha de quem está a decidir (`null`: sem ficha). A base recusa decidir a própria. */
  minhaPessoaId: null as string | null,
  proximo: 1,
};

const ouvintes = new Set<() => void>();
const avisar = (): void => ouvintes.forEach((o) => o());

export function reporBaseFalsa(): void {
  baseFalsa.justificacoes = [];
  baseFalsa.registos = [];
  baseFalsa.decisoes = [];
  baseFalsa.leituras = [];
  baseFalsa.textos = {};
  baseFalsa.acessos = [];
  baseFalsa.textosLidos = [];
  baseFalsa.indisponivel = false;
  baseFalsa.erroDeEscrita = null;
  baseFalsa.mesFechado = false;
  baseFalsa.minhaPessoaId = null;
  baseFalsa.proximo = 1;
}

/** Acrescenta à base uma justificação já existente (por omissão, pendente). */
export function semearJustificacao(parcial: Partial<JustificacaoDia> & Pick<JustificacaoDia, "id" | "pessoaId" | "data">): JustificacaoDia {
  const j: JustificacaoDia = {
    origem: "sugestao", tipo: "transporte", motivo: "O autocarro avariou a meio do caminho", horaReal: null, anexos: [], minutos: 15,
    periodoInicio: "09:00", periodoFim: "09:15", deAtraso: false, enviadaEm: "2026-10-12T10:00:00.000Z", estado: "pendente",
    decididaPor: null, decididaEm: null, motivoRecusa: null, faltaId: null, mesFechado: false, ...parcial,
  };
  baseFalsa.justificacoes = [...baseFalsa.justificacoes, j];
  avisar();
  return j;
}

const minutosDe = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

async function registar(args: ArgumentosDeRegisto): Promise<{ erro: string | null; id: string | null }> {
  if (baseFalsa.indisponivel) return { erro: "rhJust.erro.indisponivel", id: null };
  if (baseFalsa.erroDeEscrita) return { erro: baseFalsa.erroDeEscrita, id: null };
  baseFalsa.registos = [...baseFalsa.registos, args];
  const id = `jd-novo-${baseFalsa.proximo++}`;
  baseFalsa.justificacoes = [
    ...baseFalsa.justificacoes,
    {
      id, origem: "sugestao", pessoaId: args.pessoaId, data: args.data, tipo: args.tipo, motivo: args.motivo, horaReal: args.horaReal,
      anexos: [...args.anexosNomes], minutos: minutosDe(args.periodoFim) - minutosDe(args.periodoInicio), periodoInicio: args.periodoInicio,
      periodoFim: args.periodoFim, deAtraso: args.deAtraso, enviadaEm: new Date().toISOString(), estado: "pendente", decididaPor: null,
      decididaEm: null, motivoRecusa: null, faltaId: null, mesFechado: false,
    },
  ];
  avisar();
  return { erro: null, id };
}

async function decidir(args: {
  justificacaoId: string;
  decisao: DecisaoJustificacaoDiaDb;
  motivo?: string | null;
  confirmarMesFechado?: boolean;
}): Promise<{ erro: string | null; faltaId: string | null; mesFechado: boolean }> {
  if (baseFalsa.indisponivel) return { erro: "rhJust.erro.indisponivel", faltaId: null, mesFechado: false };
  if (baseFalsa.erroDeEscrita) return { erro: baseFalsa.erroDeEscrita, faltaId: null, mesFechado: false };
  const alvo = baseFalsa.justificacoes.find((j) => j.id === args.justificacaoId);
  if (!alvo) return { erro: "rhJust.erro.inexistente", faltaId: null, mesFechado: false };
  // Como a base: ninguém decide a sua própria justificação, nem aceitando nem recusando.
  if (baseFalsa.minhaPessoaId !== null && alvo.pessoaId === baseFalsa.minhaPessoaId) {
    return { erro: "rhJust.erro.propriaDecisao", faltaId: null, mesFechado: false };
  }
  if (alvo.estado !== "pendente") return { erro: "rhJust.erro.jaDecidida", faltaId: null, mesFechado: false };
  const aceitar = args.decisao !== "recusar";
  // Como a base: aceitar num mês fechado sem confirmação não escreve nada e pede-a.
  if (aceitar && baseFalsa.mesFechado && args.confirmarMesFechado !== true) {
    return { erro: "rhJust.erro.mesFechado", faltaId: null, mesFechado: false };
  }
  baseFalsa.decisoes = [...baseFalsa.decisoes, { justificacaoId: args.justificacaoId, decisao: args.decisao, motivo: args.motivo ?? null }];
  baseFalsa.justificacoes = baseFalsa.justificacoes.map((j) =>
    j.id !== alvo.id
      ? j
      : {
          ...j,
          estado: args.decisao === "recusar" ? "recusada" : args.decisao === "aceitar_paga" ? "aceite_paga" : "aceite_nao_paga",
          decididaPor: "Rita Matos",
          decididaEm: new Date().toISOString(),
          motivoRecusa: aceitar ? null : (args.motivo ?? null),
          faltaId: aceitar ? FALTA_DA_BASE : null,
          mesFechado: aceitar && baseFalsa.mesFechado,
        },
  );
  avisar();
  return { erro: null, faltaId: aceitar ? FALTA_DA_BASE : null, mesFechado: aceitar && baseFalsa.mesFechado };
}

async function verTexto(justificacaoId: string): Promise<{ erro: string | null; texto: string | null }> {
  const texto = baseFalsa.textos[justificacaoId];
  if (texto === undefined) return { erro: "rhJust.erro.semPermissao", texto: null };
  baseFalsa.textosLidos = [...baseFalsa.textosLidos, justificacaoId];
  baseFalsa.acessos = [...baseFalsa.acessos, { quem: "Rita Matos", quando: "2026-10-14T12:00:00.000Z" }];
  return { erro: null, texto };
}

async function acessos(): Promise<{ erro: string | null; acessos: { quem: string; quando: string }[] }> {
  return { erro: null, acessos: baseFalsa.acessos };
}

const accoes = { registar, decidir, verTexto, acessos, aGravar: false };

export function useAccoesJustificacaoDia() {
  return accoes;
}

interface Opcoes {
  pessoaId?: string | null;
  de?: string | null;
  ate?: string | null;
  soPendentes?: boolean;
  activo?: boolean;
}

export function useJustificacoesDoDia(opcoes: Opcoes = {}) {
  const { pessoaId = null, de = null, ate = null, soPendentes = false, activo = true } = opcoes;
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    const reler = () => setVersao((v) => v + 1);
    ouvintes.add(reler);
    return () => {
      ouvintes.delete(reler);
    };
  }, []);
  useEffect(() => {
    if (activo) baseFalsa.leituras = [...baseFalsa.leituras, { pessoaId, de, ate, soPendentes }];
  }, [activo, pessoaId, de, ate, soPendentes, versao]);
  const justificacoes = useMemo(
    () =>
      !activo || baseFalsa.indisponivel
        ? []
        : baseFalsa.justificacoes
            .filter((j) => (pessoaId ? j.pessoaId === pessoaId : true))
            .filter((j) => (de ? j.data >= de : true))
            .filter((j) => (ate ? j.data <= ate : true))
            .filter((j) => (soPendentes ? j.estado === "pendente" : true))
            .sort((a, b) => a.enviadaEm.localeCompare(b.enviadaEm)),
    // `versao` muda quando a base muda: é ele que refaz a lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activo, pessoaId, de, ate, soPendentes, versao],
  );
  return {
    justificacoes, loading: false, recusado: false, erro: false, indisponivel: activo && baseFalsa.indisponivel, recarregar: async () => avisar(),
  };
}

/** O módulo que substitui o wrapper real num `vi.mock`. */
export function wrapperFalso() {
  return { useJustificacoesDoDia, useAccoesJustificacaoDia };
}
