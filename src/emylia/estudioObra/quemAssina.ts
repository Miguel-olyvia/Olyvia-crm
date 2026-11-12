// 12/11 (Rúben: «novas adendas a partir do estúdio da obra deve já vir assinado pela empresa»). Quem assina pela empresa as adendas que
// saem do Estúdio da obra: numa conta real, o nome de quem está ligado (o nome completo da conta, senão o email: lido pelo Estúdio, como a
// marca de água dos documentos); sem ele, o nome do papel (no protótipo, «Filipe Rocha» nas Operações). O motor lê-o ao enviar a adenda.
let quem = "";
export function definirQuemAssina(nome: string): void { quem = nome.trim(); }
export const lerQuemAssina = (): string => quem;
