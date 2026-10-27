// O que os ecrãs da equipa (RH › Agenda e o bloco "Obra" na ficha da pessoa) recebem da moldura do protótipo: o Estado, as ações e como sair para a obra
// (Operações) ou para o negócio de uma visita. A moldura (PrototipoNegocios) passa-o ao RhPagina.
import type { Estado, acoes } from "../motor";

export interface EquipaCtx {
  S: Estado;
  A: ReturnType<typeof acoes>;
  run: (fn: () => void) => void;
  irObra: (id: number) => void;
  irNegocio: (id: number) => void;
}
