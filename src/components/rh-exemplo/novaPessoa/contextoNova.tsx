// O contexto do painel "Nova pessoa": os valores, como alterá-los, o erro de cada controlo e o que a configuração da admissão
// diz de cada campo (obrigatório agora? no convite, na ficha ou opcional?). Os campos de todas as abas lêem daqui, para não
// passarem tudo por propriedades.
import { createContext, useContext, type ReactNode } from "react";
import type { ConfiguracaoCampo } from "@/components/rh-exemplo/lib/admissaoObrigatorios";
import type { ResultadoAnexosNovaPessoa } from "@/components/rh-exemplo/hooks/useAnexosNovaPessoa";
import type { ContaNova } from "./contaNova";
import { seccaoDoCampo, type SeccaoConvite } from "./ids";
import type { AlterarNova, ValoresNovaPessoa } from "./tiposNova";

export interface ContextoNova {
  valores: ValoresNovaPessoa;
  alterar: AlterarNova;
  /** A mensagem (já traduzida) do campo, ou `null` se não há erro ou ainda não se mostra. */
  erro: (campoId: string) => string | null;
  /** O campo é obrigatório neste momento (marca com asterisco e com o texto "obrigatório"). */
  obrigatorio: (campoId: string) => boolean;
  config: readonly ConfiguracaoCampo[] | null;
  colegas: ReadonlyArray<{ id: string; nome_completo: string }>;
  /** Ligar a uma conta de CRM que já existe (preenche e, com a permissão, liga). */
  conta: ContaNova;
  /** Os ficheiros reais escolhidos (seguem depois de a ficha existir). */
  anexos: ResultadoAnexosNovaPessoa;
  /** A ficha está a ser criada: nada se escolhe nem se retira. */
  aCriar: boolean;
  /** Saúde e sindicalização (art. 9.º do RGPD) só se pedem a quem tem a permissão de as escrever. */
  podeSaude: boolean;
  podeSindicalizacao: boolean;
}

const Contexto = createContext<ContextoNova | null>(null);

export function ProvedorNova({ valor, children }: { valor: ContextoNova; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useNova(): ContextoNova {
  const ctx = useContext(Contexto);
  if (ctx === null) throw new Error("useNova fora do ProvedorNova");
  return ctx;
}

export type PosicaoEtiqueta = "convite" | "ficha" | "opcional" | "rh" | "pedirConvite";

/** A etiqueta de posição de um campo: a da configuração, ou "a pedir no convite" se a secção foi adiada. */
export function posicaoDoCampo(
  ctx: Pick<ContextoNova, "config" | "valores">,
  codigo: string | undefined,
  campoId: string,
): PosicaoEtiqueta | null {
  if (codigo === undefined || ctx.config === null) return null;
  const posicao = ctx.config.find((c) => c.codigo === codigo)?.posicao ?? null;
  if (posicao === null) return null;
  const seccao: SeccaoConvite | undefined = seccaoDoCampo(campoId);
  if (posicao === "convite" && seccao && ctx.valores.extra.noConvite[seccao] === true) return "pedirConvite";
  return posicao;
}
