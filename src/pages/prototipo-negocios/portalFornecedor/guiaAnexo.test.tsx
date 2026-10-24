// SÓ PROTÓTIPO (21/10): a guia de remessa que o fornecedor envia no portal, com o ficheiro (PDF/foto), aparece na Receção do CRM como
// "Enviada pelo fornecedor" com "Ver guia", a receção usa essa mesma guia (nunca outra) e a folha/lista das guias mostram a origem e o ficheiro.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, seed } from "../motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "../campos";
import { aprovarPos, posDe } from "../testeObra";
import { HOJE, chaveGuia, poPorId, somarDias } from "../inventario/base";
import type { AbaInv } from "../inventario/ctxInv";
import InventarioPagina from "../inventario/InventarioPagina";
import { esquecerInventario, executar, lerInventario } from "../inventario/loja";
import { esquecerPerfil } from "../inventario/perfil";
import { porExpedir, portalConfirmar, portalExpedir } from "../inventario/po";
import { abrirRececaoDaPo } from "../inventario/rececao";
import type { Po } from "../inventario/tipos";
import { esquecerFrota } from "../frota/loja";
import PortalFornecedor from "./PortalFornecedor";

const REF = "CT 2026/1027";
const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
function pagarTiago(): void {
  const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
  preencher(d, FINANCEIRO); preencher(d, [OBRA[0]]); A.role("financeiro"); A.emitir(1027); A.validar(1027);
}
const po = (id: string): Po => lerInventario().pos.find((p) => p.id === id)!;
const agirPo = (id: string, fn: (d: ReturnType<typeof lerInventario>, p: Po) => unknown) => executar((d) => fn(d, poPorId(d, id)!));
const tudoPorExpedir = (p: Po) => p.lines.map((l) => ({ lineId: l.id, qty: porExpedir(p, l) }));
const pdf = (nome = "guia-remessa.pdf", bytes = 2048) => new File([new Uint8Array(bytes)], nome, { type: "application/pdf" });

function CasaInv({ inicio }: { inicio: AbaInv }) {
  const [aba, setAba] = useState<AbaInv>(inicio);
  return <InventarioPagina aba={aba} aoMudarAba={setAba} />;
}
/** A PO pronta a expedir: paga, aprovada, publicada e confirmada pelo fornecedor. */
function poConfirmada(): string {
  pagarTiago();
  expect(aprovarPos(REF)).toBe("");
  const id = posDe(REF)[0].id;
  expect(agirPo(id, (db, p) => portalConfirmar(db, p, somarDias(HOJE, 3), "")).erro).toBe("");
  return id;
}
/** Abre "Dar entrada" da PO na Receção sem guia escolhida (como quem clica a PO na lista Por receber). */
function abrirPainel(id: string) {
  executar((d) => { d.rc.guia = ""; abrirRececaoDaPo(d, poPorId(d, id)!); });
  render(<CasaInv inicio="guia" />);
  return screen.getByRole("dialog", { name: `Dar entrada · ${id}` });
}

let abertos: string[] = [];
beforeEach(() => {
  localStorage.clear(); esquecerInventario(); esquecerPerfil(); esquecerFrota();
  abertos = [];
  vi.spyOn(window, "open").mockImplementation((u) => { abertos.push(String(u)); return null; });
  if (!URL.createObjectURL) Object.assign(URL, { createObjectURL: () => "blob:teste", revokeObjectURL: () => {} });
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => "blob:teste");
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe("Guia de remessa do fornecedor com ficheiro (só protótipo)", () => {
  it("o fornecedor anexa, remove e volta a anexar o PDF; ao expedir a guia fica aberta no CRM com origem e ficheiro", async () => {
    const id = poConfirmada(), sup = po(id).sup;
    render(<PortalFornecedor sup={sup} aoMudarFornecedor={() => {}} aoVoltar={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /Ver encomendas/ }));
    fireEvent.click(screen.getByRole("tab", { name: /^Todas/ }));
    fireEvent.click(screen.getByRole("button", { name: `Abrir ${id}` }));
    fireEvent.click(screen.getByRole("button", { name: "Expedir encomenda" }));
    const de = screen.getByRole("dialog", { name: `Expedir encomenda ${id}` });
    const guia = (within(de).getByLabelText("Nº da guia de remessa") as HTMLInputElement).value;
    const input = within(de).getByLabelText(/Ficheiro da guia de remessa/) as HTMLInputElement;
    expect(input).toHaveAttribute("accept", "application/pdf,image/*");

    // formato errado e ficheiro grande: recusados com mensagem
    fireEvent.change(input, { target: { files: [new File(["x"], "nota.txt", { type: "text/plain" })] } });
    expect(await within(de).findByRole("alert")).toHaveTextContent("PDF ou uma imagem");
    fireEvent.change(input, { target: { files: [pdf("grande.pdf", 3 * 1024 * 1024)] } });
    expect(await within(de).findByRole("alert")).toHaveTextContent("máximo é 2 MB");

    fireEvent.change(input, { target: { files: [pdf()] } });
    expect(await within(de).findByText("guia-remessa.pdf")).toBeInTheDocument();
    fireEvent.click(within(de).getByRole("button", { name: "Remover o ficheiro guia-remessa.pdf" }));
    expect(within(de).queryByText("guia-remessa.pdf")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { files: [pdf()] } });
    expect(await within(de).findByText("guia-remessa.pdf")).toBeInTheDocument();
    fireEvent.click(within(de).getByRole("button", { name: /^Expedir · \d+ un$/ }));
    await waitFor(() => expect(po(id).portal.expedicoes).toHaveLength(1));

    const e = po(id).portal.expedicoes![0];
    expect(e).toMatchObject({ guia, origem: "fornecedor", anexo: { nome: "guia-remessa.pdf", tipo: "application/pdf", tamanho: 2048 } });
    expect(e.anexo!.url).toMatch(/^data:application\/pdf;base64,/);
    const gs = lerInventario().guias.filter((g) => g.sup === sup && chaveGuia(g.id) === chaveGuia(guia));
    expect(gs).toHaveLength(1);
    expect(gs[0]).toMatchObject({ state: "open", pos: [id], origem: "fornecedor", doPortal: true, anexo: { nome: "guia-remessa.pdf" } });
    // o fornecedor vê o ficheiro na guia de remessa
    const dg = screen.getByRole("dialog", { name: `Guia de remessa ${guia}` });
    fireEvent.click(within(dg).getByRole("button", { name: /Ver ficheiro/ }));
    expect(abertos).toEqual(["blob:teste"]);
    cleanup();

    // CRM › Receção › Dar entrada: a guia enviada aparece com o selo e "Ver guia"; usá-la mantém as quantidades da guia
    const painel = abrirPainel(id);
    expect(within(painel).getByText("1 guia enviada pelo fornecedor.")).toBeInTheDocument();
    const lista = within(painel).getByRole("list", { name: "Guias enviadas pelo fornecedor" });
    expect(within(lista).getByText(guia)).toBeInTheDocument();
    expect(within(lista).getByText("Enviada pelo fornecedor")).toBeInTheDocument();
    fireEvent.click(within(lista).getByRole("button", { name: /Ver guia/ }));
    expect(abertos).toHaveLength(2);
    fireEvent.click(within(lista).getByRole("button", { name: `Usar a guia ${guia}` }));
    expect((within(painel).getByRole("combobox", { name: /Guia do fornecedor/ }) as HTMLInputElement).value).toBe(guia);
    expect(within(painel).getByText(new RegExp(`Guia de remessa ${guia.replace("/", "\\/")} do fornecedor`))).toBeInTheDocument();
    const un = e.linhas.reduce((a, x) => a + x.qty, 0);
    fireEvent.click(within(painel).getByRole("button", { name: `Receber tudo · ${un} un` }));
    await waitFor(() => expect(po(id).receipts.filter((r) => r.state === "Ativa").reduce((a, r) => a + r.qty, 0)).toBe(un));
    // a mesma guia: sem duplicados, com as receções ligadas
    expect(lerInventario().guias.filter((g) => g.sup === sup && chaveGuia(g.id) === chaveGuia(guia))).toHaveLength(1);
    expect(po(id).receipts.every((r) => r.guia === guia)).toBe(true);
    cleanup();

    // Receção › Guias: a origem na lista; a folha mostra origem e ficheiro com "Ver guia"
    executar((d) => { d.rc.poFilter = ""; d.rc.guia = ""; });
    render(<CasaInv inicio="guia" />);
    fireEvent.click(screen.getByRole("tab", { name: /^Guias/ }));
    const linha = screen.getByRole("row", { name: new RegExp(`^Abrir a guia ${guia.replace("/", "\\/")}`) });
    expect(within(linha).getByText("Fornecedor (portal)")).toBeInTheDocument();
    fireEvent.click(linha);
    const folha = await screen.findByRole("dialog", { name: guia });
    expect(within(folha).getAllByText("Fornecedor (portal)").length).toBeGreaterThan(0);
    expect(within(folha).getByText("guia-remessa.pdf")).toBeInTheDocument();
    fireEvent.click(within(folha).getByRole("button", { name: /Ver guia/ }));
    expect(abertos).toHaveLength(3);
  });

  it("número repetido (espaços/maiúsculas) recusado; expedição sem ficheiro mostra 'sem ficheiro'", () => {
    const id = poConfirmada();
    const l0 = po(id).lines[0];
    expect(agirPo(id, (db, p) => portalExpedir(db, p, { guia: "GR 2026/950", data: HOJE, linhas: [{ lineId: l0.id, qty: 1 }] })).erro).toBe("");
    expect(agirPo(id, (db, p) => portalExpedir(db, p, { guia: "gr2026/ 950", data: HOJE, linhas: tudoPorExpedir(p) })).erro).toMatch(/já existe/);
    expect(po(id).portal.expedicoes![0].anexo).toBeUndefined();
    const painel = abrirPainel(id);
    const lista = within(painel).getByRole("list", { name: "Guias enviadas pelo fornecedor" });
    expect(within(lista).getByText("sem ficheiro")).toBeInTheDocument();
  });

  it("expedição antiga sem guia na base: aparece na receção e ao receber cria uma só guia, do fornecedor, com o ficheiro", async () => {
    const id = poConfirmada(), sup = po(id).sup;
    expect(agirPo(id, (db, p) => portalExpedir(db, p, { guia: "GR 2026/960", data: HOJE, linhas: tudoPorExpedir(p), anexo: { nome: "foto.jpg", tipo: "image/jpeg", tamanho: 10, url: "data:image/jpeg;base64,AAAA" } })).erro).toBe("");
    // como uma expedição de antes de 21/10: a guia não ficou na base
    executar((d) => { d.guias = d.guias.filter((g) => g.id !== "GR 2026/960"); });
    const painel = abrirPainel(id);
    expect(within(painel).getByText("1 guia enviada pelo fornecedor.")).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: "Usar a guia GR 2026/960" }));
    const un = po(id).portal.expedicoes![0].linhas.reduce((a, x) => a + x.qty, 0);
    fireEvent.click(within(painel).getByRole("button", { name: `Receber tudo · ${un} un` }));
    await waitFor(() => expect(po(id).receipts.filter((r) => r.state === "Ativa")).not.toHaveLength(0));
    const gs = lerInventario().guias.filter((g) => g.sup === sup && chaveGuia(g.id) === chaveGuia("GR 2026/960"));
    expect(gs).toHaveLength(1);
    expect(gs[0]).toMatchObject({ origem: "fornecedor", doPortal: true, pos: [id], anexo: { nome: "foto.jpg" } });
  });
});
