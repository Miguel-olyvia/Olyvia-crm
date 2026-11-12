// 04/11/2026: «Enviar proposta» e «Enviar o contrato» / «Gerar o contrato» (o botão do passo) pedem também a permissão REAL de quem
// está ligado, a de create-client-portal-access: proposta → portal.manage OU negocios.proposta.enviar (fn_cat_pode); contrato →
// portal.manage OU client_contracts.send_signature. Sem ela, desligado com o motivo; com ela, faz o passo como antes. A permissão do
// «A ver como» continua a valer à parte (permissoesLoteC.test.tsx).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({ perms: new Set<string>(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => m.rpc(...a) } }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-1" } }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: (c: string) => m.perms.has(c), loading: false }) }));

import { acoes, proximo, seed, type Estado, type Negocio } from "./motor";
import { definirModoReal } from "./acessosPortal";
import { BotaoFase } from "./PaginaNegocio";
import { PermPortalNegocios } from "./PermPortalNegocios";
import { ComPermPortalDoPasso, documentoDoPasso } from "./permPortalPasso";
import type { Ctx } from "./pecas";

/** O negócio 1031 com o passo `act` à frente: «enviar» (proposta por enviar) ou «enviarContrato» (proposta aceite). */
function montar(act: "enviar" | "enviarContrato") {
  const S: Estado = seed();
  const A = acoes(S, () => {}, (fn) => fn());
  const d = S.deals.find((x) => x.id === 1031)!;
  Object.assign(d.orc!, { enviada: null, aceite: null, verif: true, aprov: "ok", contrato: null, vendaDireta: false });
  if (act === "enviarContrato") { Object.assign(d.orc!, { enviada: "hoje", aceite: "hoje" }); d.f.retif_aceite = "2026-11-10"; d.obra.plano = { tasks: [], estado: "aprovado", dia: 0 }; d.fin.pago = true; d.fase = 5; } // 12/11: depois do pagamento; 10/11: o contrato só vai com as medidas aceites e o plano aprovado
  const p = proximo(d, S);
  expect(p.act).toBe(act);
  S.role = p.who as Estado["role"];
  const enviar = vi.fn(), enviarContrato = vi.fn();
  const ctx = { S, A: { ...A, enviar, enviarContrato }, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  return { ctx, d: d as Negocio, btn: p.btn!, enviar, enviarContrato };
}
const desenhar = (ctx: Ctx, d: Negocio) => render(<PermPortalNegocios><BotaoFase ctx={ctx} d={d} /></PermPortalNegocios>);

beforeEach(() => { m.perms = new Set(); m.rpc.mockReset(); m.rpc.mockResolvedValue({ data: false, error: null }); definirModoReal("org-1", "Olyvia Demo"); });
afterEach(() => { cleanup(); definirModoReal(null); });

describe("os passos que vão ao portal", () => {
  it("só enviar (proposta) e enviarContrato (contrato)", () => {
    expect(documentoDoPasso("enviar")).toBe("proposal");
    expect(documentoDoPasso("enviarContrato")).toBe("contract");
    ["contactar", "marcarVisita", "validar", "enviarAdenda", undefined, null].forEach((a) => expect(documentoDoPasso(a)).toBeNull());
  });
});

describe("«Enviar proposta» com a permissão real", () => {
  it("sem permissão: desligado com o motivo, e o clique não envia", async () => {
    const { ctx, d, btn, enviar } = montar("enviar");
    desenhar(ctx, d);
    await screen.findByText(/negocios\.proposta\.enviar ou portal\.manage/);
    const b = screen.getByRole("button", { name: new RegExp(btn) });
    expect(b).toBeDisabled();
    expect(b).toHaveAccessibleDescription(/Sem permissão para enviar a proposta ao portal/);
    fireEvent.click(b);
    expect(enviar).not.toHaveBeenCalled();
    expect(m.rpc).toHaveBeenCalledWith("fn_cat_pode", { p_org: "org-1", p_perm: "negocios.proposta.enviar" });
  });

  it("com negocios.proposta.enviar (fn_cat_pode): ligado e envia", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    const { ctx, d, btn, enviar } = montar("enviar");
    desenhar(ctx, d);
    // enquanto lê, desligado e sem motivo; lida, o botão é o de sempre
    await waitFor(() => expect(screen.getByRole("button", { name: new RegExp(btn) })).toBeEnabled());
    expect(screen.queryByText(/Sem permissão/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(btn) }));
    expect(enviar).toHaveBeenCalledWith(d.id);
  });

  it("sem a base ligada (protótipo): o botão é o de sempre, sem perguntar", () => {
    definirModoReal(null);
    const { ctx, d, btn, enviar } = montar("enviar");
    desenhar(ctx, d);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(btn) }));
    expect(enviar).toHaveBeenCalledWith(d.id);
  });

  it("sem o PermPortalNegocios por cima: o botão é o de sempre", () => {
    const { ctx, d, btn, enviar } = montar("enviar");
    render(<BotaoFase ctx={ctx} d={d} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(btn) }));
    expect(enviar).toHaveBeenCalledWith(d.id);
  });
});

describe("«Gerar/Enviar o contrato» com a permissão real", () => {
  it("negocios.proposta.enviar não chega; client_contracts.send_signature liga", async () => {
    m.rpc.mockResolvedValue({ data: true, error: null });
    const { ctx, d, btn, enviarContrato } = montar("enviarContrato");
    desenhar(ctx, d);
    await screen.findByText(/client_contracts\.send_signature ou portal\.manage/);
    const b = screen.getByRole("button", { name: new RegExp(btn) });
    expect(b).toBeDisabled();
    fireEvent.click(b);
    expect(enviarContrato).not.toHaveBeenCalled();
    cleanup();
    m.perms.add("client_contracts.send_signature");
    desenhar(ctx, d);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(btn) }));
    expect(enviarContrato).toHaveBeenCalledWith(d.id);
  });

  it("com portal.manage (administrador): proposta e contrato ligados", () => {
    m.perms.add("portal.manage");
    for (const act of ["enviar", "enviarContrato"] as const) {
      const r = montar(act);
      desenhar(r.ctx, r.d);
      fireEvent.click(screen.getByRole("button", { name: new RegExp(r.btn) }));
      expect(act === "enviar" ? r.enviar : r.enviarContrato).toHaveBeenCalledWith(r.d.id);
      cleanup();
    }
    expect(m.rpc).not.toHaveBeenCalled();
  });
});

describe("os botões das listas (ComPermPortalDoPasso)", () => {
  it("sem permissão: (sem permissão) e o title; outros passos livres", async () => {
    render(
      <PermPortalNegocios>
        <ComPermPortalDoPasso act="enviar">{(p) => <button type="button" disabled={!p.pode} title={p.semPermissao ? p.motivo : undefined}>Enviar proposta{p.semPermissao && " (sem permissão)"}</button>}</ComPermPortalDoPasso>
        <ComPermPortalDoPasso act="contactar">{(p) => <button type="button" disabled={!p.pode}>Registar chamada</button>}</ComPermPortalDoPasso>
      </PermPortalNegocios>,
    );
    const b = await screen.findByRole("button", { name: "Enviar proposta (sem permissão)" });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("title", expect.stringContaining("negocios.proposta.enviar ou portal.manage"));
    expect(screen.getByRole("button", { name: "Registar chamada" })).toBeEnabled();
  });
});
