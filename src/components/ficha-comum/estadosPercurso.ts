// O estado de cada passo do percurso de uma lead. Função pura.
export type EstadoPasso = "feito" | "atual" | "porFazer" | "perdido" | "foraAlcance";

/**
 * O estado de cada um dos `total` passos. `atual` é o índice do passo em curso; `perdidaEm`, se existir, o do passo onde
 * a lead se perdeu (os anteriores ficam feitos e os seguintes fora de alcance); `concluido` marca todos como feitos (cliente).
 */
export function estadosPercurso(total: number, atual: number, perdidaEm: number | null, concluido: boolean): EstadoPasso[] {
  return Array.from({ length: total }, (_, i): EstadoPasso => {
    if (concluido) return "feito";
    if (perdidaEm !== null) return i < perdidaEm ? "feito" : i === perdidaEm ? "perdido" : "foraAlcance";
    return i < atual ? "feito" : i === atual ? "atual" : "porFazer";
  });
}
