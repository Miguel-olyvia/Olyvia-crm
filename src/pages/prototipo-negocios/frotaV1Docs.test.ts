import { beforeEach, describe, expect, it } from "vitest";
import { gravarIdentificar } from "./frota/acoes";
import { esquecerFrota, executar, lerFrota } from "./frota/loja";
import { fichaViatura, linhasViaturas, tarefasFrota } from "./frotaV1Docs";

beforeEach(() => { localStorage.clear(); esquecerFrota(); });

describe("Frota no V1", () => {
  it("as tarefas vêm por urgência, cada uma com a sua ação e um botão no infinitivo", () => {
    const T = tarefasFrota(lerFrota());
    expect(T.length).toBeGreaterThan(0);
    const urg = T.map((t) => t.urgente);
    expect(urg).toEqual([...urg].sort((a, b) => Number(b) - Number(a)));
    for (const t of T) { expect(t.btn).toMatch(/^(Renovar|Marcar|Dar|Identificar)/); expect(t.sub.length).toBeGreaterThan(0); }
    console.info(T.map((t) => `${t.urgente ? "!" : " "} ${t.viatura} — ${t.t} — ${t.sub}`).join("\n"));
  });

  it("as multas por identificar viram tarefas; identificada, a tarefa sai", () => {
    const antes = tarefasFrota(lerFrota()).filter((t) => t.acao.tipo === "identificar");
    expect(antes.length).toBeGreaterThan(0);
    const t = antes[0];
    const r = executar((F) => gravarIdentificar(F, { o: (t.acao as { oid: string }).oid, pid: lerFrota().pessoas[0].id }));
    expect(r.ok).toBe(true);
    expect(tarefasFrota(lerFrota()).some((x) => x.id === t.id)).toBe(false);
  });

  it("cada viatura ativa tem uma linha e uma ficha", () => {
    const F = lerFrota(), L = linhasViaturas(F);
    expect(L.length).toBeGreaterThan(0);
    for (const l of L) { const f = fichaViatura(F, l.vid)!; expect(f.datas.map((d) => d.rotulo)).toEqual(["Seguro", "Inspeção (IPO)", "IUC", "Revisão"]); }
  });
});
