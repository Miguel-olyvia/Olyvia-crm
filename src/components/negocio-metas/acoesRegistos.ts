// As ações sobre os registos da pessoa, em funções puras e imutáveis: ligar um registo a um negócio (só a um), desfazer a ligação
// enquanto o negócio está aberto, e ler os registos de uma pessoa ou de um negócio. Uma ação que não se aplica devolve o
// PRÓPRIO estado (o mesmo objeto), para quem chama poder comparar com `===`.
import type { EstadoRegistos, RefRegisto, RegistosDaPessoa, TipoRegisto } from "./registosTipos";

type ComLigacao = { id: string; negocioId: string | null };

const CHAVE: Record<TipoRegisto, "contactos" | "visitas" | "levantamentos"> = {
  contacto: "contactos", visita: "visitas", levantamento: "levantamentos",
};

const registoDaRef = (estado: EstadoRegistos, ref: RefRegisto): ComLigacao | undefined =>
  (estado[CHAVE[ref.tipo]] as readonly ComLigacao[]).find((r) => r.id === ref.id);

/** Escreve o `negocioId` num só registo; o resto do estado fica com os mesmos objetos. */
function escrever(estado: EstadoRegistos, ref: RefRegisto, negocioId: string | null): EstadoRegistos {
  const chave = CHAVE[ref.tipo];
  const lista = (estado[chave] as readonly ComLigacao[]).map((r) => (r.id === ref.id ? { ...r, negocioId } : r));
  return { ...estado, [chave]: lista };
}

/** O registo existe e está livre, ou já é deste negócio. Nunca se liga a um registo de outro negócio. */
export function podeLigar(estado: EstadoRegistos, ref: RefRegisto, negocioId: string): boolean {
  if (negocioId === "") return false;
  const registo = registoDaRef(estado, ref);
  return registo !== undefined && (registo.negocioId === null || registo.negocioId === negocioId);
}

/** Liga um registo a um negócio. Recusa (devolve o mesmo estado) um registo que não existe ou que já está ligado a OUTRO negócio. */
export function ligarAoNegocio(estado: EstadoRegistos, ref: RefRegisto, negocioId: string): EstadoRegistos {
  if (!podeLigar(estado, ref, negocioId)) return estado;
  if (registoDaRef(estado, ref)?.negocioId === negocioId) return estado;
  return escrever(estado, ref, negocioId);
}

/** Liga vários registos; os recusados voltam à parte, para a interface os dizer. */
export function ligarRegistos(
  estado: EstadoRegistos, refs: readonly RefRegisto[], negocioId: string,
): { estado: EstadoRegistos; recusados: RefRegisto[] } {
  return refs.reduce<{ estado: EstadoRegistos; recusados: RefRegisto[] }>(
    (acc, ref) => (podeLigar(acc.estado, ref, negocioId)
      ? { ...acc, estado: ligarAoNegocio(acc.estado, ref, negocioId) }
      : { ...acc, recusados: [...acc.recusados, ref] }),
    { estado, recusados: [] },
  );
}

/**
 * Desfaz a ligação de um registo ao negócio. Só vale com o negócio aberto (`negocioAberto`) e para um registo que está mesmo ligado
 * a esse negócio; senão devolve o mesmo estado.
 */
export function desligarDoNegocio(estado: EstadoRegistos, ref: RefRegisto, negocioId: string, negocioAberto: boolean): EstadoRegistos {
  if (!negocioAberto || registoDaRef(estado, ref)?.negocioId !== negocioId) return estado;
  return escrever(estado, ref, null);
}

/** Os registos de uma pessoa, por tipo. */
export const registosDaPessoa = (estado: EstadoRegistos, pessoaId: string): RegistosDaPessoa => ({
  contactos: estado.contactos.filter((r) => r.pessoaId === pessoaId),
  visitas: estado.visitas.filter((r) => r.pessoaId === pessoaId),
  levantamentos: estado.levantamentos.filter((r) => r.pessoaId === pessoaId),
});

/** Os registos de uma pessoa que não estão ligados a nenhum negócio. Uma visita cancelada não se oferece para ligar. */
export const registosPorLigar = (estado: EstadoRegistos, pessoaId: string): RegistosDaPessoa => {
  const dela = registosDaPessoa(estado, pessoaId);
  return {
    contactos: dela.contactos.filter((r) => r.negocioId === null),
    visitas: dela.visitas.filter((r) => r.negocioId === null && r.estado !== "cancelada"),
    levantamentos: dela.levantamentos.filter((r) => r.negocioId === null),
  };
};

/** Os registos ligados a um negócio. */
export const registosDoNegocio = (estado: EstadoRegistos, negocioId: string): RegistosDaPessoa => ({
  contactos: estado.contactos.filter((r) => r.negocioId === negocioId),
  visitas: estado.visitas.filter((r) => r.negocioId === negocioId),
  levantamentos: estado.levantamentos.filter((r) => r.negocioId === negocioId),
});

/** Quantos registos há, somando os três tipos. */
export const totalDeRegistos = (r: RegistosDaPessoa): number => r.contactos.length + r.visitas.length + r.levantamentos.length;
