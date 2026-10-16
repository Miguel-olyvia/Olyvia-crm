/**
 * Os estados da admissao (V2, migration 20261210420000) e o que cada um permite
 * ao RH. A lista dos 11 estados e a do CHECK `pessoas_convites_admissao_estado_valido`;
 * `terminado` e o estado mascarado que `rpc_hr_convite_admissao_resumo` devolve
 * a quem nao tem `hr.onboarding.restrito` quando o processo foi cancelado ou
 * rejeitado.
 */
import { describe, expect, it } from "vitest";
import {
  ESTADOS_ADMISSAO,
  cancelarExigeAprovar,
  estadoAdmissaoDe,
  estadoPortalDe,
  podeCancelar,
  podeProlongar,
  processoAberto,
} from "@/lib/hr/estadoAdmissao";

describe("estadoAdmissaoDe", () => {
  it("conhece exactamente os 11 estados do CHECK da base", () => {
    expect([...ESTADOS_ADMISSAO].sort()).toEqual(
      [
        "a_aguardar_assinaturas",
        "a_aguardar_ativacao",
        "aprovada",
        "assinaturas_concluidas",
        "cancelada",
        "concluida",
        "convidada",
        "devolvida",
        "em_preenchimento",
        "rejeitada",
        "submetida",
      ].sort(),
    );
  });

  it.each([...ESTADOS_ADMISSAO, "terminado"])("%s mantem-se", (estado) => {
    expect(estadoAdmissaoDe(estado)).toBe(estado);
  });

  it.each(["pendente", "usado", "expirado", "revogado", "bloqueado", "algo_novo", "", null, undefined, 3])(
    "o valor %s (que a V2 nao devolve) e desconhecido, nunca um estado inventado",
    (valor) => {
      expect(estadoAdmissaoDe(valor)).toBe("desconhecido");
    },
  );
});

describe("estadoPortalDe", () => {
  it.each(["ativo", "expirado", "revogado", "encerrado"])("%s mantem-se", (estado) => {
    expect(estadoPortalDe(estado)).toBe(estado);
  });

  it.each(["", "aberto", null, undefined])("%s e desconhecido", (valor) => {
    expect(estadoPortalDe(valor)).toBe("desconhecido");
  });
});

describe("processoAberto", () => {
  it.each([
    "convidada",
    "em_preenchimento",
    "submetida",
    "devolvida",
    "aprovada",
    "a_aguardar_assinaturas",
    "assinaturas_concluidas",
    "a_aguardar_ativacao",
  ] as const)("%s esta aberto", (estado) => {
    expect(processoAberto(estado)).toBe(true);
  });

  it.each(["concluida", "rejeitada", "cancelada", "terminado"] as const)("%s ja nao esta aberto", (estado) => {
    expect(processoAberto(estado)).toBe(false);
  });

  it("desconhecido nao se trata como fechado: nao se sabe", () => {
    expect(processoAberto("desconhecido")).toBe(true);
  });
});

describe("podeProlongar", () => {
  it.each(["convidada", "em_preenchimento", "devolvida"] as const)("%s com portal ativo ou expirado", (estado) => {
    expect(podeProlongar(estado, "ativo")).toBe(true);
    expect(podeProlongar(estado, "expirado")).toBe(true);
  });

  it.each(["submetida", "aprovada", "a_aguardar_assinaturas", "concluida", "rejeitada", "cancelada", "terminado", "desconhecido"] as const)(
    "%s nunca",
    (estado) => {
      expect(podeProlongar(estado, "ativo")).toBe(false);
    },
  );

  it("um portal revogado, encerrado ou desconhecido nao se reabre", () => {
    for (const portal of ["revogado", "encerrado", "desconhecido"] as const) {
      expect(podeProlongar("convidada", portal)).toBe(false);
    }
  });
});

describe("cancelarExigeAprovar / podeCancelar", () => {
  it.each(["aprovada", "a_aguardar_assinaturas", "assinaturas_concluidas", "a_aguardar_ativacao"] as const)(
    "%s: cancelar desfaz a aprovacao e exige hr.onboarding.approve",
    (estado) => {
      expect(cancelarExigeAprovar(estado)).toBe(true);
      expect(podeCancelar(estado, { podeAprovar: false })).toBe(false);
      expect(podeCancelar(estado, { podeAprovar: true })).toBe(true);
    },
  );

  it.each(["convidada", "em_preenchimento", "submetida", "devolvida"] as const)(
    "%s: basta a permissao de enviar",
    (estado) => {
      expect(cancelarExigeAprovar(estado)).toBe(false);
      expect(podeCancelar(estado, { podeAprovar: false })).toBe(true);
    },
  );

  it.each(["concluida", "rejeitada", "cancelada", "terminado", "desconhecido"] as const)(
    "%s: nao ha nada a cancelar",
    (estado) => {
      expect(podeCancelar(estado, { podeAprovar: true })).toBe(false);
    },
  );
});
