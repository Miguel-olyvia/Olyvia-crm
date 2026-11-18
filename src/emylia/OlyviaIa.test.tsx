// 18/11 (Rúben: «entenda linguagem natural, que não corte… quero controlar tudo por voz… e enquanto vai falando os campos do formulário,
// a AI vai fazendo scroll sozinha para acompanhar»): as regras de pausa, o ecrã inteiro para a IA, os pedidos de vários passos, a
// confirmação do que não se desfaz e o acompanhar da fala.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { acabaAMeio, eConfirmacao, eRecusa, esperaAteAgir, interpretarComando, PAUSA_A_MEIO, PAUSA_CURTA, PAUSA_FRASE, PAUSA_ORDEM } from "./comandoOlyvia";
import { eIrreversivel, lerEcra } from "./ecraOlyvia";
import { campoMencionado, lerCampos } from "./preencherOlyvia";

type Corpo = { frase: string; campos?: { rotulo: string }[]; elementos?: { texto: string; tipo: string; zona?: string }[]; feito?: string[]; conversa?: unknown[] };
const g = vi.hoisted(() => ({ invoke: null as null | ((nome: string, o: { body: Corpo }) => Promise<unknown>) }));
vi.mock("./gravador", () => ({ useGravacao: () => ({ estado: "parado", falas: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (n: string, o: { body: Corpo }) => (g.invoke ? g.invoke(n, o) : Promise.resolve({ data: null, error: new Error("sem função") })) } } }));

import { OlyviaComando } from "./OlyviaComando";

beforeEach(() => { localStorage.clear(); g.invoke = null; document.body.innerHTML = ""; });
afterEach(() => { cleanup(); vi.useRealTimers(); document.body.innerHTML = ""; });

describe("quando agir (18/11: não cortar)", () => {
  it("a frase que acaba a meio espera muito mais", () => {
    expect(acabaAMeio("abre o negócio do")).toBe(true);
    expect(acabaAMeio("quero ver as obras e")).toBe(true);
    expect(acabaAMeio("hum")).toBe(true);
    expect(acabaAMeio("abre o negócio do Carlos")).toBe(false);
    expect(esperaAteAgir("mostra-me o negócio do", interpretarComando("mostra-me o negócio do"), true)).toBe(PAUSA_A_MEIO);
  });
  it("as ordens feitas são rápidas; a frase natural espera o silêncio", () => {
    expect(esperaAteAgir("desce", interpretarComando("desce"), false)).toBe(PAUSA_CURTA);
    expect(esperaAteAgir("vai ao catálogo", interpretarComando("vai ao catálogo"), true)).toBe(PAUSA_ORDEM);
    expect(esperaAteAgir("vai ao catálogo", interpretarComando("vai ao catálogo"), false)).toBe(PAUSA_FRASE);
    expect(esperaAteAgir("preciso de ver quanto custa a proposta", interpretarComando("preciso de ver quanto custa a proposta"), true)).toBe(PAUSA_FRASE);
  });
  it("«sim» confirma; outra ordem não; «não» recusa", () => {
    expect(eConfirmacao("sim")).toBe(true);
    expect(eConfirmacao("Sim, pode")).toBe(true);
    expect(eConfirmacao("olyvia confirmo")).toBe(true);
    expect(eConfirmacao("vai aos negócios")).toBe(false);
    expect(eConfirmacao("sim mas antes muda o prazo")).toBe(false);
    expect(eRecusa("não, espera")).toBe(true);
    expect(eRecusa("cancela")).toBe(true);
  });
});

describe("o ecrã para a IA", () => {
  it("lista o que se toca, com a zona, sem a própria Olyvia nem o que está escondido (o inativo vai marcado); passwords nunca", () => {
    document.body.innerHTML = `
      <main>
        <section><h2>Propostas</h2>
          <ul><li>Carlos Mendes · 4 182 € <button>Abrir</button></li><li>Ana Silva · 900 € <button>Abrir</button></li></ul>
        </section>
        <label for="p">Prazo</label><input id="p" value="3 semanas">
        <select aria-label="Estado"><option>Rascunho</option><option selected>Enviada</option></select>
        <button disabled>Desligado</button>
        <div aria-hidden="true"><button>Escondido</button></div>
        <input type="password" aria-label="Senha">
        <a href="/pessoas">Pessoas</a>
        <button role="tab" aria-selected="true">Resumo</button>
      </main>
      <div data-olyvia><button>Olyvia</button></div>`;
    const e = lerEcra();
    const txt = e.elementos.map((x) => `${x.tipo}:${x.texto}${x.zona ? `@${x.zona}` : ""}${x.valor ? `=${x.valor}` : ""}`);
    expect(txt).toEqual([
      "botao:Abrir@Carlos Mendes · 4 182 €",
      "botao:Abrir@Ana Silva · 900 €",
      "caixa:Prazo=3 semanas",
      "lista:Estado=Enviada",
      "botao:Desligado",
      "ligacao:Pessoas",
      "separador:Resumo",
    ]);
    expect(e.elementos.find((x) => x.tipo === "lista")?.opcoes).toEqual(["Rascunho", "Enviada"]);
    expect(e.elementos.find((x) => x.tipo === "separador")?.estado).toBe("escolhido");
    expect(e.elementos.find((x) => x.texto === "Desligado")?.estado).toBe("inativo");
    expect(e.nos).toHaveLength(e.elementos.length);
    expect(e.texto).toMatch(/Carlos Mendes/);
    expect(e.texto).not.toMatch(/Olyvia/);
  });
  it("as fases do negócio (aria-pressed) vão como escolhido / não escolhido, não como desligadas", () => {
    document.body.innerHTML = `<nav><button aria-pressed="false">Negócio</button><button aria-pressed="true">Obra</button></nav><button role="switch" aria-checked="false">Som</button>`;
    expect(lerEcra().elementos.map((x) => `${x.texto}:${x.estado}`)).toEqual(["Negócio:não escolhido", "Obra:escolhido", "Som:desligado"]);
  });
  it("o que não se desfaz", () => {
    for (const n of ["Enviar proposta", "Apagar", "Assinar contrato", "Registar fatura", "Marcar como perdido"]) expect(eIrreversivel(n)).toBe(true);
    for (const n of ["Abrir", "Proposta", "Guardar rascunho", "Próximo passo", "Ver mais"]) expect(eIrreversivel(n)).toBe(false);
    for (const n of ["Arrancar a obra", "Encomendar materiais", "Adjudicar"]) expect(eIrreversivel(n)).toBe(true);
    expect(eIrreversivel("TESTE FLUXO 16/11 Claude · Casa de banho Arrancar a obra · qua, 18 nov")).toBe(false);
  });
});

describe("acompanhar a fala (18/11)", () => {
  it("a pergunta de que se fala é a do último rótulo dito", () => {
    document.body.innerHTML = `
      <div role="group" aria-labelledby="a"><span id="a">Acesso ao local</span><button aria-pressed="false">Fácil</button><button aria-pressed="false">Difícil</button></div>
      <div role="group" aria-labelledby="b"><span id="b">Estacionamento</span><button aria-pressed="false">Pago</button><button aria-pressed="false">Não pago</button></div>`;
    const campos = lerCampos();
    expect(campoMencionado("o acesso é fácil e o estacionamento", campos)).toBe(1);
    expect(campoMencionado("então o acesso", campos)).toBe(0);
    expect(campoMencionado("bom dia", campos)).toBeNull();
    expect(campos[0].no?.getAttribute("role")).toBe("group");
  });
});

/** Escrever no painel (o mesmo caminho que a voz, sem o micro). */
async function pedir(frase: string) {
  fireEvent.click(screen.getByRole("button", { name: /Olyvia/ }));
  fireEvent.change(screen.getByLabelText("Comando"), { target: { value: frase } });
  await act(async () => { fireEvent.submit(screen.getByLabelText("Comando").closest("form")!); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
}

describe("a IA com o ecrã inteiro", () => {
  it("vários passos: carrega, olha para o ecrã novo e segue (com o que já fez)", async () => {
    vi.useFakeTimers();
    const pedidos: Corpo[] = [];
    g.invoke = async (_n, o) => {
      pedidos.push(o.body);
      if (pedidos.length === 1) {
        const i = o.body.elementos!.findIndex((e) => e.texto === "Editar prazo");
        return { data: { acoes: [{ tipo: "clicar", elemento: i }], resposta: "", continuar: true }, error: null };
      }
      // a caixa com rótulo é uma pergunta do formulário (vai em `campos`, não em `elementos`)
      expect(o.body.elementos!.some((e) => e.texto === "Novo prazo")).toBe(false);
      const i = o.body.campos!.findIndex((c) => c.rotulo === "Novo prazo");
      return { data: { acoes: [{ tipo: "texto", campo: i, texto: "4 semanas" }], resposta: "Pus o prazo em 4 semanas.", continuar: false }, error: null };
    };
    const editar = document.createElement("button");
    editar.textContent = "Editar prazo";
    editar.onclick = () => { const l = document.createElement("label"); l.htmlFor = "np"; l.textContent = "Novo prazo"; const i = document.createElement("input"); i.id = "np"; document.body.append(l, i); };
    document.body.appendChild(editar);
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("muda o prazo da obra para quatro semanas por favor");
    expect(pedidos).toHaveLength(2);
    expect(pedidos[1].feito).toEqual(["carreguei em «Editar prazo»"]);
    expect((document.getElementById("np") as HTMLInputElement).value).toBe("4 semanas");
    expect(screen.getByRole("status").textContent).toBe("Pus o prazo em 4 semanas.");
  });

  it("o que não se desfaz pergunta antes; só com «sim» carrega", async () => {
    vi.useFakeTimers();
    g.invoke = async (_n, o) => ({ data: { acoes: [{ tipo: "clicar", elemento: o.body.elementos!.findIndex((e) => e.texto === "Enviar proposta") }], resposta: "Enviei a proposta.", continuar: false }, error: null });
    const enviou = vi.fn();
    const b = document.createElement("button"); b.textContent = "Enviar proposta"; b.onclick = enviou; document.body.appendChild(b);
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("envia a proposta ao cliente agora mesmo");
    expect(enviou).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toMatch(/Vou carregar em «Enviar proposta»\. Confirmas\?/);
    fireEvent.change(screen.getByLabelText("Comando"), { target: { value: "sim" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("Comando").closest("form")!); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(enviou).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("«não» cancela", async () => {
    vi.useFakeTimers();
    g.invoke = async (_n, o) => ({ data: { acoes: [{ tipo: "clicar", elemento: o.body.elementos!.findIndex((e) => e.texto === "Apagar negócio") }], resposta: "", continuar: false }, error: null });
    const apagou = vi.fn();
    const b = document.createElement("button"); b.textContent = "Apagar negócio"; b.onclick = apagou; document.body.appendChild(b);
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("apaga este negócio que já não interessa");
    fireEvent.change(screen.getByLabelText("Comando"), { target: { value: "não" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("Comando").closest("form")!); });
    expect(apagou).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Está bem, não faço.");
  });

  it("não anda às voltas: repetir o mesmo passo pára (18/11, testarh)", async () => {
    vi.useFakeTimers();
    let n = 0;
    const abrir = document.createElement("button"); abrir.textContent = "Mais filtros"; document.body.appendChild(abrir);
    g.invoke = async (_n, o) => { n++; return { data: { acoes: [{ tipo: "clicar", elemento: o.body.elementos!.findIndex((e) => e.texto === "Mais filtros") }], resposta: "", continuar: true }, error: null }; };
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("quero ver as obras que estão a decorrer agora");
    expect(n).toBe(2);
    expect(screen.getByRole("status").textContent).toMatch(/Fiquei por aqui/);
  });

  it("sem permissão na página nova: diz e pára", async () => {
    vi.useFakeTimers();
    let n = 0;
    const b = document.createElement("button"); b.textContent = "Operações";
    b.onclick = () => { const p = document.createElement("main"); p.textContent = "Sem permissão (negocios.view)"; document.body.appendChild(p); };
    document.body.appendChild(b);
    g.invoke = async (_n, o) => { n++; return { data: { acoes: [{ tipo: "clicar", elemento: o.body.elementos!.findIndex((e) => e.texto === "Operações") }], resposta: "", continuar: true }, error: null }; };
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("preciso de ver as obras que estão a decorrer agora");
    expect(n).toBe(1);
    expect(screen.getByRole("status").textContent).toBe("Cheguei, mas não tens permissão para ver esta página.");
  });

  it("lembra-se da conversa («e o outro?»)", async () => {
    vi.useFakeTimers();
    const conversas: unknown[][] = [];
    g.invoke = async (_n, o) => { conversas.push(o.body.conversa ?? []); return { data: { acoes: [], resposta: "A proposta é de 4 182 euros.", continuar: false }, error: null }; };
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("quanto é que custa a proposta do carlos");
    fireEvent.change(screen.getByLabelText("Comando"), { target: { value: "e a da ana silva quanto custa então" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("Comando").closest("form")!); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(conversas[0]).toEqual([]);
    expect(conversas[1]).toEqual([{ eu: "quanto é que custa a proposta do carlos", olyvia: "A proposta é de 4 182 euros." }]);
  });
});
