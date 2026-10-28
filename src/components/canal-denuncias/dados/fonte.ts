// O contrato da fonte de dados do canal de denúncias: tudo o que os ecrãs lêem e fazem passa por aqui. Os nomes das ações
// são os da loja em memória (`loja.ts`), que é a implementação por omissão e a que os testes usam; a implementação real
// (`../hooks/FonteDenunciasReal.tsx`) fala com a base e com a Edge `denuncia-publica`. Os ecrãs não sabem qual das duas têm.
//
// As ações são assíncronas e NUNCA lançam: devolvem `{ ok: false, erro }` com um código que o ecrã traduz. Uma leitura
// que falha fica `estado: "erro"` (o ecrã di-lo); nunca devolve dados de exemplo no lugar dos reais.
import { createContext, useContext } from "react";
import type { DadosDecisao, ErroAcao } from "../lib/acoes";
import type { DadosFormulario } from "../lib/formulario";
import type { Anexo, Denuncia, Gravidade, Identidade, Responsavel } from "../lib/tipos";
import { fonteMemoria } from "./fonteMemoria";

export type EstadoLeitura = "a_carregar" | "ok" | "erro";

export interface Leitura<T> {
  dados: T;
  estado: EstadoLeitura;
  /** Lê outra vez (o botão «Tentar de novo» do ecrã). */
  recarregar: () => void;
}

/** `gestao`: o que o responsável do canal vê. `denunciante`: o que quem denunciou vê (sem notas, gravidade nem responsável). */
export type Perspetiva = "gestao" | "denunciante";

/** De onde vem a denúncia nova. Dentro da app `organizationId` é a organização ativa; na página pública vem `slug`. */
export interface OrigemNova {
  organizationId: string;
  pessoaId?: string | null;
  slug?: string;
}

export type ResultadoSubmissao = { ok: true; codigo: string; pin: string } | { ok: false; erro: ErroAcao };
export type ResultadoIdentidade = { ok: true; identidade: Identidade } | { ok: false; erro: ErroAcao };
export type ResultadoSimples = { ok: true } | { ok: false; erro: ErroAcao };
/** Código ou PIN errados, o código bloqueado e um código que não existe são a MESMA resposta (`invalido`). */
export type ResultadoEntrada = { ok: true; id: string } | { ok: false; erro: "invalido" | "indisponivel" | "limite" };

export interface ArgumentosEntrada {
  codigo: string;
  pin: string;
  /** Página pública: o `?org=`. */
  slug?: string;
  /** Dentro da app: a organização ativa. */
  organizacaoId?: string;
}

export interface ResponsaveisDoCanal {
  lista: Responsavel[];
  /** Quem tem a sessão, se for um dos responsáveis (só ele pode declarar o seu conflito). Nulo nos dados de exemplo. */
  euId: string | null;
}

export interface ConfiguracaoCanal {
  ativo: boolean;
  slug: string;
  responsaveis: Responsavel[];
  /** Quem se pode designar (membros da organização que ainda não são responsáveis). */
  candidatos: Responsavel[];
  /** Casos que nenhum responsável pode tratar (todos impedidos). Só a contagem, nunca o conteúdo. */
  semQuemTrate: number;
}

export interface CanalPublico {
  estado: "a_carregar" | "ok" | "indisponivel" | "erro";
  /** O identificador a usar nas páginas e nas ações (nos dados de exemplo, o id da organização; na base, o próprio slug). */
  id: string;
  nome: string;
}

export interface FonteDenuncias {
  modo: "memoria" | "real";
  /** Verdadeiro quando os anexos são enviados de facto. Falso: o ecrã diz que se podem enviar depois (D7 do desenho). */
  anexosReais: boolean;
  /** Hoje, AAAA-MM-DD: o dia fixo dos dados de exemplo, ou o dia da máquina. */
  hoje: () => string;

  // Leituras (hooks)
  useDenuncias: (organizationId: string) => Leitura<Denuncia[]>;
  useMinhas: (organizationId: string, pessoaId: string) => Leitura<Denuncia[]>;
  useDenuncia: (id: string | null, perspetiva: Perspetiva) => Leitura<Denuncia | undefined>;
  usePorConfirmar: (organizationId: string) => number;
  useResponsaveis: (organizationId: string) => Leitura<ResponsaveisDoCanal>;
  /** `null`: quem não pode configurar o canal. */
  useConfiguracao: (organizationId: string) => Leitura<ConfiguracaoCanal | null>;
  useCanalPublico: (parametro: string | null) => CanalPublico;

  // Denunciar e acompanhar (público ou dentro da app)
  submeter: (f: DadosFormulario, origem: OrigemNova) => Promise<ResultadoSubmissao>;
  entrar: (a: ArgumentosEntrada) => Promise<ResultadoEntrada>;
  /** Esquece a sessão de acompanhamento (só existe em memória). */
  sair: (id: string) => void;
  responderComoDenunciante: (id: string, texto: string, anexos: Anexo[]) => Promise<ResultadoSimples>;

  // Gestão
  confirmarRececaoDe: (id: string) => Promise<ResultadoSimples>;
  atribuirA: (id: string, responsavelId: string) => Promise<ResultadoSimples>;
  declararConflitoDe: (id: string, responsavelId: string) => Promise<ResultadoSimples>;
  marcarVisadoDe: (id: string, responsavelId: string) => Promise<ResultadoSimples>;
  enviarMensagemA: (id: string, texto: string) => Promise<ResultadoSimples>;
  pedirInformacaoEm: (id: string, texto: string) => Promise<ResultadoSimples>;
  mudarGravidade: (id: string, g: Gravidade) => Promise<ResultadoSimples>;
  notaEm: (id: string, texto: string) => Promise<ResultadoSimples>;
  concluirDenuncia: (id: string, dados: DadosDecisao) => Promise<ResultadoSimples>;
  arquivarDenuncia: (id: string, motivo: string) => Promise<ResultadoSimples>;
  reabrirDenuncia: (id: string) => Promise<ResultadoSimples>;
  /** Mostra a identidade de quem denunciou. O motivo fica registado com quem viu e quando. */
  verIdentidade: (id: string, motivo: string) => Promise<ResultadoIdentidade>;

  // Configuração (quem tem `denuncias.configurar`)
  guardarCanal: (organizationId: string, ativo: boolean, slug: string) => Promise<ResultadoSimples>;
  designarResponsavel: (organizationId: string, userId: string) => Promise<ResultadoSimples>;
  removerResponsavel: (organizationId: string, userId: string) => Promise<ResultadoSimples>;
}

const Contexto = createContext<FonteDenuncias>(fonteMemoria);

/** Põe a fonte a usar pelos ecrãs do canal. Sem fornecedor, vale a loja em memória (os testes). */
export const FonteDenunciasProvider = Contexto.Provider;

export const useFonte = (): FonteDenuncias => useContext(Contexto);
