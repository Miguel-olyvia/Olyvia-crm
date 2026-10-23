// A denúncia feita de dentro da app: quem tem a sessão pode denunciar de forma anónima ou identificada. Identificada, o
// nome e o email vêm da própria pessoa e a denúncia fica ligada a ela; anónima, nada da pessoa entra no formulário.
import type { DadosFormulario } from "./formulario";

export interface PessoaLigada {
  id: string;
  nome: string;
  email: string;
}

/** Aplica uma alteração ao formulário, preenchendo ou limpando os dados da pessoa conforme o modo escolhido. */
export function aplicarAlteracao(dados: DadosFormulario, parcial: Partial<DadosFormulario>, pessoa?: PessoaLigada): DadosFormulario {
  const seguinte = { ...dados, ...parcial };
  if (!pessoa || parcial.anonima === undefined || parcial.anonima === dados.anonima) return seguinte;
  if (parcial.anonima === false) return { ...seguinte, nome: pessoa.nome, email: pessoa.email };
  return { ...seguinte, nome: "", email: "", telefone: "", podemContactar: false };
}

/** A chave do rascunho: o de quem denuncia da página pública não se mistura com o de quem denuncia dentro da app. */
export const chaveRascunho = (organizationId: string, pessoa?: PessoaLigada): string =>
  pessoa ? `app:${organizationId}:${pessoa.id}` : "publico";
