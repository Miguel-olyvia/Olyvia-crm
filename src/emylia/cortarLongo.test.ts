// 20/11 (Rúben: «a gravação quebrou passado 2 minutos»; o perfil do Chrome mostrou 75 s seguidos dentro do corte das falas longas):
// uma fala de mais de 20 s com o início em silêncio fazia o corte ficar sempre no mesmo sítio e o ciclo nunca acabava.
import { describe, expect, it, vi } from "vitest";
vi.mock("./chamadaNuvem", async (importOriginal) => ({ ...(await importOriginal<typeof import("./chamadaNuvem")>()) }));
import { cortarLongo } from "./gravador";

const TAXA = 16000;
/** `s` segundos de som; os primeiros `silencio` segundos em silêncio absoluto (o que a supressão de ruído dá numa chamada). */
function audio(s: number, silencio = 0): Float32Array {
  const x = new Float32Array(Math.round(s * TAXA));
  for (let i = Math.round(silencio * TAXA); i < x.length; i++) x[i] = Math.sin(i / 7) * 0.3;
  return x;
}
const segundosDe = (p: { pcm: Float32Array }) => p.pcm.length / TAXA;

describe("cortarLongo: as falas longas cortam-se e o ciclo acaba sempre", () => {
  it("47 s com o início em silêncio: acaba, pedaços de até 20 s, cada corte avança", () => {
    const partes = cortarLongo(audio(47, 1));
    expect(partes.length).toBeGreaterThanOrEqual(3);
    expect(partes.length).toBeLessThanOrEqual(4);
    for (const p of partes) expect(segundosDe(p)).toBeLessThanOrEqual(20);
    for (const p of partes.slice(0, -1)) expect(segundosDe(p)).toBeGreaterThanOrEqual(14);
    expect(partes.reduce((s, p) => s + p.pcm.length, 0)).toBe(Math.round(47 * TAXA));
    for (let i = 1; i < partes.length; i++) expect(partes[i].desvioS).toBeGreaterThan(partes[i - 1].desvioS);
  });
  it("só silêncio (2 minutos): acaba e corta em pedaços de até 20 s", () => {
    const partes = cortarLongo(new Float32Array(120 * TAXA));
    expect(partes.length).toBeGreaterThanOrEqual(6);
    for (const p of partes) expect(segundosDe(p)).toBeLessThanOrEqual(20);
  });
  it("até 20 s fica inteira", () => {
    expect(cortarLongo(audio(19))).toHaveLength(1);
  });
});
