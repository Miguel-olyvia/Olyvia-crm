// "Registos ligados" de um negócio, na ficha: o que já está ligado, o que está por ligar, e ligar e desligar com o negócio aberto
// (num negócio terminado vê-se, mas não se altera). Usa os registos de exemplo (a Zita tem contacto, visita e levantamento ligados e um
// contacto novo por ligar), em memória.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AnuncioFichaContext } from "@/components/ficha-comum/anuncioFicha";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { iniciarRegistos, registosAtuais, repor } from "@/components/negocio-metas/registosPessoa";
import { dia } from "./exemploVariadoApoio";
import { textoDiaCompleto } from "./formatoPessoas";
import { NEGOCIOS_VARIADO } from "./negociosExemploVariado";
import { REGISTOS_EXEMPLO } from "./registosExemplo";
import { RegistosLigadosNegocio } from "./RegistosLigadosNegocio";

vi.mock("@/hooks/useTranslation", () => import("@/test/traducoesPessoasTeste").then((m) => m.moduloDeTraducao()));

const negocio = (id: string): NegocioMes => NEGOCIOS_VARIADO.find((n) => n.id === id) as NegocioMes;
const ZITA = negocio("vn-zita-con");
const data = (dias: number) => textoDiaCompleto(dia(dias));

const mostrar = (n: NegocioMes, aberto = true, anunciar = vi.fn()) => {
  render(<AnuncioFichaContext.Provider value={anunciar}><RegistosLigadosNegocio negocio={n} aberto={aberto} /></AnuncioFichaContext.Provider>);
  return anunciar;
};

beforeEach(() => { repor(); iniciarRegistos(REGISTOS_EXEMPLO); });
afterEach(() => { cleanup(); repor(); });

describe("RegistosLigadosNegocio", () => {
  it("lista o que está ligado a este negócio (contacto, visita e levantamento) e o que está por ligar", () => {
    mostrar(ZITA);
    expect(screen.getByText(`Contacto de ${data(-40)}`)).toBeInTheDocument();
    expect(screen.getAllByText(`Visita de ${data(-36)}`)).toHaveLength(1);
    expect(screen.getByText(`Levantamento de ${data(-36)}`)).toBeInTheDocument();
    // O contacto novo da Zita ainda não está ligado a nenhum negócio.
    expect(screen.getByRole("button", { name: `Ligar a este negócio: Contacto de ${data(-2)}` })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Desligar do negócio:/ })).toHaveLength(3);
  });

  it("ligar um registo por ligar liga-o a este negócio, sem o copiar, e anuncia-o", () => {
    const anunciar = mostrar(ZITA);
    fireEvent.click(screen.getByRole("button", { name: `Ligar a este negócio: Contacto de ${data(-2)}` }));
    const contacto = registosAtuais().contactos.find((c) => c.id === "rcl-5");
    expect(contacto?.negocioId).toBe("vn-zita-con");
    expect(registosAtuais().contactos).toHaveLength(REGISTOS_EXEMPLO.contactos.length);
    expect(anunciar).toHaveBeenCalledWith(`Contacto de ${data(-2)} ligado ao negócio.`);
    expect(screen.getByText("A pessoa não tem mais nada por ligar.")).toBeInTheDocument();
  });

  it("desligar um registo tira-o do negócio e volta a pô-lo por ligar", () => {
    const anunciar = mostrar(ZITA);
    fireEvent.click(screen.getByRole("button", { name: `Desligar do negócio: Levantamento de ${data(-36)}` }));
    expect(registosAtuais().levantamentos.find((l) => l.id === "rll-3")?.negocioId).toBeNull();
    expect(anunciar).toHaveBeenCalledWith(`Levantamento de ${data(-36)} desligado do negócio.`);
    expect(screen.getByRole("button", { name: `Ligar a este negócio: Levantamento de ${data(-36)}` })).toBeInTheDocument();
  });

  it("um negócio sem nada ligado di-lo, e mostra o que a pessoa tem por ligar", () => {
    mostrar(negocio("vn-pascoal-prop"));
    expect(screen.getByText("Ainda não há nada ligado a este negócio.")).toBeInTheDocument();
    // A Pascoal tem uma visita feita e outra por fazer, ainda sem negócio.
    const porLigar = screen.getAllByRole("button", { name: /^Ligar a este negócio: Visita/ });
    expect(porLigar.length).toBeGreaterThanOrEqual(2);
  });

  it("um negócio terminado mostra os registos, mas sem botões de ligar nem de desligar", () => {
    mostrar(ZITA, false);
    expect(screen.getByText(`Contacto de ${data(-40)}`)).toBeInTheDocument();
    expect(within(document.body).queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("O negócio já terminou: as ligações já não se alteram.")).toBeInTheDocument();
  });
});
