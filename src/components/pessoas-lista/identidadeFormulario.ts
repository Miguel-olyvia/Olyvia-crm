// A regra do formulário de identidade da ficha real (empresa ou pessoa singular, como o separador «Empresa» / «Pessoa» de Clientes), sem NIF.
// Função pura: diz o que guardar, o que falta preencher, ou que nada mudou. As regras são as da função da base
// (neg_guardar_identidade_pessoa): uma empresa tem só o nome da empresa; uma pessoa tem nome próprio e apelido, os dois (ou nenhum, para manter).
import type { DadosIdentidade } from "@/hooks/pessoas/useGuardarIdentidadePessoa";

export type TipoIdentidade = "person" | "organization";

export interface IdentidadeAtual {
  nome: string;
  tipo: TipoIdentidade;
  /** O nome da empresa (só numa empresa). */
  empresaNome: string | null;
}

export interface FormularioIdentidade {
  tipo: TipoIdentidade;
  nomeEmpresa: string;
  nomeProprio: string;
  apelido: string;
}

export type PedidoIdentidade =
  | { estado: "guardar"; dados: DadosIdentidade }
  | { estado: "semAlteracao" }
  | { estado: "falta"; chaveErro: "errorCompany" | "errorPerson" };

/** Junta o espaço todo e apara (como a base o faz). */
export const compactar = (texto: string): string => texto.replace(/\s+/g, " ").trim();

/** O nome visível partido em nome próprio (a primeira palavra) e apelido (o resto): só serve de ponto de partida para editar. */
export function partirNome(nome: string): { nomeProprio: string; apelido: string } {
  const limpo = compactar(nome);
  const corte = limpo.indexOf(" ");
  return corte < 0 ? { nomeProprio: limpo, apelido: "" } : { nomeProprio: limpo.slice(0, corte), apelido: limpo.slice(corte + 1) };
}

/**
 * O nome visível tem três ou mais palavras: não se sabe onde acaba o nome próprio («Ana Maria» + «Silva» ou «Ana» + «Maria Silva»), por isso
 * a divisão de `partirNome` é um palpite e o formulário avisa. (Até a ficha devolver `first_name` e `last_name` da base.)
 */
export function nomeAmbiguo(nome: string): boolean {
  const limpo = compactar(nome);
  return limpo === "" ? false : limpo.split(" ").length >= 3;
}

/** Os valores com que o formulário abre: os da base (uma empresa abre sem nome próprio nem apelido: o nome dela não é de uma pessoa). */
export function formularioInicial(atual: IdentidadeAtual): FormularioIdentidade {
  const pessoa = atual.tipo === "person" ? partirNome(atual.nome) : { nomeProprio: "", apelido: "" };
  return { tipo: atual.tipo, nomeEmpresa: atual.tipo === "organization" ? atual.empresaNome ?? atual.nome : "", ...pessoa };
}

export function pedidoDeIdentidade(form: FormularioIdentidade, atual: IdentidadeAtual): PedidoIdentidade {
  if (form.tipo === "organization") {
    const nome = compactar(form.nomeEmpresa);
    if (nome === "") return { estado: "falta", chaveErro: "errorCompany" };
    if (atual.tipo === "organization" && nome === compactar(atual.empresaNome ?? atual.nome)) return { estado: "semAlteracao" };
    return { estado: "guardar", dados: { tipo: "organization", nomeEmpresa: nome } };
  }
  const nomeProprio = compactar(form.nomeProprio);
  const apelido = compactar(form.apelido);
  if (atual.tipo === "person") {
    const inicial = partirNome(atual.nome);
    if (nomeProprio === inicial.nomeProprio && apelido === inicial.apelido) return { estado: "semAlteracao" };
  }
  if (nomeProprio === "" || apelido === "") return { estado: "falta", chaveErro: "errorPerson" };
  return { estado: "guardar", dados: { tipo: "person", nomeProprio, apelido } };
}
