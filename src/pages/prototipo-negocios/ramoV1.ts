// O ramo feat/v1 (16/10/2026): o protótipo é só o V1 do Ruben. A V2 e a V2 funcional (dos colegas) continuam nos ficheiros,
// para os merges do ramo partilhado (feat/negocios-prototipo) serem fáceis, mas não se veem: não há seletor de versão e
// "Pessoas numa página" vem ligada por defeito.
// Nos testes (vitest) o ramo comporta-se como o partilhado, para os testes dos colegas continuarem a valer sem lhes mexer;
// os testes do próprio ramo forçam-no com vi.mock("./ramoV1", () => ({ RAMO_V1: true })).
export const RAMO_V1: boolean = import.meta.env.MODE !== "test";
