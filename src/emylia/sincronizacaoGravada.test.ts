// 20/11 (auditoria de 19/11): o fim da gravação só apaga a cópia local quando a base confirma que tem a transcrição (Sincronizador.gravada).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { Sincronizador } from "./sincronizacao";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Priv = any;
const negocio = { id: 7, f: { transcricao_chamada: "0:03 Cliente: olá" } };
function montar(): Priv {
  const s = new Sincronizador() as Priv;
  s.ligado = true;
  s.estadoFonte = { ler: () => ({ deals: [negocio] }), aplicar: () => undefined };
  s.fontes = [];
  s.mudou = vi.fn(); // o envio em si não interessa aqui: só o que já se sabe gravado
  return s;
}
const tem = (d: unknown) => (d as typeof negocio).f.transcricao_chamada === "0:03 Cliente: olá";

beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }));
afterEach(() => vi.useRealTimers());

describe("Sincronizador.gravada", () => {
  it("sem base ligada (o protótipo, os testes): o estado vive neste browser, confirma logo", async () => {
    expect(await new Sincronizador().gravada("deal:7", tem)).toBe(true);
  });

  it("confirma quando a base tem a parte igual à deste aparelho, com a transcrição", async () => {
    const s = montar();
    const p = s.gravada("deal:7", tem, 5000);
    await vi.advanceTimersByTimeAsync(600);
    s.json.set("deal:7", JSON.stringify(negocio)); // o envio acabou
    await vi.advanceTimersByTimeAsync(400);
    expect(await p).toBe(true);
    expect(s.mudou).toHaveBeenCalled();
  });

  it("sem rede (fica na fila, ou nunca chega): não confirma", async () => {
    const s = montar();
    s.json.set("deal:7", JSON.stringify(negocio));
    s.pendentes.set("deal:7", null);
    const p = s.gravada("deal:7", tem, 2000);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await p).toBe(false);
  });

  it("a base tem a parte, mas sem a transcrição (ex.: foi recusada e ficou a de lá): não confirma", async () => {
    const s = montar();
    s.json.set("deal:7", JSON.stringify(negocio));
    const p = s.gravada("deal:7", () => false, 1000);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await p).toBe(false);
  });
});
