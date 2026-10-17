// Dois pedidos do mesmo cliente sem serviço: o nome do pedido («Pedido de 01/10/2026 (1 de 2)») distingue-os em todo o lado, para o
// leitor de ecrã e para quem vê (cartões do Quadro, sub-linhas da Lista, secções e botões da ficha, "Alterar visita", seletor da
// chamada, títulos e descrições dos diálogos e avisos).
import { useMemo, useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";
import {
  alterarVisitaDoPedido, criarPedidoGuardado, guardarPedido, marcarVisitaDaPessoa, removerPedido, type EstadoPedidos,
} from "../acoesPedido";
import { registarChamada } from "../acoesPessoa";
import { pedidoBase, pessoaBase, resumoBase, visitaBase } from "../fabricaTestes";
import { FormChamada } from "../FormChamada";
import { juntarPessoas } from "../juntarPessoas";
import { paraOpcao } from "../pessoaOpcao";
import type { PedidoNegocio } from "../pessoasTipos";
import { LinhaNegociosPessoa } from "../quadro/LinhaNegociosPessoa";
import { cartoesDoQuadro } from "../quadro/cartoesQuadroPessoas";
import { QuadroPessoas } from "../quadro/QuadroPessoas";
import { ResumoFicha } from "../ResumoFicha";
import { itensDaPessoa } from "./itensProcesso";
import { ProcessoProvider, type AcoesProcesso } from "./ProcessoProvider";

vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  const { pessoasPaginaTranslations } = await import("@/translations/pessoasPagina");
  const textos: Record<string, string> = { ...negocioMetasTranslations.pt, ...pessoasPaginaTranslations.pt };
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) =>
        Object.entries(params ?? {}).reduce((texto, [k, v]) => texto.split(`{${k}}`).join(String(v)), textos[key] ?? key),
    }),
  };
});
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

const TEMPO = 30_000;
const HOJE = HOJE_EXEMPLO;
const ANA = pessoaBase("a", { nome: "Ana", morada: { linha: "Rua A 1", cp: "1000-001", localidade: "Lisboa" } });
/** Os dois nomes: o mesmo dia de criação e nenhum serviço, por isso levam a numeração. */
const N1 = "Pedido de 01/10/2026 (1 de 2)";
const N2 = "Pedido de 01/10/2026 (2 de 2)";

const doisPedidos = (extra: (i: number) => Partial<PedidoNegocio>): PedidoNegocio[] =>
  [1, 2].map((i) => pedidoBase(`pd-${i}`, { pessoaId: "a", servico: "", criadoEm: "2026-10-01", contactado: true, ...extra(i) }));
const comVisitas = () => doisPedidos((i) => ({ visitas: [visitaBase(`pd-${i}-v1`, { data: i === 1 ? "2026-10-20" : "2026-11-05", hora: "10:00" })] }));
const semVisitas = () => doisPedidos(() => ({}));

type Ver = "quadro" | "lista" | "ficha";

function Arnes({ ver, pedidos, avisos }: { ver: Ver; pedidos: PedidoNegocio[]; avisos?: string[] }) {
  const [estado, setEstado] = useState<EstadoPedidos>({ pessoas: [ANA], pedidos, atividade: [], contactadas: [] });
  const resumos = useMemo(() => juntarPessoas(estado.pessoas, [], HOJE, estado.pedidos), [estado.pessoas, estado.pedidos]);
  const nada = () => {};
  const acoes: AcoesProcesso = {
    registarChamada: (id, d) => setEstado((e) => registarChamada(e, id, { ...d, hoje: HOJE })),
    adiar: nada, perder: nada, reativar: nada, juntarNota: nada,
    alterarVisita: (pedidoId, visitaId, d) => setEstado((e) => alterarVisitaDoPedido(e, pedidoId, visitaId, d, HOJE)),
    marcarVisita: (pessoaId, escolha, d) => setEstado((e) => marcarVisitaDaPessoa(e, pessoaId, escolha, d, HOJE)),
    guardarPedido: (pedidoId, d) => setEstado((e) => guardarPedido(e, pedidoId, d, HOJE)),
    criarPedidoComVisitas: (d, guardar) => setEstado((e) => criarPedidoGuardado(e, d, guardar, HOJE)),
    removerPedido: (pedidoId) => setEstado((e) => removerPedido(e, pedidoId)),
  };
  const r = resumos[0];
  const itens = itensDaPessoa(r, HOJE);
  return (
    <ProcessoProvider
      hoje={HOJE} resumos={resumos} acoes={acoes} opcoesPessoa={[paraOpcao(ANA)]} aoCriarNegocio={() => "n-novo-1"}
      aoAnunciar={(texto) => avisos?.push(texto)}
    >
      {ver === "quadro" && (
        <QuadroPessoas
          cartoes={cartoesDoQuadro(resumos, HOJE)} itens={new Map(itens.map((i) => [i.id, i]))} hoje={HOJE} chip="todas"
          aoAbrir={nada} aoLimpar={nada}
        />
      )}
      {ver === "lista" && <LinhaNegociosPessoa pessoaId="a" nome="Ana" itens={itens} hoje={HOJE} aoAbrir={nada} />}
      {ver === "ficha" && (
        <ResumoFicha
          resumo={r} hoje={HOJE} voltou={false} podeVerSubmissoes={false} pendentes={0} aoVerSubmissoes={nada} alterarVisita={acoes.alterarVisita}
        />
      )}
    </ProcessoProvider>
  );
}

const botao = (nome: string) => screen.getByRole("button", { name: nome });
const nomesDosBotoes = (padrao: RegExp) => screen.getAllByRole("button", { name: padrao }).map((b) => b.getAttribute("aria-label") ?? b.textContent ?? "");

describe("dois pedidos sem serviço: o nome do pedido distingue-os", () => {
  it("Quadro: cada cartão diz o seu pedido, e os botões do passo têm nomes únicos", () => {
    render(<Arnes ver="quadro" pedidos={comVisitas()} />);
    expect(screen.getByText(N1)).toBeInTheDocument();
    expect(screen.getByText(N2)).toBeInTheDocument();
    expect(botao(`Marcar a visita como feita: ${N1} de Ana`)).toBeInTheDocument();
    expect(botao(`Marcar a visita como feita: ${N2} de Ana`)).toBeInTheDocument();
  });

  it("Lista: as sub-linhas dizem o pedido, e os botões do passo têm nomes únicos", () => {
    render(<Arnes ver="lista" pedidos={comVisitas()} />);
    expect(screen.getByText(N1)).toBeInTheDocument();
    expect(screen.getByText(N2)).toBeInTheDocument();
    expect(botao(`Marcar a visita como feita: ${N1} de Ana`)).toBeInTheDocument();
    expect(botao(`Marcar a visita como feita: ${N2} de Ana`)).toBeInTheDocument();
  });

  it("ficha: cada secção de visita diz o seu pedido no cabeçalho; os botões do passo e de «Alterar visita» têm nomes únicos", () => {
    render(<Arnes ver="ficha" pedidos={comVisitas()} />);
    expect(screen.getByRole("heading", { name: `Próxima visita · ${N1}` })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: `Próxima visita · ${N2}` })).toBeInTheDocument();
    expect(botao(`Marcar a visita como feita: ${N1} de Ana`)).toBeInTheDocument();
    expect(botao(`Marcar a visita como feita: ${N2} de Ana`)).toBeInTheDocument();
    const alterar = nomesDosBotoes(/^Alterar visita/);
    expect(alterar).toHaveLength(2);
    expect(new Set(alterar).size).toBe(2);
    expect(alterar[0]).toContain(N1);
    expect(alterar[1]).toContain(N2);
  });

  it("o painel de visita e levantamento diz o pedido no título; o aviso do que ficou guardado diz-o também", async () => {
    const avisos: string[] = [];
    render(<Arnes ver="quadro" pedidos={comVisitas()} avisos={avisos} />);
    fireEvent.click(botao(`Marcar a visita como feita: ${N2} de Ana`));
    const painel = await screen.findByRole("dialog", { name: `Visita e levantamento de Ana · ${N2}` });
    expect(painel).toHaveAccessibleDescription(expect.stringContaining(N2));
    fireEvent.click(within(painel).getByRole("button", { name: "Guardar a visita e o levantamento" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(avisos.join("|")).toContain(`Visita guardada: Ana (${N2}) continua em Visita.`));
    expect(avisos.join("|")).not.toContain(N1);
  }, TEMPO);

  it("«Marcar a visita» (um pedido contactado) abre o diálogo com o pedido no título e na descrição", async () => {
    render(<Arnes ver="quadro" pedidos={semVisitas()} />);
    fireEvent.click(botao(`Marcar a visita: ${N2} de Ana`));
    const dialogo = await screen.findByRole("dialog", { name: "Marcar visita" });
    expect(dialogo).toHaveAccessibleDescription(expect.stringContaining(`Ana · ${N2}`));
  }, TEMPO);

  it("«Registar a chamada» a partir de um cartão diz o pedido na descrição do diálogo", async () => {
    render(<Arnes ver="quadro" pedidos={doisPedidos(() => ({ contactado: false }))} />);
    fireEvent.click(botao(`Registar a chamada: ${N1} de Ana`));
    const dialogo = await screen.findByRole("dialog", { name: "Registar chamada" });
    expect(dialogo).toHaveAccessibleDescription(expect.stringContaining(`Ana · ${N1}`));
  }, TEMPO);

  it("«Alterar visita» diz o pedido na descrição do diálogo", async () => {
    render(<Arnes ver="ficha" pedidos={comVisitas()} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Alterar visita/ })[1]);
    const dialogo = await screen.findByRole("dialog", { name: "Alterar visita" });
    expect(dialogo).toHaveAccessibleDescription(expect.stringContaining(N2));
  }, TEMPO);
});

describe("o seletor de pedido da chamada", () => {
  const resumo = () => resumoBase(ANA, [], HOJE, "lead", semVisitas());
  const abrir = () => {
    render(
      <FormChamada
        id="chamada" pessoa={ANA} resumo={resumo()} hoje={HOJE} aoFechar={() => {}} aoConcluir={() => {}}
        acoes={{ registarChamada: vi.fn(), adiar: vi.fn(), perder: vi.fn(), reativar: vi.fn(), juntarNota: vi.fn(), alterarVisita: vi.fn() }}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: /Atendeu · interessado/ }));
    return screen.getByRole("radiogroup", { name: "A que pedido se refere a visita?" });
  };

  it("os cartões dos dois pedidos sem serviço têm nomes distintos e dizem a fase", () => {
    const grupo = abrir();
    const radios = within(grupo).getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(within(grupo).getByRole("radio", { name: new RegExp(N1.replace(/[()]/g, "\\$&")) })).toBeInTheDocument();
    expect(within(grupo).getByRole("radio", { name: new RegExp(N2.replace(/[()]/g, "\\$&")) })).toBeInTheDocument();
  });

  it("diz em texto onde fica a visita: «A visita fica no pedido {pedido}»", () => {
    abrir();
    expect(screen.getByText(`A visita fica no pedido ${N1}`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(N2.replace(/[()]/g, "\\$&")) }));
    expect(screen.getByText(`A visita fica no pedido ${N2}`)).toBeInTheDocument();
  });

  it("o seletor está ao lado do grupo «E agora?», e não dentro dele (um grupo de rádio só tem rádios)", () => {
    const grupo = abrir();
    const proximo = screen.getByRole("radiogroup", { name: "E agora?" });
    expect(proximo.contains(grupo)).toBe(false);
    expect(grupo.contains(proximo)).toBe(false);
    cleanup();
  });
});
