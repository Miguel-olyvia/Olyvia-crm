// Anonimização: a identidade de uma denúncia anónima não existe em lado nenhum; a de uma identificada só se mostra
// ao responsável do canal, depois de ele a pedir, e o pedido fica registado no histórico.
import type { Denuncia, EventoHistorico, Identidade } from "./tipos";

export type FormularioIdentidade = Partial<Identidade>;

/** O que se guarda da identidade: nada, se a denúncia é anónima, mesmo que o formulário tenha campos preenchidos. */
export function identidadeAGuardar(anonima: boolean, f: FormularioIdentidade): Identidade | null {
  if (anonima) return null;
  return {
    nome: (f.nome ?? "").trim(),
    email: (f.email ?? "").trim(),
    telefone: (f.telefone ?? "").trim(),
    podemContactar: f.podemContactar ?? false,
    soResponsavel: f.soResponsavel ?? true,
  };
}

/** A identidade que o ecrã pode mostrar. Anónima: nunca. Identificada: só depois de «Ver identidade». */
export function identidadeVisivel(d: Pick<Denuncia, "anonima" | "identidade">, revelada: boolean): Identidade | null {
  if (d.anonima || !d.identidade || !revelada) return null;
  return d.identidade;
}

export type EstadoIdentidade = "desconhecida" | "protegida" | "revelada";

export function estadoDaIdentidade(d: Pick<Denuncia, "anonima" | "identidade">, revelada: boolean): EstadoIdentidade {
  if (d.anonima || !d.identidade) return "desconhecida";
  return revelada ? "revelada" : "protegida";
}

/** Acrescenta ao histórico quem viu a identidade e quando. Numa denúncia anónima não há nada para ver: não regista. */
export function registarVerIdentidade(d: Denuncia, quem: string, em: string, idEvento: string): Denuncia {
  if (d.anonima || !d.identidade) return d;
  const evento: EventoHistorico = { id: idEvento, em, quem, acao: "identidade_vista" };
  return { ...d, historico: [...d.historico, evento] };
}
