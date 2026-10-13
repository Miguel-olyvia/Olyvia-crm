// Os avisos do Resumo da ficha. Função pura. "Voltou a contactar" só aparece a quem pode ver submissões
// (permissão platform.pending_submissions.view); "Sem contacto há N dias" a partir do limite da lista; e uma lead
// perdida com negócios abertos avisa que eles ficam à parte.
import { LIMITE_SEM_CONTACTO } from "./filtrosPessoas";
import type { Pessoa } from "./pessoasTipos";

export type AvisoPessoa =
  | { tipo: "voltou" }
  | { tipo: "semContacto"; dias: number }
  | { tipo: "negociosAbertosPerdida"; quantos: number };

export interface EntradaAvisos {
  pessoa: Pick<Pessoa, "ultimoContactoDias" | "perdida">;
  /** Tem submissões pendentes e ainda ninguém lhe respondeu. */
  voltou: boolean;
  podeVerSubmissoes: boolean;
  /** Quantos negócios abertos tem (por defeito, nenhum). */
  negociosAbertos?: number;
}

/** Os avisos desta pessoa, pela ordem em que se mostram. Uma perdida não tem "sem contacto": já não há nada a tratar. */
export function avisosPessoa({ pessoa, voltou, podeVerSubmissoes, negociosAbertos = 0 }: EntradaAvisos): AvisoPessoa[] {
  const avisos: AvisoPessoa[] = [];
  if (voltou && podeVerSubmissoes) avisos.push({ tipo: "voltou" });
  if (!pessoa.perdida && pessoa.ultimoContactoDias >= LIMITE_SEM_CONTACTO) {
    avisos.push({ tipo: "semContacto", dias: pessoa.ultimoContactoDias });
  }
  if (pessoa.perdida && negociosAbertos > 0) avisos.push({ tipo: "negociosAbertosPerdida", quantos: negociosAbertos });
  return avisos;
}
