// A fonte em memória cumpre o contrato `FonteDenuncias` com a loja de exemplo (é o que vale nos testes, nunca na app real).
import { beforeEach, describe, expect, it } from "vitest";
import { FORMULARIO_VAZIO } from "../lib/formulario";
import { fonteMemoria } from "./fonteMemoria";
import { lerDenuncias, repor } from "./loja";
import { ORG_ATIVA } from "./organizacoes";

beforeEach(() => repor());

describe("fonteMemoria", () => {
  it("é a fonte de exemplo: modo «memoria», anexos simulados e o dia fixo dos dados de exemplo", () => {
    expect(fonteMemoria.modo).toBe("memoria");
    expect(fonteMemoria.anexosReais).toBe(true);
    expect(fonteMemoria.hoje()).toBe("2026-10-15");
  });

  it("as ações são assíncronas e devolvem o erro em vez de lançar", async () => {
    expect(await fonteMemoria.confirmarRececaoDe("nao-existe")).toEqual({ ok: false, erro: "transicao_invalida" });
    expect(await fonteMemoria.notaEm("d0039", "  ")).toEqual({ ok: false, erro: "texto_vazio" });
    expect((await fonteMemoria.confirmarRececaoDe("d0041")).ok).toBe(true);
  });

  it("ver a identidade exige motivo (como a base) e uma anónima não tem identidade", async () => {
    expect(await fonteMemoria.verIdentidade("d0037", "ab")).toEqual({ ok: false, erro: "motivo_identidade" });
    expect(lerDenuncias().find((d) => d.id === "d0037")?.historico.some((e) => e.acao === "identidade_vista")).toBe(false);
    const r = await fonteMemoria.verIdentidade("d0037", "Preciso de a contactar");
    expect(r.ok).toBe(true);
    expect(await fonteMemoria.verIdentidade("d0039", "Preciso de a contactar")).toEqual({ ok: false, erro: "anonima" });
  });

  it("submeter cria na loja e devolve código e PIN; entrar só abre com o par certo", async () => {
    const r = await fonteMemoria.submeter(
      { ...FORMULARIO_VAZIO, anonima: true, tipo: "fraude", descricao: "x".repeat(40), quando: "Hoje", boaFe: true },
      { organizationId: ORG_ATIVA.id },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await fonteMemoria.entrar({ codigo: r.codigo, pin: r.pin, organizacaoId: ORG_ATIVA.id })).toMatchObject({ ok: true });
    expect(await fonteMemoria.entrar({ codigo: r.codigo, pin: "000000", organizacaoId: ORG_ATIVA.id })).toEqual({ ok: false, erro: "invalido" });
  });

  it("a configuração do canal não existe nos dados de exemplo: recusa em vez de fingir", async () => {
    expect(await fonteMemoria.guardarCanal(ORG_ATIVA.id, true, "exemplo")).toEqual({ ok: false, erro: "sem_permissao" });
    expect(await fonteMemoria.designarResponsavel(ORG_ATIVA.id, "r1")).toEqual({ ok: false, erro: "sem_permissao" });
  });
});
