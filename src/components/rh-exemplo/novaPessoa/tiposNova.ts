// A forma do formulário "Nova pessoa" (painel lateral de exemplo). Parte do rascunho do assistente real (nomes, tipos e
// validações iguais) e acrescenta o que a ficha real tem e o assistente não pede: saúde, sindicalização, contacto de
// emergência completo, categorias do contrato, anexos e as secções que se pedem à pessoa no convite. Só forma e funções
// puras: nada de React nem de acesso a dados.
import { rascunhoInicial, type RascunhoPessoa } from "@/components/rh-exemplo/lib/novaPessoa";
import type { CategoriaFuncao } from "@/components/rh-exemplo/tipos";
import type { SeccaoConvite } from "./ids";

/** Quanto tempo vale o link do convite (os mesmos dias que a Edge Function `convite-admissao` dá: `VALIDADE_DIAS`). */
export const DIAS_DO_CONVITE = 7;

export type SimNao = "" | "sim" | "nao";

/** O que o painel pede além do rascunho do assistente real. */
export interface ExtrasForm {
  nome_tratamento: string;
  categoria_funcao: CategoriaFuncao | "";
  categoria_profissional: string;
  renovavel: SimNao;
  isencao_horario: boolean;
  conta_agencia: string;
  emergencia_telefone_alt: string;
  emergencia_email: string;
  saude_incapacidade: string;
  saude_validade: string;
  saude_adaptacoes: string;
  saude_observacoes: string;
  sindicalizado: SimNao;
  sindicato: string;
  sindicato_quota: string;
  criar_acesso: boolean;
  email_acesso: string;
  /** Secções que se pedem à pessoa no convite: aqui não se exigem. */
  noConvite: Partial<Record<SeccaoConvite, boolean>>;
}

export interface ValoresNovaPessoa extends RascunhoPessoa {
  extra: ExtrasForm;
}

export type GrupoNova = keyof ValoresNovaPessoa;
export type AlterarNova = <G extends GrupoNova>(grupo: G, patch: Partial<ValoresNovaPessoa[G]>) => void;

export const EXTRAS_VAZIOS: Readonly<ExtrasForm> = {
  nome_tratamento: "",
  categoria_funcao: "",
  categoria_profissional: "",
  renovavel: "",
  isencao_horario: false,
  conta_agencia: "",
  emergencia_telefone_alt: "",
  emergencia_email: "",
  saude_incapacidade: "",
  saude_validade: "",
  saude_adaptacoes: "",
  saude_observacoes: "",
  sindicalizado: "",
  sindicato: "",
  sindicato_quota: "",
  criar_acesso: false,
  email_acesso: "",
  noConvite: {},
};

/**
 * Os valores com que o painel abre: os do assistente real, mais a data de admissão e a de início do contrato a "hoje"
 * (visíveis e editáveis). Tudo o resto fica em branco: o RH escolhe o tipo de contrato, o subsídio e os duodécimos.
 */
export function valoresIniciais(hoje: string): ValoresNovaPessoa {
  const base = rascunhoInicial();
  return {
    ...base,
    laborais: { ...base.laborais, data_admissao: hoje },
    contrato: { ...base.contrato, data_inicio: hoje },
    extra: { ...EXTRAS_VAZIOS, noConvite: {} },
  };
}

/** O texto de um campo, aparado, ou `null` se estiver vazio. */
export function textoOuNull(valor: string): string | null {
  const limpo = valor.trim();
  return limpo === "" ? null : limpo;
}

/** Aplica um patch a um grupo, sem alterar o objeto de origem. */
export function comPatch<G extends GrupoNova>(
  valores: ValoresNovaPessoa,
  grupo: G,
  patch: Partial<ValoresNovaPessoa[G]>,
): ValoresNovaPessoa {
  return { ...valores, [grupo]: { ...valores[grupo], ...patch } };
}
