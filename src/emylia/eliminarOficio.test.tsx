// 17/11: «Eliminar» um ofício (perfil) no separador Técnicos do Catálogo e custos. Só com services.edit; desligado se o ofício está
// em uso em serviços; confirmar tira-o de C.perfis (na página real isso grava com cat_retirar_perfil).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acoes, seed, type Estado } from "./motor";
import { CatalogoV1 } from "./CatalogoV1";
import { lerCustos, mudarCustos, reporCustos } from "./v2/custosStore";
import { tecnicosCatalogo } from "./fichaServico";
import { ProvedorPermissoesCatalogo, type PermissoesCatalogo } from "./permissoesCatalogo";

afterEach(() => { cleanup(); reporCustos(); window.history.replaceState(null, "", "/"); });

const SO_VER: PermissoesCatalogo = { servicos: false, custos: false, produtos: false, pvp: false };
const LIVRE = { id: "pf-teste-livre", n: "Ofício de teste", salario: 1000 };

function tecnicos(perms: PermissoesCatalogo) {
  const S: Estado = seed();
  mudarCustos((c) => { c.perfis.push({ ...LIVRE }); });
  const run = vi.fn((fn: () => void) => fn());
  render(
    <ProvedorPermissoesCatalogo valor={perms}>
      <CatalogoV1 S={S} A={acoes(S, vi.fn(), run)} run={run} go={(fn) => () => run(fn)} q="" setQ={vi.fn()} repor={vi.fn()} />
    </ProvedorPermissoesCatalogo>,
  );
  fireEvent.click(screen.getByRole("tab", { name: "Técnicos" }));
  return { S, run, painel: within(screen.getByRole("tabpanel")) };
}

describe("Técnicos · Eliminar ofício", () => {
  it("sem services.edit não há «Eliminar»", () => {
    const { painel } = tecnicos(SO_VER);
    expect(painel.queryAllByRole("button", { name: /^Eliminar / })).toHaveLength(0);
  });

  it("com services.edit cada ofício tem «Eliminar» (alvo de 44px); desligado, com o motivo, se está em uso em serviços", () => {
    const { S, painel } = tecnicos({ ...SO_VER, servicos: true });
    const linhas = tecnicosCatalogo(S, lerCustos());
    expect(painel.getAllByRole("button", { name: /^Eliminar / })).toHaveLength(linhas.length);
    const livre = painel.getByRole("button", { name: `Eliminar ${LIVRE.n}` });
    expect(livre).toBeEnabled();
    expect(livre.className).toContain("min-h-11");
    const usado = linhas.find((l) => l.servicos > 0)!;
    expect(usado).toBeDefined();
    const b = painel.getByRole("button", { name: `Eliminar ${usado.p.n}` });
    expect(b).toBeDisabled();
    const motivo = document.getElementById(b.getAttribute("aria-describedby")!);
    expect(motivo?.textContent).toMatch(/em uso: não se pode eliminar$/);
    expect(b.getAttribute("title")).toBe(`Em uso em ${usado.servicos} ${usado.servicos === 1 ? "serviço" : "serviços"}: não se pode eliminar`);
  });

  it("pede confirmação; Cancelar não mexe; Eliminar tira o ofício da lista e dos custos", () => {
    const { run, painel } = tecnicos({ ...SO_VER, servicos: true });
    fireEvent.click(painel.getByRole("button", { name: `Eliminar ${LIVRE.n}` }));
    let dialogo = screen.getByRole("alertdialog");
    expect(dialogo).toHaveTextContent(`Eliminar o ofício «${LIVRE.n}»?`);
    expect(dialogo).toHaveTextContent("Esta ação não se desfaz.");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(lerCustos().perfis.some((p) => p.id === LIVRE.id)).toBe(true);

    run.mockClear();
    fireEvent.click(painel.getByRole("button", { name: `Eliminar ${LIVRE.n}` }));
    dialogo = screen.getByRole("alertdialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Eliminar" }));
    expect(run).toHaveBeenCalled();
    expect(lerCustos().perfis.some((p) => p.id === LIVRE.id)).toBe(false);
    expect(within(screen.getByRole("tabpanel")).queryByRole("button", { name: `Eliminar ${LIVRE.n}` })).toBeNull();
    expect(screen.getByText(`${LIVRE.n} eliminado`)).toBeInTheDocument();
  });
});
