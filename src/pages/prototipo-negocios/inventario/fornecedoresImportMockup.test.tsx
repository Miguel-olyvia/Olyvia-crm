import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import InventarioPagina from "./InventarioPagina";
import MenuInventario from "./MenuInventario";
import { recusa, fresca } from "./ajudaTestes";
import { nifCompleto } from "./base";
import { acessoPortal, definirCampoArtigo, definirCampoForn, donoDoEmail, emMassa, nifValido, submeterPortal, validarNovoForn } from "./regrasForn";
import { defArtigos, defFornecedores } from "./impForn";
import { esquecerInventario, lerInventario } from "./loja";
import type { AbaInv } from "./ctxInv";
import { esquecerPerfil, mudarPerfil } from "./perfil";
// Os Fornecedores do Inventário contra o mockup (scrSup, newSupDlg, supSheet, openPortalSim, XP.suppliers e XP.items): cabeçalho, filtros, seleção e ações em massa, edição na célula,
// novo fornecedor com NIF e email únicos, a ficha com os cinco separadores, a simulação do portal, importar e as permissões.

function Casa() {
  const [aba, setAba] = useState<AbaInv>("sup");
  return <><MenuInventario aba={aba} aoIr={setAba} /><InventarioPagina aba={aba} aoMudarAba={setAba} /></>;
}
const painel = (): HTMLElement => document.getElementById("inv-painel") as HTMLElement;
const linha = (nome: RegExp): HTMLElement => within(painel()).getByRole("row", { name: nome });
const dialogo = (): HTMLElement => { const d = screen.getAllByRole("dialog"); return d[d.length - 1]; };
const botao = (raiz: HTMLElement, nome: RegExp | string): HTMLElement => within(raiz).getByRole("button", { name: nome });
const abrirFicha = (nome: RegExp = /^Abrir a ficha de Fornecedor Alfa/): HTMLElement => { fireEvent.click(linha(nome)); return dialogo(); };
const separador = (folha: HTMLElement, nome: RegExp | string): void => { fireEvent.click(within(folha).getByRole("tab", { name: nome })); };

beforeEach(() => { esquecerPerfil(); esquecerInventario(); });
afterEach(() => cleanup());

describe("Fornecedores: importar e exportar", () => {
  it("o diálogo de importar usa as colunas do mockup e actualiza/cria por código", async () => {
    render(<Casa />);
    fireEvent.click(botao(painel().querySelector(".ph-actions") as HTMLElement, "Importar"));
    const d = dialogo();
    expect(d.textContent).toContain("codigo;nome;empresa;nif;email;telefone;cidade;sla_dias;ativo");
    expect(d.textContent).toContain("Fornecedores com portal ativo mantêm NIF e empresa.");
    const nifGama = lerInventario().suppliers.find((s) => s.id === "gama")!.nif;
    const csv = `codigo;nome;empresa;nif;email;telefone;cidade;sla_dias;ativo\nFOR-003;Gama Elétrica 2;Empresa B (Porto);${nifGama};vendas@gama.exemplo;;Braga;4;sim\nFOR-099;Novo Imp;Empresa A (Lisboa);${nifCompleto("51234567")};imp@novo.exemplo;;Faro;6;sim\nFOR-100;Mau;;123456780;;;;;sim`;
    fireEvent.change(within(d).getByLabelText("Conteúdo CSV"), { target: { value: csv } });
    fireEvent.click(botao(d, /Pré-visualizar/));
    expect(Array.from(d.querySelectorAll("tbody tr")).map((r) => r.querySelector("td:nth-child(3)")?.textContent)).toEqual(["Atualizar", "Novo", "Erro"]);
    fireEvent.click(botao(d, /^Importar 2 linha/));
    expect(lerInventario().suppliers.find((s) => s.code === "FOR-099")?.city).toBe("Faro");
    expect(lerInventario().suppliers.find((s) => s.code === "FOR-003")?.name).toBe("Gama Elétrica 2");
  });

  it("os artigos têm o seu Exportar e Importar na ficha, só para suppliers.manage", async () => {
    render(<Casa />);
    const f = abrirFicha();
    separador(f, /^Artigos e preços/);
    fireEvent.click(botao(f, "Importar"));
    expect(dialogo().textContent).toContain("ref_fornecedor;sku;unidades_por_embalagem;embalagem;preco;moq;prazo_dias;preferido");
  });
});

describe("regras dos fornecedores (funções puras)", () => {
  it("o NIF valida o dígito de controlo e o primeiro dígito", async () => {
    expect(nifValido(nifCompleto("51234567"))).toBe(true);
    expect(nifValido("123456780")).toBe(false);
    expect(nifValido("40000000")).toBe(false);
    expect(nifValido("")).toBe(false);
  });

  it("o email único olha para a equipa, os clientes e os outros fornecedores (menos o próprio)", async () => {
    const db = fresca();
    expect(donoDoEmail(db, "EQUIPA@olyvia-demo.pt")).toBe("Equipa (T. Marques)");
    expect(donoDoEmail(db, "cliente.silva@exemplo.pt")).toBe("Cliente (Cliente Silva & Filhos)");
    expect(donoDoEmail(db, "vendas@gama.exemplo")).toBe("outro fornecedor (Gama Elétrica)");
    expect(donoDoEmail(db, "vendas@gama.exemplo", "gama")).toBeNull();
    expect(donoDoEmail(db, "livre@x.pt")).toBeNull();
  });

  it("validarNovoForn: exige o essencial para convidar e só avisa do NIF repetido", async () => {
    const db = fresca();
    const v = validarNovoForn(db, { company: "Empresa A (Lisboa)", name: "", nif: "", email: "", contactName: "" }, true);
    expect(v.errs).toEqual({ name: "Obrigatório.", nif: "NIF obrigatório para convidar.", email: "Email obrigatório para convidar.", contactName: "Indique quem recebe o acesso." });
    expect(validarNovoForn(db, { company: "x", name: "A", nif: "", email: "", contactName: "" }, false).errs).toEqual({});
    expect(validarNovoForn(db, { company: "x", name: "A", nif: db.suppliers[0].nif, email: "", contactName: "" }, false).warns).toHaveLength(1);
  });

  it("com portal ativo o NIF e a empresa não se editam; o código repetido e o SLA são recusados", async () => {
    const db = fresca();
    expect(recusa(() => definirCampoForn(db, "alfa", "nif", "509000001"))).toBe("Bloqueado com portal ativo: revogue o acesso para editar.");
    expect(recusa(() => definirCampoForn(db, "alfa", "company", "x"))).toContain("Bloqueado");
    expect(recusa(() => definirCampoForn(db, "alfa", "code", "FOR-002"))).toBe("Código já usado.");
    expect(recusa(() => definirCampoForn(db, "alfa", "sla", "1,5"))).toBe("Prazo SLA: inteiro ≥ 0.");
    expect(recusa(() => definirCampoForn(db, "alfa", "cp", "123"))).toBe("Código postal no formato 0000-000.");
    definirCampoForn(db, "alfa", "city", " Sintra ");
    expect(db.suppliers[0].city).toBe("Sintra");
  });

  it("as regras recusam sem a permissão (como need() do mockup)", async () => {
    mudarPerfil("consulta");
    const db = fresca();
    expect(recusa(() => definirCampoForn(db, "gama", "city", "x"))).toBe("Sem permissão: editar fornecedores (requer suppliers.manage).");
    expect(recusa(() => acessoPortal(db, "gama", "invite"))).toBe("Sem permissão: suppliers.manage (requer suppliers.manage).");
    expect(recusa(() => emMassa(db, ["gama"], "delete", ""))).toContain("requer suppliers.manage");
  });

  it("o preço de um artigo regista o histórico e muda o custo se for o preferido; a embalagem recusa encomendas abertas", async () => {
    const db = fresca();
    const alf = db.items.find((i) => i.ref === "ALF-PV450")!;
    definirCampoArtigo(db, alf.id, "price", "110,25");
    expect(alf.price).toBe(110.25);
    expect(alf.history).toEqual([{ at: "2026-10-09T10:00", from: 118, to: 110.25 }]);
    expect(db.products.find((p) => p.sku === "PV-450")?.cost).toBe(110.25);
    expect(recusa(() => definirCampoArtigo(db, alf.id, "moq", "0"))).toBe("MOQ: inteiro ≥ 1.");
    expect(recusa(() => definirCampoArtigo(db, alf.id, "ref", ""))).toBe("Referência obrigatória.");
  });

  it("emMassa muda a empresa só de quem não tem portal ativo e elimina só sem encomendas abertas", async () => {
    const db = fresca();
    expect(emMassa(db, ["alfa", "gama"], "company", "Empresa A (Lisboa)")).toEqual({ n: 1, skip: 1 });
    expect(emMassa(db, ["alfa", "gama"], "delete", "")).toEqual({ n: 1, skip: 1 });
  });

  it("submeterPortal exige a ficha, valida o catálogo e deixa a sugestão por EAN como Exata", async () => {
    const db = fresca();
    const ficha = { password: "segredo123", password2: "segredo123", addr: "Rua 1", cp: "4000-100", city: "Porto", country: "Portugal", phone: "", web: "", contact: "", sla: 6 };
    expect(recusa(() => submeterPortal(db, "gama", ficha, []))).toBe("O convite não está pendente.");
    expect(recusa(() => submeterPortal(db, "beta", { ...ficha, cp: "40" }, []))).toBe("Código postal no formato 0000-000.");
    const art = (ref: string, ean = ""): { ref: string; name: string; ean: string; price: string; unit: string; packN: number; moq: number; lead: number } => ({ ref, name: "Painel", ean, price: "10", unit: "Unidade", packN: 1, moq: 1, lead: 3 });
    expect(recusa(() => submeterPortal(db, "beta", ficha, [art("A"), art("a")]))).toBe("Referência repetida: a");
    const ean = db.products.find((p) => p.ean)!.ean;
    expect(submeterPortal(db, "beta", ficha, [art("B1", ean), art("B2")])).toBe(2);
    expect(db.catalog.find((c) => c.ref === "B1")?.sug?.conf).toBe("Exata");
    expect(db.suppliers.find((s) => s.id === "beta")?.invite?.state).toBe("active");
  });

  it("as definições de exportar têm as colunas do mockup e verificam Novo/Atualizar/Erro", async () => {
    const db = fresca();
    const def = defFornecedores(() => db.suppliers);
    expect(def.cols.map((c) => c[0])).toEqual(["codigo", "nome", "empresa", "nif", "email", "telefone", "cidade", "sla_dias", "ativo"]);
    const base = { codigo: "FOR-003", nome: "Gama Elétrica", empresa: "Empresa B (Porto)", nif: db.suppliers[2].nif, email: "vendas@gama.exemplo", telefone: db.suppliers[2].phone, cidade: "Braga", sla_dias: "4", ativo: "sim" };
    expect(def.verificar(base, db).st).toBe("Sem alterações");
    expect(def.verificar({ ...base, cidade: "Faro" }, db).st).toBe("Atualizar");
    expect(def.verificar({ ...base, codigo: "FOR-050", email: "novo@x.pt" }, db).st).toBe("Novo");
    expect(def.verificar({ ...base, sla_dias: "x" }, db)).toMatchObject({ st: "Erro", msg: "SLA tem de ser inteiro." });
    const art = defArtigos("alfa", () => db.items.filter((i) => i.sup === "alfa"));
    expect(art.verificar({ ref_fornecedor: "NOVO", sku: "ZZ", unidades_por_embalagem: "1", preco: "1" }, db)).toMatchObject({ st: "Erro", msg: "SKU desconhecido: ZZ" });
  });
});

