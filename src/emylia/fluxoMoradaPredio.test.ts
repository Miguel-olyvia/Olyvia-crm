// 16/11 (Rúben, teste live do fluxo): duas melhorias de fricção na Visita.
//  1. O código postal entra na «Morada da obra» (opcional), para a verificação de viagem deixar de dizer «falta a morada completa».
//  2. Os campos do prédio (elevador, andares, andar da fração, frações por andar) só se pedem num «Andar»: numa moradia não fazem
//     sentido nem contam como obrigatórios.
import { describe, expect, it } from "vitest";
import { CONTACTO, EXTERIOR, emFalta } from "./campos";

const predio = ["tem_elevador", "n_andares", "andar", "n_fracoes_por_andar"];
const faltam = (f: Record<string, string>) => emFalta([EXTERIOR], f).map((c) => c.k);

describe("16/11: a Morada da obra e os campos do prédio", () => {
  it("o código postal é um campo da Morada da obra, opcional (não trava quem não o sabe)", () => {
    const morada = CONTACTO.find((g) => g.titulo === "Morada da obra")!;
    const cp = morada.campos.find((c) => c.k === "cp");
    expect(cp).toMatchObject({ l: "Código postal", opcional: true });
    // opcional: nunca aparece como obrigatório em falta
    expect(emFalta([morada], {}).map((c) => c.k)).not.toContain("cp");
  });

  it("numa moradia, os campos do prédio não se pedem (nem contam como em falta)", () => {
    const falta = faltam({ imovel: "Moradia" });
    for (const k of predio) expect(falta).not.toContain(k);
  });

  it("num andar, os campos do prédio continuam obrigatórios", () => {
    const falta = faltam({ imovel: "Andar" });
    for (const k of predio) expect(falta).toContain(k);
  });

  it("enquanto não se escolheu moradia ou andar, os campos do prédio ainda aparecem (comportamento seguro de sempre)", () => {
    const falta = faltam({});
    for (const k of predio) expect(falta).toContain(k);
  });
});
