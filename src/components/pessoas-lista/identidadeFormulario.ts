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
  /** `first_name` e `last_name` da base (anew_entities), quando a ficha os devolve; só valem os dois juntos. */
  nomeProprio?: string | null;
  apelido?: string | null;
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
 * a divisão de `partirNome` é um palpite e o formulário avisa. (Só quando a base não tem `first_name` e `last_name`: ver `temNomeEmPartes`.)
 */
export function nomeAmbiguo(nome: string): boolean {
  const limpo = compactar(nome);
  return limpo === "" ? false : limpo.split(" ").length >= 3;
}

/** A base tem o nome em duas partes (os dois não vazios): usam-se tal como estão, sem palpite. */
export function temNomeEmPartes(atual: IdentidadeAtual): boolean {
  return compactar(atual.nomeProprio ?? "") !== "" && compactar(atual.apelido ?? "") !== "";
}

function partesDe(atual: IdentidadeAtual): { nomeProprio: string; apelido: string } {
  return temNomeEmPartes(atual)
    ? { nomeProprio: compactar(atual.nomeProprio ?? ""), apelido: compactar(atual.apelido ?? "") }
    : partirNome(atual.nome);
}

/** Os valores com que o formulário abre: os da base (uma empresa abre sem nome próprio nem apelido: o nome dela não é de uma pessoa). */
export function formularioInicial(atual: IdentidadeAtual): FormularioIdentidade {
  const pessoa = atual.tipo === "person" ? partesDe(atual) : { nomeProprio: "", apelido: "" };
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
    const inicial = partesDe(atual);
    if (nomeProprio === inicial.nomeProprio && apelido === inicial.apelido) return { estado: "semAlteracao" };
  }
  if (nomeProprio === "" || apelido === "") return { estado: "falta", chaveErro: "errorPerson" };
  return { estado: "guardar", dados: { tipo: "person", nomeProprio, apelido } };
}
