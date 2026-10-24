// O tipo de fecho de um negócio no detalhe da ficha real: a etiqueta («Fecha na proposta (venda directa)» ou «Fecha no contrato»), a mudança por
// neg_mudar_fecho com confirmação (a base devolve precisa_confirmar e só muda quando se volta a chamar com a confirmação), os erros NG022 e NG023
// traduzidos, e num negócio de fecho «proposta» o ecrã não oferece contratos (nem a secção, nem criar, nem ligar) e explica porquê.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { ComCostura, dadosFalsos, erroNegFalso, mutacoesFalsas, pendente } from "@/components/negocio-metas/costuraTestUtil";
import type { MutacoesNegocio, ResultadoMudarFecho } from "@/components/negocio-metas/mutacoesNegocio";
import { repor } from "@/components/negocio-metas/negociosAlterados";
import { repor as reporRegistos } from "@/components/negocio-metas/registosPessoa";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";
import { DetalheNegocioFicha } from "./DetalheNegocioFicha";
import { MudarFechoNegocio } from "./MudarFechoNegocio";
import { negocioBase } from "./fabricaTestes";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
const { sucesso } = vi.hoisted(() => ({ sucesso: vi.fn() }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: sucesso } }));

beforeAll(prepararRadixNoJsdom);
beforeEach(() => sucesso.mockReset());
afterEach(() => { cleanup(); repor(); reporRegistos(); });

const HOJE = "2026-10-19";
const base = { pessoa: "Ana", servico: "Cozinha", estadoReal: "aberto" as const, orcamentos: [{ id: "o", valor: 100, escolhido: true }], proposta: { estado: "enviada" as const } };
const noContrato = negocioBase("n1", { ...base, fecho: "contrato" });
const naProposta = negocioBase("n1", { ...base, fecho: "proposta" });
const ganho = { ...negocioBase("n3", { pessoa: "Ana", servico: "Casa", estadoReal: "ganho", fecho: "contrato" }), resultado: "ganho" as const, mes: "2026-10" };

const resultado = (extra: Partial<ResultadoMudarFecho> = {}): ResultadoMudarFecho => ({ mudou: true, fecho: "proposta", precisaConfirmar: false, ...extra });

function abrir(
  negocio: Parameters<typeof DetalheNegocioFicha>[0]["negocio"], extra: Partial<MutacoesNegocio> = {}, dados: Partial<DadosNegocio> = {},
) {
  const mutacoes = mutacoesFalsas({ mudarFecho: vi.fn(async () => resultado()), ...extra });
  render(
    <MemoryRouter>
      <ComCostura mutacoes={mutacoes} dados={dadosFalsos(dados)}>
        <DetalheNegocioFicha negocio={negocio} hoje={HOJE} aoVoltar={vi.fn()} />
      </ComCostura>
    </MemoryRouter>,
  );
  return mutacoes;
}
const botaoMudar = () => screen.getByRole("button", { name: "Mudar o tipo de fecho" });
const abrirDialogo = () => {
  fireEvent.click(botaoMudar());
  return screen.getByRole("dialog", { name: "Mudar o tipo de fecho" });
};

describe("a etiqueta do tipo de fecho", () => {
  it("diz «Fecha no contrato» e «Fecha na proposta (venda directa)»", () => {
    abrir(noContrato);
    expect(screen.getByText("Fecha no contrato")).toBeInTheDocument();
    cleanup();
    abrir(naProposta);
    expect(screen.getByText("Fecha na proposta (venda directa)")).toBeInTheDocument();
  });

  it("sem o tipo (o exemplo, ou a base ainda sem ele) não inventa nenhuma etiqueta nem oferece mudar", () => {
    abrir(negocioBase("n1", base));
    expect(screen.queryByText(/^Fecha n/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Mudar o tipo de fecho" })).toBeNull();
  });

  it("um negócio ganho também mostra o tipo, mas não deixa mudá-lo (só com o negócio aberto)", () => {
    abrir(ganho);
    expect(screen.getByText("Fecha no contrato")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mudar o tipo de fecho" })).toBeNull();
  });

  it("sem permissão de editar, ou sem a função de mudar, não oferece o botão", () => {
    abrir(noContrato, {}, { podeEditar: false });
    expect(screen.queryByRole("button", { name: "Mudar o tipo de fecho" })).toBeNull();
    cleanup();
    abrir(noContrato, { mudarFecho: undefined });
    expect(screen.queryByRole("button", { name: "Mudar o tipo de fecho" })).toBeNull();
  });
});

describe("mudar o tipo de fecho", () => {
  it("o diálogo diz para que tipo se passa; só muda ao confirmar, e chama a base sem confirmação à primeira", async () => {
    const mutacoes = abrir(noContrato);
    const dialogo = abrirDialogo();
    expect(dialogo).toHaveTextContent("Cozinha");
    expect(mutacoes.mudarFecho).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Passar a fechar na proposta" }));
    expect(mutacoes.mudarFecho).toHaveBeenCalledWith("n1", "proposta", false);
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("Ana: o negócio Cozinha passa a fechar na proposta."));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("de proposta para contrato passa «contrato»", async () => {
    const mutacoes = abrir(naProposta, { mudarFecho: vi.fn(async () => resultado({ fecho: "contrato" })) });
    fireEvent.click(within(abrirDialogo()).getByRole("button", { name: "Passar a fechar no contrato" }));
    expect(mutacoes.mudarFecho).toHaveBeenCalledWith("n1", "contrato", false);
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("Ana: o negócio Cozinha passa a fechar no contrato."));
  });

  it("cancelar fecha sem chamar a base", async () => {
    const mutacoes = abrir(noContrato);
    fireEvent.click(within(abrirDialogo()).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mutacoes.mudarFecho).not.toHaveBeenCalled();
  });

  it("a base pede confirmação: mostra o diálogo de confirmação, não muda, e só ao confirmar volta a chamar com a confirmação", async () => {
    const mudarFecho = vi.fn()
      .mockResolvedValueOnce(resultado({ mudou: false, fecho: "contrato", precisaConfirmar: true }))
      .mockResolvedValueOnce(resultado());
    abrir(noContrato, { mudarFecho });
    fireEvent.click(within(abrirDialogo()).getByRole("button", { name: "Passar a fechar na proposta" }));
    const confirmacao = await screen.findByText(/A proposta que já está aceite passa a decidir este negócio/);
    expect(confirmacao).toBeInTheDocument();
    expect(sucesso).not.toHaveBeenCalled();
    expect(mudarFecho).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a mudança" }));
    expect(mudarFecho).toHaveBeenLastCalledWith("n1", "proposta", true);
    await waitFor(() => expect(sucesso).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a confirmação para o contrato fala do contrato assinado", async () => {
    abrir(naProposta, { mudarFecho: vi.fn(async () => resultado({ mudou: false, fecho: "proposta", precisaConfirmar: true })) });
    fireEvent.click(within(abrirDialogo()).getByRole("button", { name: "Passar a fechar no contrato" }));
    expect(await screen.findByText(/O contrato que já está assinado passa a decidir este negócio/)).toBeInTheDocument();
  });

  it("cancelar a confirmação não muda nada", async () => {
    const mudarFecho = vi.fn(async () => resultado({ mudou: false, fecho: "contrato", precisaConfirmar: true }));
    abrir(noContrato, { mudarFecho });
    fireEvent.click(within(abrirDialogo()).getByRole("button", { name: "Passar a fechar na proposta" }));
    await screen.findByRole("button", { name: "Confirmar a mudança" });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(mudarFecho).toHaveBeenCalledTimes(1);
  });

  it("já era esse tipo (mudou: false, sem confirmação): diz-o e fecha", async () => {
    abrir(noContrato, { mudarFecho: vi.fn(async () => resultado({ mudou: false, fecho: "proposta" })) });
    fireEvent.click(within(abrirDialogo()).getByRole("button", { name: "Passar a fechar na proposta" }));
    await waitFor(() => expect(sucesso).toHaveBeenCalledWith("O negócio Cozinha já fechava assim."));
  });

  it("enquanto a base responde o botão fica aria-busy e um segundo clique não repete a chamada", async () => {
    const p = pendente<ResultadoMudarFecho>();
    const mudarFecho = vi.fn(() => p.promessa);
    abrir(noContrato, { mudarFecho });
    const botao = within(abrirDialogo()).getByRole("button", { name: "Passar a fechar na proposta" });
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(mudarFecho).toHaveBeenCalledTimes(1);
    await p.terminar(resultado());
  });
});

describe("os erros da mudança, traduzidos, dentro do diálogo", () => {
  it.each([
    ["NG022", /O tipo de fecho não pode mudar neste estado/],
    ["NG023", /não usa contratos/],
  ])("%s diz-se em texto e o diálogo fica aberto", async (codigo, texto) => {
    const mudarFecho = vi.fn(async () => { throw erroNegFalso(`pessoasPagina.erroNeg.${codigo.toLowerCase()}`, codigo); });
    abrir(noContrato, { mudarFecho });
    const dialogo = abrirDialogo();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Passar a fechar na proposta" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(texto);
    expect(screen.getByRole("dialog", { name: "Mudar o tipo de fecho" })).toBeInTheDocument();
    expect(sucesso).not.toHaveBeenCalled();
  });

  it("um erro depois de pedir a confirmação também se diz dentro do diálogo", async () => {
    const mudarFecho = vi.fn()
      .mockResolvedValueOnce(resultado({ mudou: false, fecho: "contrato", precisaConfirmar: true }))
      .mockRejectedValueOnce(erroNegFalso("pessoasPagina.erroNeg.ng022", "NG022"));
    abrir(noContrato, { mudarFecho });
    fireEvent.click(within(abrirDialogo()).getByRole("button", { name: "Passar a fechar na proposta" }));
    fireEvent.click(await screen.findByRole("button", { name: "Confirmar a mudança" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/não pode mudar neste estado/);
  });
});

describe("o diálogo de mudar o tipo de fecho, para quem usa leitor de ecrã e quando a ficha se refaz", () => {
  it("o aviso do segundo passo vai numa região de estado e liga-se ao botão de confirmar (ouve-se antes de confirmar)", async () => {
    const mudarFecho = vi.fn(async () => resultado({ mudou: false, fecho: "contrato", precisaConfirmar: true }));
    abrir(noContrato, { mudarFecho });
    const dialogo = abrirDialogo();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Passar a fechar na proposta" }));
    const confirmar = await screen.findByRole("button", { name: "Confirmar a mudança" });
    const aviso = within(dialogo).getAllByRole("status").find((r) => /./.test(r.textContent ?? ""));
    expect(aviso).toBeDefined();
    expect(confirmar.getAttribute("aria-describedby")).toContain(aviso?.id ?? "sem-id");
  });

  it("NG022 porque o negócio já não está aberto: a ficha refaz-se, mas o diálogo fica montado com a mensagem", async () => {
    const mudarFecho = vi.fn(async () => { throw erroNegFalso("pessoasPagina.erroNeg.ng022", "NG022"); });
    const mutacoes = mutacoesFalsas({ mudarFecho });
    const arvore = (negocio: typeof noContrato) => (
      <MemoryRouter>
        <ComCostura mutacoes={mutacoes} dados={dadosFalsos()}>
          <MudarFechoNegocio negocio={negocio} />
        </ComCostura>
      </MemoryRouter>
    );
    const { rerender } = render(arvore(noContrato));
    const dialogo = abrirDialogo();
    fireEvent.click(within(dialogo).getByRole("button", { name: "Passar a fechar na proposta" }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(/não pode mudar neste estado|não pode mudar/);
    // A ficha refez-se e o negócio já não está aberto: o botão que abriu o diálogo desaparece, o diálogo não.
    rerender(arvore({ ...noContrato, estadoReal: "ganho" }));
    expect(screen.getByRole("dialog", { name: "Mudar o tipo de fecho" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/não pode mudar/);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: "Mudar o tipo de fecho" })).toBeNull();
  });
});

describe("num negócio de fecho «proposta» o ecrã não oferece contratos", () => {
  const comContrato = (fecho: "proposta" | "contrato") =>
    negocioBase("n1", { ...base, fecho, proposta: { estado: "aceite" }, contrato: { estado: "pendente" } });

  const seccaoContrato = () => screen.queryByRole("button", { name: /^Contrato/ });

  it("não mostra a secção do contrato nem a fase «Contrato», mesmo com um contrato ligado, e diz porquê numa nota curta", () => {
    abrir(comContrato("proposta"));
    expect(seccaoContrato()).toBeNull();
    expect(screen.queryByText("Contrato")).toBeNull();
    expect(screen.getByText(/os contratos não se usam aqui/)).toBeInTheDocument();
  });

  it("não propõe criar o contrato como passo seguinte (a proposta aceite não pede contrato)", () => {
    abrir(negocioBase("n1", { ...base, fecho: "proposta", proposta: { estado: "aceite" } }));
    expect(screen.queryByText("Criar o contrato")).toBeNull();
    expect(screen.queryByText("A proposta foi aceite: falta o contrato.")).toBeNull();
  });

  it("num negócio de fecho «contrato» a proposta aceite continua a pedir o contrato", () => {
    abrir(negocioBase("n1", { ...base, fecho: "contrato", proposta: { estado: "aceite" } }));
    expect(screen.getByText("Criar o contrato")).toBeInTheDocument();
  });

  it("num negócio de fecho «contrato» a secção do contrato mantém-se e não há nota", () => {
    abrir(comContrato("contrato"));
    expect(seccaoContrato()).not.toBeNull();
    expect(screen.queryByText(/os contratos não se usam aqui/)).toBeNull();
  });

  it("sem o tipo conhecido (o exemplo) tudo fica como estava: secção do contrato e sem nota", () => {
    abrir(negocioBase("n1", { ...base, proposta: { estado: "aceite" }, contrato: { estado: "pendente" } }));
    expect(seccaoContrato()).not.toBeNull();
    expect(screen.queryByText(/os contratos não se usam aqui/)).toBeNull();
  });
});
