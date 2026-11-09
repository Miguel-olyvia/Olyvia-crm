import { describe, expect, it } from "vitest";
import { rhExemploDesviosTranslations } from "@/translations/rhExemploDesvios";
import {
  CHAVES_DE_ERRO_DESVIOS,
  chaveDoErroDesvios,
  chavesDeDesviosPorPessoa,
  codigoDeErroDesvios,
  desvioLidoDaLinha,
  desvioParaFila,
  naturezaDaLinha,
  podeSerHoraExtra,
  rpcDeDesviosIndisponivel,
  type LinhaDesvio,
} from "@/lib/hr/desviosBase";
import { accoesDoItem, construirItensDeDesviosAValidar, type ItemFila } from "@/lib/hr/filaDeTrabalho";

const linha = (extra: Partial<LinhaDesvio> = {}): LinhaDesvio => ({
  id: "d1",
  pessoa_id: "p1",
  data: "2026-10-12",
  estado: "a_validar",
  natureza: null,
  tipo_horario: "padrao",
  margem_min: 10,
  planeado_min: 540,
  realizado_min: 600,
  fora_min: 60,
  em_falta_min: 0,
  diferenca_min: 60,
  desvio_horario_min: 0,
  realizado_inicio: "09:00:00",
  realizado_fim: "19:00:00",
  decisao: null,
  motivo: null,
  decidido_por: null,
  decidido_em: null,
  substitui_id: null,
  created_at: "2026-10-13T00:00:00Z",
  ...extra,
});

describe("naturezaDaLinha e desvioParaFila", () => {
  it("diferenca positiva = hora_extra; negativa = tempo_a_menos; zero = desvio_horario", () => {
    expect(naturezaDaLinha({ natureza: null, diferenca_min: 30, desvio_horario_min: 0 })).toBe("hora_extra");
    expect(naturezaDaLinha({ natureza: null, diferenca_min: -30, desvio_horario_min: 0 })).toBe("tempo_a_menos");
    expect(naturezaDaLinha({ natureza: null, diferenca_min: 0, desvio_horario_min: 30 })).toBe("desvio_horario");
  });

  it("a natureza que a base devolve manda", () => {
    expect(naturezaDaLinha({ natureza: "desvio_horario", diferenca_min: 30, desvio_horario_min: 0 })).toBe("desvio_horario");
  });

  it("mapeia para DesvioAValidar com as duas medidas e o horario picado", () => {
    const d = desvioParaFila(linha());
    expect(d).toMatchObject({
      id: "d1",
      pessoaId: "p1",
      data: "2026-10-12",
      natureza: "hora_extra",
      minutos: 60,
      horaInicio: "09:00:00",
      horaFim: "19:00:00",
      planeadoMin: 540,
      realizadoMin: 600,
      diferencaMin: 60,
      desvioHorarioMin: 0,
      margemMin: 10,
    });
  });

  it("tempo a menos: os minutos sao o modulo da diferenca; desvio de horario: o desvio de horario", () => {
    expect(desvioParaFila(linha({ diferenca_min: -25, realizado_min: 515 })).minutos).toBe(25);
    const h = desvioParaFila(linha({ diferenca_min: 0, desvio_horario_min: 30, realizado_min: 540 }));
    expect(h).toMatchObject({ natureza: "desvio_horario", minutos: 30 });
  });
});

describe("desvioLidoDaLinha", () => {
  it("uma versao substituida nao conta; as outras sim", () => {
    expect(desvioLidoDaLinha(linha({ estado: "substituido" }))).toBeNull();
    expect(desvioLidoDaLinha(linha({ estado: "validado", decisao: "normal" }))).toMatchObject({ estado: "validado", decisao: "normal", planeado_min: 540 });
  });
});

describe("podeSerHoraExtra", () => {
  it("so com diferenca > margem; sem margem conhecida nao se bloqueia aqui", () => {
    expect(podeSerHoraExtra(60, 10)).toBe(true);
    expect(podeSerHoraExtra(10, 10)).toBe(false);
    expect(podeSerHoraExtra(-30, 10)).toBe(false);
    expect(podeSerHoraExtra(undefined, 10)).toBe(true);
    expect(podeSerHoraExtra(60, null)).toBe(true);
  });
});

describe("acoes do item «desvio a validar» (accoesDoItem)", () => {
  const item = (extra: Partial<LinhaDesvio> = {}, pessoaId = "p1"): ItemFila =>
    construirItensDeDesviosAValidar([desvioParaFila(linha({ ...extra, pessoa_id: pessoaId }))])[0];
  const perm = { gerir: true, corrigir: false, faltasEdit: false, justificacaoEdit: false };
  const porId = (accoes: ReturnType<typeof accoesDoItem>) => Object.fromEntries(accoes.map((a) => [a.id, a]));

  it("com gerir, as tres accoes ficam permitidas quando a diferenca passa a margem", () => {
    const a = porId(accoesDoItem(item(), perm, "outra"));
    expect(a.validar_normal.permitida).toBe(true);
    expect(a.validar_hora_extra.permitida).toBe(true);
    expect(a.validar_aceitar_desvio.permitida).toBe(true);
  });

  it("hora extra so se a diferenca for maior que a margem: senao fica desactivada com o motivo escrito", () => {
    const a = porId(accoesDoItem(item({ diferenca_min: -25, natureza: "tempo_a_menos" }), perm, "outra"));
    expect(a.validar_hora_extra).toMatchObject({ permitida: false, porque: "rhFila.semPermissao.horaExtraSemTempo" });
    expect(a.validar_normal.permitida).toBe(true);
  });

  it("sem permissao, todas desactivadas com o motivo escrito", () => {
    const a = accoesDoItem(item(), { ...perm, gerir: false }, "outra");
    expect(a.every((x) => !x.permitida && x.porque === "rhFila.semPermissao.validar")).toBe(true);
  });

  it("ninguem valida os proprios desvios: desactivadas, com o motivo proprio", () => {
    const a = accoesDoItem(item(), perm, "p1");
    expect(a.every((x) => !x.permitida && x.porque === "rhFila.semPermissao.propriaValidar")).toBe(true);
  });
});

describe("erros dos desvios", () => {
  it.each([
    ["desvios_config_fora_de_intervalo: a margem tem de estar entre 0 e 120", "desvios_config_fora_de_intervalo"],
    ["desvio_validar_proprio: ninguem valida os proprios desvios.", "desvio_validar_proprio"],
    ["pessoas_desvios_periodo_fechado: o dia 2026-10-01 ja esta numa folha fechada", "pessoas_desvios_periodo_fechado"],
    ["processamento_fechar_desvios_por_validar: ha 3 dias", "processamento_fechar_desvios_por_validar"],
    ["processamento_fechar_desvios_desactualizados: ...", "processamento_fechar_desvios_desactualizados"],
  ])("%s -> %s", (mensagem, codigo) => {
    expect(codigoDeErroDesvios({ message: mensagem })).toBe(codigo);
  });

  it("55P03 e a deteccao em curso, mesmo sem o prefixo", () => {
    expect(codigoDeErroDesvios({ code: "55P03", message: "lock" })).toBe("desvios_detecao_em_curso");
  });

  it("sem codigo conhecido devolve null e a chave generica", () => {
    expect(codigoDeErroDesvios({ message: "falha de rede" })).toBeNull();
    expect(chaveDoErroDesvios(null)).toBe("rhDesvios.erro.generico");
  });

  it("reconhece uma base sem as RPCs de desvios, SO quando a funcao em falta e a chamada", () => {
    const falta = (f: string) => ({ code: "PGRST202", message: `Could not find the function public.${f}(p_organization_id) in the schema cache` });
    expect(rpcDeDesviosIndisponivel(falta("rpc_hr_desvios_listar"), "rpc_hr_desvios_listar")).toBe(true);
    expect(rpcDeDesviosIndisponivel(falta("outra_funcao"), "rpc_hr_desvios_listar")).toBe(false);
    expect(rpcDeDesviosIndisponivel({ code: "PGRST202", message: "x" }, "rpc_hr_desvios_listar")).toBe(false);
    expect(rpcDeDesviosIndisponivel({ code: "42883", message: "function rpc_hr_desvios_listar does not exist" }, "rpc_hr_desvios_listar")).toBe(true);
    expect(rpcDeDesviosIndisponivel({ code: "42501", message: "permission denied" }, "rpc_hr_desvios_listar")).toBe(false);
  });

  it("a chave dos desvios por pessoa usa so as versoes em vigor e muda quando muda a decisao ou o id", () => {
    const base = { id: "a", pessoa_id: "p1", data: "2026-10-01", estado: "a_validar", decisao: null } as LinhaDesvio;
    const antes = chavesDeDesviosPorPessoa([base, { ...base, id: "velha", estado: "substituido" }, { ...base, pessoa_id: "p2" }]);
    expect(antes.get("p1")).toBe("2026-10-01|a|a_validar|");
    expect(antes.has("p3")).toBe(false);
    const depois = chavesDeDesviosPorPessoa([{ ...base, estado: "validado", decisao: "normal" }]);
    expect(depois.get("p1")).not.toBe(antes.get("p1"));
  });
  it("toda a chave de erro tem texto em pt e en", () => {
    for (const lingua of ["pt", "en"] as const) {
      for (const chave of CHAVES_DE_ERRO_DESVIOS) {
        expect(rhExemploDesviosTranslations[lingua][chave], `${lingua}:${chave}`).toBeTruthy();
      }
    }
  });

  it("pt e en tem as mesmas chaves", () => {
    expect(Object.keys(rhExemploDesviosTranslations.en).sort()).toEqual(Object.keys(rhExemploDesviosTranslations.pt).sort());
  });
});
