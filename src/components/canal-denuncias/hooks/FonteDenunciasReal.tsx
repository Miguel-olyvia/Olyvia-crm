// O wrapper fino: põe os hooks reais (`@/hooks/useDenunciasCanal`) a cumprir o contrato `FonteDenuncias` dos ecrãs do canal.
// É o ÚNICO sítio em `components/canal-denuncias` que importa da base (ver `semBase.test.ts`): os ecrãs não sabem se falam
// com a base ou com a loja de exemplo. Não guarda nada, não lê o ecrã e não mostra dados de exemplo: se a base não
// responde, a leitura fica em erro e o ecrã di-lo.
import { useMemo, useRef, type ReactNode } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import {
  useCanalPublicoPorSlug, useDenunciaAberta, useDenunciasAccoes, useDenunciasConfiguracao, useDenunciasListar, useDenunciasMinhas,
  useDenunciasPorConfirmar, useDenunciasResponsaveis, useVistaDoDenunciante,
} from "@/hooks/useDenunciasCanal";
import type { Denuncia, Responsavel } from "../lib/tipos";
import { hojeLocal } from "../lib/datas";
import { FonteDenunciasProvider, type CanalPublico, type ConfiguracaoCanal, type FonteDenuncias, type Leitura, type ResponsaveisDoCanal, type ResultadoSimples } from "../dados/fonte";

type Accoes = ReturnType<typeof useDenunciasAccoes>;
interface Atual { acc: Accoes; org: string | null }

const LISTA_VAZIA: Denuncia[] = [];
const RESPONSAVEIS_VAZIOS: ResponsaveisDoCanal = { lista: [] as Responsavel[], euId: null };
const SEM_ORGANIZACAO: ResultadoSimples = { ok: false, erro: "indisponivel" };

interface ResultadoDeQuery<T> {
  data: T | undefined;
  isError: boolean;
  refetch: () => unknown;
}

/** Uma leitura do react-query como `Leitura`: com dados, `ok` (mesmo que a releitura tenha falhado); sem dados, erro ou a carregar. */
function comoLeitura<T>(q: ResultadoDeQuery<T>, vazio: T): Leitura<T> {
  return {
    dados: q.data === undefined ? vazio : q.data,
    estado: q.data !== undefined ? "ok" : q.isError ? "erro" : "a_carregar",
    recarregar: () => void q.refetch(),
  };
}

/** A fonte real. `atual` devolve as ações e a organização ativa no momento da chamada (as ações não guardam nada). */
export function criarFonteReal(atual: () => Atual): FonteDenuncias {
  const agir = (fazer: (acc: Accoes, org: string) => Promise<ResultadoSimples>): Promise<ResultadoSimples> => {
    const { acc, org } = atual();
    return org ? fazer(acc, org) : Promise.resolve(SEM_ORGANIZACAO);
  };

  return {
    modo: "real",
    anexosReais: false,
    hoje: () => hojeLocal(),

    useDenuncias: (org) => comoLeitura(useDenunciasListar(org), LISTA_VAZIA),
    useMinhas: (org) => comoLeitura(useDenunciasMinhas(org), LISTA_VAZIA),
    useDenuncia: (id, perspetiva) => {
      const { activeCompany } = useCompany();
      const org = activeCompany?.id ?? null;
      // As duas leituras estão sempre montadas (regra dos hooks); só a da perspetiva pedida tem um `id`.
      const gestao = useDenunciaAberta(org ?? "", perspetiva === "gestao" ? id : null);
      const denunciante = useVistaDoDenunciante(perspetiva === "denunciante" ? id : null, org);
      return comoLeitura<Denuncia | undefined>(perspetiva === "gestao" ? gestao : denunciante, undefined);
    },
    usePorConfirmar: (org) => useDenunciasPorConfirmar(org).data ?? 0,
    useResponsaveis: (org) => comoLeitura(useDenunciasResponsaveis(org), RESPONSAVEIS_VAZIOS),
    useConfiguracao: (org) => comoLeitura<ConfiguracaoCanal | null>(useDenunciasConfiguracao(org), null),
    useCanalPublico: (parametro): CanalPublico => {
      const slug = parametro && parametro.trim() !== "" ? parametro.trim() : null;
      const q = useCanalPublicoPorSlug(slug);
      // Sem `?org=` (ou desconhecido, ou desligado) nunca se cai noutra organização: é «indisponível».
      if (slug === null) return { estado: "indisponivel", id: "", nome: "" };
      if (q.data) return { estado: q.data.ativo ? "ok" : "indisponivel", id: slug, nome: q.data.nome };
      return { estado: q.isError ? "erro" : "a_carregar", id: slug, nome: "" };
    },

    submeter: (f, origem) => atual().acc.submeter(f, origem),
    entrar: (a) => atual().acc.entrar(a),
    sair: (id) => atual().acc.sair(id),
    responderComoDenunciante: (id, texto, anexos) => atual().acc.responderComoDenunciante(atual().org, id, texto, anexos),

    confirmarRececaoDe: (id) => agir((acc, org) => acc.confirmarRececao(org, id)),
    atribuirA: (id, responsavelId) => agir((acc, org) => acc.atribuir(org, id, responsavelId)),
    declararConflitoDe: (id, responsavelId) => agir((acc, org) => acc.impedir(org, id, responsavelId, "conflito")),
    marcarVisadoDe: (id, responsavelId) => agir((acc, org) => acc.impedir(org, id, responsavelId, "visado")),
    enviarMensagemA: (id, texto) => agir((acc, org) => acc.enviarMensagem(org, id, texto)),
    pedirInformacaoEm: (id, texto) => agir((acc, org) => acc.pedirInformacao(org, id, texto)),
    mudarGravidade: (id, g) => agir((acc, org) => acc.mudarGravidade(org, id, g)),
    notaEm: (id, texto) => agir((acc, org) => acc.adicionarNota(org, id, texto)),
    concluirDenuncia: (id, dados) => agir((acc, org) => acc.concluir(org, id, dados)),
    arquivarDenuncia: (id, motivo) => agir((acc, org) => acc.arquivar(org, id, motivo)),
    reabrirDenuncia: (id) => agir((acc, org) => acc.reabrir(org, id)),
    verIdentidade: (id, motivo) => {
      const { acc, org } = atual();
      return org ? acc.verIdentidade(org, id, motivo) : Promise.resolve(SEM_ORGANIZACAO);
    },

    guardarCanal: (org, ativo, slug) => atual().acc.guardarCanal(org, ativo, slug),
    designarResponsavel: (org, userId) => atual().acc.designarResponsavel(org, userId),
    removerResponsavel: (org, userId) => atual().acc.removerResponsavel(org, userId),
  };
}

/** Monta a fonte real por baixo de `children`. Vai em `App.tsx`, dentro do `CompanyProvider` e do `QueryClientProvider`. */
export function FornecedorFonteDenunciasReal({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany();
  const acc = useDenunciasAccoes();
  const atual = useRef<Atual>({ acc, org: activeCompany?.id ?? null });
  atual.current = { acc, org: activeCompany?.id ?? null };
  const fonte = useMemo(() => criarFonteReal(() => atual.current), []);
  return <FonteDenunciasProvider value={fonte}>{children}</FonteDenunciasProvider>;
}
