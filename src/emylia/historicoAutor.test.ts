import { describe, expect, it } from "vitest";
import { marcarAutor, quandoEQuem, type Evento, type Negocio } from "./motor";

// 3/11 (Rúben): no histórico, o nome de quem fez a alteração
describe("quem fez cada entrada do histórico", () => {
  const neg = (hist: Evento[]) => ({ hist }) as unknown as Negocio;

  it("as entradas novas ficam com o nome de quem entrou; as lidas da base (com ou sem nome) não se tocam", () => {
    const d = neg([
      { t: "Chamada registada", q: "hoje 15:21", k: "a" },
      { t: "Passou a Contacto", q: "hoje 15:20", k: "a", quem: "Carla Sousa" },
      { t: "Negócio criado à mão", q: "hoje 15:19", k: "a", quem: "" },
    ]);
    marcarAutor([d], "Rúben Carvalho");
    expect(d.hist.map((h) => h.quem)).toEqual(["Rúben Carvalho", "Carla Sousa", ""]);
  });

  it("mostra «hoje 15:21 · Nome», e só a hora quando não há nome", () => {
    expect(quandoEQuem({ t: "x", q: "hoje 15:21", k: "a", quem: "Rúben Carvalho" })).toBe("hoje 15:21 · Rúben Carvalho");
    expect(quandoEQuem({ t: "x", q: "hoje 15:21", k: "a", quem: "" })).toBe("hoje 15:21");
    expect(quandoEQuem({ t: "x", q: "hoje 15:21", k: "a" })).toBe("hoje 15:21");
  });
});
