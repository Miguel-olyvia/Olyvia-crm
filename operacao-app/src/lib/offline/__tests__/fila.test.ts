import { afterEach, describe, expect, it, vi } from "vitest";
import { armazemEmMemoria } from "../armazem";
import { Fila, ehErroDeRede, type AcaoOffline, type NovaAcao } from "../fila";

const REDE = new Error("TypeError: Failed to fetch");
const acao = (chave: string, rotulo: string, tipo: NovaAcao["tipo"] = "obra_iniciar"): NovaAcao => ({
  tipo,
  chave,
  args: { tarefaId: chave },
  rotulo,
});

function comRede(online: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
}

afterEach(() => comRede(true));

describe("ehErroDeRede", () => {
  it("separa a falta de rede de uma recusa da base", () => {
    expect(ehErroDeRede(REDE, true)).toBe(true);
    expect(ehErroDeRede(new Error("Load failed"), true)).toBe(true);
    expect(ehErroDeRede(new Error("Esta tarefa já está feita."), true)).toBe(false);
    expect(ehErroDeRede(new Error("Esta tarefa já está feita."), false)).toBe(true);
  });
});

describe("Fila — ordem", () => {
  it("envia pela ordem em que se fez, e esvazia", async () => {
    const enviadas: string[] = [];
    const f = new Fila(armazemEmMemoria(), async (a) => {
      enviadas.push(a.rotulo);
    });
    await f.acrescentar({ ...acao("t1", "iniciar t1"), criadaEm: "2026-10-06T10:00:00.000Z" });
    await f.acrescentar({ ...acao("t1", "terminar t1", "obra_concluir"), criadaEm: "2026-10-06T11:00:00.000Z" });
    await f.acrescentar({ ...acao("t2", "iniciar t2"), criadaEm: "2026-10-06T10:30:00.000Z" });
    const r = await f.processar();
    expect(enviadas).toEqual(["iniciar t1", "iniciar t2", "terminar t1"]);
    expect(r).toEqual({ enviadas: 3, conflitos: 0, porEnviar: 0, semRede: false });
  });

  it("ações feitas no mesmo instante mantêm a ordem em que entraram", async () => {
    const enviadas: string[] = [];
    const f = new Fila(armazemEmMemoria(), async (a) => void enviadas.push(a.rotulo));
    const t = "2026-10-06T10:00:00.000Z";
    await f.acrescentar({ ...acao("t1", "a"), criadaEm: t });
    await f.acrescentar({ ...acao("t1", "b"), criadaEm: t });
    await f.acrescentar({ ...acao("t1", "c"), criadaEm: t });
    await f.processar();
    expect(enviadas).toEqual(["a", "b", "c"]);
  });
});

describe("Fila — sem rede, e a mesma ação uma vez só", () => {
  it("um erro de rede pára o envio e deixa tudo na fila, tal como estava", async () => {
    const exec = vi.fn().mockRejectedValue(REDE);
    const f = new Fila(armazemEmMemoria(), exec);
    await f.acrescentar(acao("t1", "a"));
    await f.acrescentar(acao("t2", "b"));
    const r = await f.processar();
    expect(r.semRede).toBe(true);
    expect(r.porEnviar).toBe(2);
    expect(exec).toHaveBeenCalledTimes(1); // não tentou o resto
    const [a] = await f.listar();
    expect(a.estado).toBe("pendente");
    expect(a.tentativas).toBe(0);
  });

  it("quando a rede volta, envia cada ação uma vez, com o mesmo id", async () => {
    let rede = false;
    const ids: string[] = [];
    const f = new Fila(armazemEmMemoria(), async (a) => {
      if (!rede) throw REDE;
      ids.push(a.id);
    });
    const a = await f.acrescentar(acao("t1", "a"));
    await f.processar();
    rede = true;
    await f.processar();
    await f.processar();
    expect(ids).toEqual([a.id]);
    expect(await f.listar()).toEqual([]);
  });

  it("dois envios ao mesmo tempo não mandam a mesma ação duas vezes", async () => {
    let n = 0;
    const f = new Fila(armazemEmMemoria(), async () => {
      n++;
      await new Promise((r) => setTimeout(r, 5));
    });
    await f.acrescentar(acao("t1", "a"));
    await Promise.all([f.processar(), f.processar(), f.processar()]);
    expect(n).toBe(1);
  });
});

describe("Fila — a base recusa", () => {
  it("marca com a mensagem da base, prende as seguintes da mesma tarefa e segue com as outras", async () => {
    const enviadas: string[] = [];
    const f = new Fila(armazemEmMemoria(), async (a: AcaoOffline) => {
      if (a.rotulo === "iniciar t1") throw new Error("Esta tarefa depende de «Demolir», que ainda não está feita.");
      enviadas.push(a.rotulo);
    });
    await f.acrescentar({ ...acao("t1", "iniciar t1"), criadaEm: "2026-10-06T10:00:00.000Z" });
    await f.acrescentar({ ...acao("t1", "terminar t1", "obra_concluir"), criadaEm: "2026-10-06T11:00:00.000Z" });
    await f.acrescentar({ ...acao("t2", "iniciar t2"), criadaEm: "2026-10-06T12:00:00.000Z" });
    const r = await f.processar();
    expect(enviadas).toEqual(["iniciar t2"]);
    expect(r.conflitos).toBe(1);
    const [recusada, presa] = await f.listar();
    expect(recusada.estado).toBe("conflito");
    expect(recusada.erro).toContain("depende de");
    expect(presa.rotulo).toBe("terminar t1");
    expect(presa.estado).toBe("pendente"); // não se perdeu, à espera

    // Enviar outra vez não mexe na recusada nem na que está presa atrás dela.
    await f.processar();
    expect(enviadas).toEqual(["iniciar t2"]);
  });

  it("tentar outra vez reenvia; descartar tira da fila", async () => {
    let aceita = false;
    const f = new Fila(armazemEmMemoria(), async () => {
      if (!aceita) throw new Error("Já tens «Pintar» a correr.");
    });
    const a = await f.acrescentar(acao("t1", "a"));
    const b = await f.acrescentar(acao("t2", "b"));
    await f.processar();
    expect((await f.listar()).every((x) => x.estado === "conflito")).toBe(true);
    aceita = true;
    await f.tentarOutraVez(a.id);
    await f.processar();
    expect((await f.listar()).map((x) => x.id)).toEqual([b.id]);
    await f.descartar(b.id);
    expect(await f.listar()).toEqual([]);
  });
});

describe("Fila — executarOuGuardar", () => {
  it("com rede envia já e não guarda nada", async () => {
    const f = new Fila(armazemEmMemoria(), async () => ({ ok: true }));
    const r = await f.executarOuGuardar(acao("t1", "a"));
    expect(r).toEqual({ guardada: false, valor: { ok: true } });
    expect(await f.listar()).toEqual([]);
  });

  it("uma recusa da base volta para o ecrã e não fica na fila", async () => {
    const f = new Fila(armazemEmMemoria(), async () => {
      throw new Error("Justificação obrigatória: 95 min reais para 60 previstos.");
    });
    await expect(f.executarOuGuardar(acao("t1", "a"))).rejects.toThrow("Justificação obrigatória");
    expect(await f.listar()).toEqual([]);
  });

  it("a rede cai a meio: guarda com o MESMO id (a base reconhece-o se já lá chegou)", async () => {
    const ids: string[] = [];
    const f = new Fila(armazemEmMemoria(), async (a) => {
      ids.push(a.id);
      throw REDE;
    });
    const r = await f.executarOuGuardar({ ...acao("t1", "a"), id: "id-do-telemovel" });
    expect(r.guardada).toBe(true);
    const [g] = await f.listar();
    expect(g.id).toBe("id-do-telemovel");
    expect(ids).toEqual(["id-do-telemovel"]);
  });

  it("sem rede nem tenta: guarda logo", async () => {
    comRede(false);
    const exec = vi.fn();
    const f = new Fila(armazemEmMemoria(), exec);
    const r = await f.executarOuGuardar(acao("t1", "a"));
    expect(r.guardada).toBe(true);
    expect(exec).not.toHaveBeenCalled();
  });

  it("com coisas da mesma tarefa por enviar, vai para trás delas (não passa à frente)", async () => {
    const exec = vi.fn().mockResolvedValue({ ok: true });
    const f = new Fila(armazemEmMemoria(), exec);
    await f.acrescentar(acao("t1", "iniciar t1"));
    const r = await f.executarOuGuardar(acao("t1", "terminar t1", "obra_concluir"));
    expect(r.guardada).toBe(true);
    expect(exec).not.toHaveBeenCalled();
    expect((await f.listar()).map((x) => x.rotulo)).toEqual(["iniciar t1", "terminar t1"]);
  });

  it("guarda a foto (Blob) com a ação", async () => {
    comRede(false);
    const f = new Fila(armazemEmMemoria(), vi.fn());
    const foto = new Blob(["x"], { type: "image/jpeg" });
    await f.executarOuGuardar({ ...acao("foto:1", "foto", "obra_foto"), ficheiro: foto });
    const [g] = await f.listar();
    expect(g.ficheiro).toBe(foto);
  });
});
