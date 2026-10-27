// Campos da lista e da ficha de Pessoas que se derivam dos toques e das interações: o formulário por onde a pessoa entrou, o resultado do último contacto
// e o aviso "Voltou a contactar". Funções puras e determinísticas: nada aqui escreve no Estado, e o aviso não se escreve à mão, deriva-se.
import type { Estado } from "./motor";
import type { PessoaApp } from "./pessoasDocs";
import { toquesDe } from "./toquesDocs";
import { EMAIL_AUTOMATICO, minutosAtras, type Perfil } from "./perfilDocs";

/** O que a coluna Formulário diz quando a pessoa não entrou por nenhum formulário. */
export const SEM_FORMULARIO = "Registada à mão";
/** O que o selo do último contacto diz quando ninguém ligou à pessoa. */
export const SEM_CONTACTO = "Sem contacto";

/** O formulário por onde a pessoa entrou (o do primeiro toque), ou "Registada à mão" quando a entrada foi registada pela equipa. A campanha fica só na ficha. */
export function formularioDe(S: Estado, p: PessoaApp): string {
  return toquesDe(S, p.nome)[0]?.formulario ?? SEM_FORMULARIO;
}

/** O resultado da última chamada (Atendeu · interessado, Não atendeu...), vindo das interações da pessoa (a mais recente primeiro); "Sem contacto" se não houve nenhuma chamada. */
export function resultadoContacto(f: Pick<Perfil, "interacoes">): string {
  return f.interacoes.find((i) => i.tipo === "chamada")?.detalhe ?? SEM_CONTACTO;
}

/** "Voltou a contactar": a lead que já existia voltou a preencher o formulário e ninguém lhe respondeu. É verdade quando há um toque online de uma pessoa já existente
 *  (estado "Associada à ficha") depois do último contacto da equipa, ou sem nenhum contacto da equipa (o email de boas-vindas é automático, não conta).
 *  Desaparece sozinho quando alguém regista um contacto. Só as leads em curso têm. */
export function voltouAContactar(S: Estado, p: PessoaApp, f: Pick<Perfil, "interacoes">): boolean {
  if (p.papel !== "lead" || p.perdida !== null) return false;
  const contacto = f.interacoes.find((i) => i.titulo !== EMAIL_AUTOMATICO);
  return toquesDe(S, p.nome).some((t) => t.via === "online" && t.estado === "associada" && (!contacto || minutosAtras(t.data) < minutosAtras(contacto.q)));
}
