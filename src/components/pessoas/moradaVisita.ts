// A morada de uma visita, em funções puras. A lead tem a morada que indicou (`Pessoa.morada`); a visita é nessa morada
// ("Na morada da lead") ou noutra ("Outra morada"), e é a da visita que passa a Morada da obra ao criar o negócio. Sem
// morada da lead só existe "Outra morada". Nada aqui lê o relógio nem importa componentes.
import type { VisitaNegocio } from "@/components/negocio-metas/negocioMetas";
import type { MoradaVisita, Pessoa } from "./pessoasTipos";

export const MORADA_VISITA_VAZIA: MoradaVisita = { rua: "", codigoPostal: "", localidade: "", andar: "" };

/** O máximo de caracteres da nota de acesso. */
export const MAX_NOTA_ACESSO = 140;

const FORMATO_CODIGO_POSTAL = /^\d{4}-\d{3}$/;

/** O que se escolhe no formulário: a morada da lead, ou outra (com a sua nota de acesso). */
export interface DestinoVisita {
  igualALead: boolean;
  outra: MoradaVisita;
  notaAcesso: string;
}

export type ErroMoradaVisita = "ruaVazia" | "codigoPostalInvalido" | "notaAcessoComprida";

/** A morada que a lead indicou, no formato da visita; `null` se a ficha não tem nenhuma. */
export function moradaDaLead(pessoa: Pick<Pessoa, "morada">): MoradaVisita | null {
  const m = pessoa.morada;
  if (!m) return null;
  const morada = { rua: m.linha.trim(), codigoPostal: m.cp.trim(), localidade: m.localidade.trim(), andar: "" };
  return morada.rua || morada.codigoPostal || morada.localidade ? morada : null;
}

/** A escolha de partida: a morada da lead, se a tiver; senão "Outra morada" vazia. */
export const destinoInicial = (moradaLead: MoradaVisita | null): DestinoVisita => ({
  igualALead: moradaLead !== null, outra: MORADA_VISITA_VAZIA, notaAcesso: "",
});

/** A escolha de partida de uma visita que já existe: a da própria visita (a morada da lead só conta se a ficha ainda a tiver). */
export function destinoDaVisita(visita: Pick<VisitaNegocio, "igualALead" | "morada" | "nota">, temMoradaLead: boolean): DestinoVisita {
  const naLead = visita.igualALead === true && temMoradaLead;
  return { igualALead: naLead, outra: naLead ? MORADA_VISITA_VAZIA : { ...visita.morada }, notaAcesso: visita.nota };
}

/** A visita só pode ser "na morada da lead" se a lead tiver uma. */
const ehNaMoradaDaLead = (d: DestinoVisita, moradaLead: MoradaVisita | null): boolean => d.igualALead && moradaLead !== null;

/** O primeiro erro de "Outra morada" (a rua é obrigatória, o código postal é 0000-000 e a nota tem um máximo); `null` = válido. */
export function validarDestino(d: DestinoVisita, moradaLead: MoradaVisita | null): ErroMoradaVisita | null {
  if (ehNaMoradaDaLead(d, moradaLead)) return null;
  if (d.outra.rua.trim() === "") return "ruaVazia";
  const cp = d.outra.codigoPostal.trim();
  if (cp !== "" && !FORMATO_CODIGO_POSTAL.test(cp)) return "codigoPostalInvalido";
  return d.notaAcesso.trim().length > MAX_NOTA_ACESSO ? "notaAcessoComprida" : null;
}

export interface DestinoResolvido {
  igualALead: boolean;
  moradaVisita: MoradaVisita;
  notaAcesso?: string;
}

/** O que fica guardado na visita: a morada da lead (igual), ou a outra, aparada e com a nota de acesso. */
export function resolverDestino(d: DestinoVisita, moradaLead: MoradaVisita | null): DestinoResolvido {
  if (moradaLead !== null && d.igualALead) return { igualALead: true, moradaVisita: moradaLead };
  const o = d.outra;
  const nota = d.notaAcesso.trim();
  return {
    igualALead: false,
    moradaVisita: { rua: o.rua.trim(), codigoPostal: o.codigoPostal.trim(), localidade: o.localidade.trim(), andar: o.andar.trim() },
    ...(nota ? { notaAcesso: nota } : {}),
  };
}

/** A morada numa linha: "Rua X 12, 3.º Esq., 1000-001 Lisboa" (sem vírgulas soltas). */
export function textoMoradaVisita(m: MoradaVisita): string {
  return [m.rua, m.andar, [m.codigoPostal, m.localidade].filter(Boolean).join(" ")].map((s) => s.trim()).filter(Boolean).join(", ");
}
