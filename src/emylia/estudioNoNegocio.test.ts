// 23/11 (testarh, negócio 1015): «Trazer do Estúdio» repunha as medidas da área com as da planta, por cima das escritas à mão no negócio.
import { describe, expect, it, vi } from "vitest";
import { seed, type Negocio } from "./motor";
import { retangulo } from "./planta";
import { lerCatalogo } from "./v2/catalogoStore";
import { simularNoNegocio } from "./estudioNoNegocio";
import { medidasDoEstudio } from "@/pages/prototipo-estudio/daVisita";
import type { Projeto } from "@/pages/prototipo-estudio/necessidadesEstudio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const planta = (w: number, h: number) => ({ o: { x: 50, y: 50 }, paredes: retangulo(w, h), pecas: [] });
const projeto = (w = 200, h = 250): Projeto => ({
  negocio: 1, antes: planta(w, h),
  depois: { ...planta(w, h), pecas: [{ id: "s", tipo: "sanita", x: 100, y: 100, w: 36, h: 52 }] },
  escolhas: { s: "san-nexo-s" }, acompanha: {}, revestimento: "rev-tela-c", alturas: { peDireito: 250, tetoFalso: null },
  estilo: { cores: [], porCategoria: {} }, ajustes: {},
});
const visita = () => { const S = seed(); return { S, d: S.deals.find((x) => x.linha === "wc" && x.fase === 2)! as Negocio }; };
const K = () => lerCatalogo().produtos ?? [];

describe("as medidas da área ao trazer do Estúdio", () => {
  it("vazias: entram as da planta", () => {
    const { S, d } = visita();
    d.visita.med.pav = 0; d.visita.med.par = 0;
    const m = medidasDoEstudio(projeto());
    const { d: d1, levado } = simularNoNegocio(d, projeto(), S, K());
    expect(d1.visita.med.pav).toBe(m.pav);
    expect(d1.visita.med.par).toBe(m.par);
    expect(levado.avisos).toContain("As medidas da área saíram da planta.");
  });

  it("escritas à mão (3 e 15 m²): ficam, e o aviso diz o que a planta dá", () => {
    const { S, d } = visita();
    d.visita.med.pav = 3; d.visita.med.par = 15;
    const m = medidasDoEstudio(projeto());
    expect(m.pav).not.toBe(3);
    const { d: d1, levado } = simularNoNegocio(d, projeto(), S, K());
    expect(d1.visita.med.pav).toBe(3);
    expect(d1.visita.med.par).toBe(15);
    expect(levado.avisos.join(" ")).toMatch(/As medidas escritas no negócio ficaram: pavimento 3 \(a planta dá [\d,]+\), paredes 15/);
    // o Estúdio guarda o que a planta deu, para a próxima vez
    expect(JSON.parse(d1.f.estudio_levado).m).toMatchObject({ pav: m.pav, par: m.par });
  });

  it("as que o Estúdio lá pôs acompanham a planta nova; mudadas à mão depois, ficam", () => {
    const { S, d } = visita();
    d.visita.med.pav = 0; d.visita.med.par = 0;
    const { d: d1 } = simularNoNegocio(d, projeto(), S, K());
    // a planta muda no Estúdio: as medidas que vieram dele mudam também
    const m2 = medidasDoEstudio(projeto(300, 250));
    const { d: d2 } = simularNoNegocio(d1, projeto(300, 250), S, K());
    expect(d2.visita.med.pav).toBe(m2.pav);
    expect(d2.visita.med.par).toBe(m2.par);
    // escreve-se o pavimento à mão: a volta seguinte do Estúdio já não lhe toca (as paredes, que vieram do Estúdio, seguem a planta)
    d2.visita.med.pav = 7;
    const m3 = medidasDoEstudio(projeto(200, 200));
    const { d: d3, levado } = simularNoNegocio(d2, projeto(200, 200), S, K());
    expect(d3.visita.med.pav).toBe(7);
    expect(d3.visita.med.par).toBe(m3.par);
    expect(levado.avisos.join(" ")).toMatch(/pavimento 7/);
  });
});

describe("28/11: a casa toda (várias áreas, cada uma com o seu Estúdio)", () => {
  it("as medidas e os produtos somam as áreas; a planta vai para a da área do projeto", () => {
    const { S, d } = visita();
    d.visita.med.pav = 0; d.visita.med.par = 0;
    d.f.diag_tipo_area = "Casa de banho, Casa de banho suite";
    d.f.diag_div_principal = "Casa de banho";
    const wc = projeto(200, 250);
    d.f.estudio = JSON.stringify(wc);
    const suite = { ...projeto(300, 200), area: { nome: "Casa de banho suite", prefixo: "div_casadebanhosuite_" } };
    const { d: d1 } = simularNoNegocio(d, suite, S, K());
    const a = medidasDoEstudio(wc), b = medidasDoEstudio(suite);
    expect(d1.visita.med.pav).toBeCloseTo((a.pav ?? 0) + (b.pav ?? 0), 2);
    expect(d1.f.div_casadebanhosuite_planta).toBeTruthy();
    expect(d1.f.planta).toBe(d.f.planta);
    // a sanita das duas: 2
    const san = (d1.visita.prod ?? []).find((x) => x.id === "san-nexo-s");
    if (san) expect(san.q).toBe(2);
  });

  it("com uma só área, fica como sempre", () => {
    const { S, d } = visita();
    d.visita.med.pav = 0;
    const { d: d1 } = simularNoNegocio(d, projeto(), S, K());
    expect(d1.visita.med.pav).toBe(medidasDoEstudio(projeto()).pav);
  });
});
