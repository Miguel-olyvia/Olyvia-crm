// 17/11 (Rúben, teste no Estúdio): «ponho uma banheira na planta e depois digo "trocar a banheira por uma base de duche" — o sistema
//  não tira a banheira nem põe a base». A cadeia toda (pedidosDaConversa → aplicarPeca): a banheira sai do depois e a base entra por
//  colocar. Deve ser flexível: trocar uma peça por outra de tipo diferente.
import { describe, expect, it, vi } from "vitest";
import type { Fala } from "@/emylia/chamadaMotor";
import { pedidosDaConversa } from "./pedidosDaConversa";
import { aplicarPeca } from "./EstiloOuvido";
import { PROJETO_EXEMPLO } from "./exemploEstudio";
import type { Projeto } from "./necessidadesEstudio";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const fala = (texto: string): Fala => ({ inicio: 5, fim: 9, texto, falante: "cliente", confianca_falante: 1 });
const aplicar = (p: Projeto, frase: string): Projeto =>
  pedidosDaConversa([fala(frase)], "visita").pecas.reduce((acc, d) => aplicarPeca(acc, d.tipo, d.acao), p);

describe("trocar uma peça por outra por voz, no Estúdio", () => {
  it("«trocar a banheira por uma base de duche»: a banheira sai do depois e a base entra por colocar", () => {
    const p = aplicar(PROJETO_EXEMPLO, "Trocar a banheira por uma base de duche.");
    expect(p.depois.pecas.some((x) => x.tipo === "banheira")).toBe(false); // a banheira saiu
    expect((p.porColocar ?? []).some((c) => c.tipo === "base")).toBe(true); // a base entrou por colocar
  });

  it("«a banheira fica»: continua lá (não se mexe por engano)", () => {
    const p = aplicar(PROJETO_EXEMPLO, "A banheira fica.");
    expect(p.depois.pecas.some((x) => x.tipo === "banheira")).toBe(true);
    expect((p.porColocar ?? []).some((c) => c.tipo === "base")).toBe(false);
  });
});
