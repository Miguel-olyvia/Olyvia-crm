// Os dias «fora do local» do calendario vem das coordenadas que a base guardou em cada picagem (pessoas_picagens.latitude e
// longitude) e das do centro de trabalho; sem coordenadas dos dois lados nao ha como medir e o dia nao se marca. Sem Supabase:
// as picagens e os centros entram por argumento.
import { describe, expect, it } from "vitest";
import { diasForaDoLocalReal, entradaMesReal, type AssiduidadeDoMes } from "./fonteMes";
import type { LocalTrabalho } from "@/components/rh-exemplo/tipos";

const LISBOA = { latitude: 38.7223, longitude: -9.1393 };
/** ~111 195 m por grau de latitude: 0,0058 graus sao cerca de 645 m. */
const A_640_METROS = { latitude: LISBOA.latitude + 640 / 111_195, longitude: LISBOA.longitude };
const A_35_METROS = { latitude: LISBOA.latitude + 35 / 111_195, longitude: LISBOA.longitude };

const LOCAL = { id: "local-1", ...LISBOA } as unknown as LocalTrabalho;
const LOCAL_SEM_COORDENADAS = { id: "local-2", latitude: null, longitude: null } as unknown as LocalTrabalho;

const picagem = (id: string, data: string, extra: Record<string, unknown> = {}) => ({
  id, pessoa_id: "pessoa-1", organization_id: "org", momento: `${data}T09:00:00Z`, data_local: data, hora_local: "09:00:00",
  sentido: "entrada", local_id: "local-1", vinculo_id: null, planeado_id: null, origem: "web", latitude: LISBOA.latitude,
  longitude: LISBOA.longitude, precisao_metros: 10, estado: "valida", realizado_id: null, corrige_picagem_id: null,
  correccao_tipo: null, correccao_motivo: null, registado_por_pessoa_id: null, anulado_em: null, anulacao_motivo: null,
  created_at: "2026-10-01T00:00:00Z", ...extra,
});

describe("diasForaDoLocalReal", () => {
  it("marca o dia de uma picagem a mais de 200 m do centro e deixa o de 35 m", () => {
    const dias = diasForaDoLocalReal(
      [picagem("p1", "2026-10-06", A_640_METROS), picagem("p2", "2026-10-07", A_35_METROS)] as never,
      [LOCAL],
    );
    expect([...dias]).toEqual(["2026-10-06"]);
  });

  it("aceita coordenadas como texto, que e como a base devolve os numeric", () => {
    const dias = diasForaDoLocalReal(
      [picagem("p1", "2026-10-06", { latitude: String(A_640_METROS.latitude), longitude: String(A_640_METROS.longitude) })] as never,
      [LOCAL],
    );
    expect(dias.has("2026-10-06")).toBe(true);
  });

  it("sem coordenadas na picagem nao ha como medir: nao marca", () => {
    const dias = diasForaDoLocalReal([picagem("p1", "2026-10-06", { latitude: null, longitude: null })] as never, [LOCAL]);
    expect(dias.size).toBe(0);
  });

  it("sem centro, ou com um centro sem coordenadas, nao marca nem inventa um ponto de referencia", () => {
    const longe = picagem("p1", "2026-10-06", A_640_METROS) as never;
    expect(diasForaDoLocalReal([longe], []).size).toBe(0);
    expect(diasForaDoLocalReal([picagem("p1", "2026-10-06", { ...A_640_METROS, local_id: "local-2" })] as never, [LOCAL_SEM_COORDENADAS]).size).toBe(0);
    expect(diasForaDoLocalReal([picagem("p1", "2026-10-06", { ...A_640_METROS, local_id: null })] as never, [LOCAL]).size).toBe(0);
  });
});

describe("entradaMesReal e os dias fora do local", () => {
  const base = { ano: 2026, mes: 10, hoje: "2026-10-20", contrato: null, tiposAusencia: [], horario: undefined, horasExtra: [], banco: [], podeHE: false };
  const assiduidade = (picagens: unknown[]) =>
    ({ picagens, realizado: [], faltas: [], ausenciaAprovadaPorDia: new Map(), planeado: [], planeadoRecusado: false }) as unknown as AssiduidadeDoMes;

  it("usa as picagens em vigor e os centros recebidos", () => {
    const entrada = entradaMesReal({ ...base, locais: [LOCAL], assiduidade: assiduidade([picagem("p1", "2026-10-06", A_640_METROS)]) });
    expect([...entrada.diasForaDoLocal]).toEqual(["2026-10-06"]);
  });

  it("uma picagem anulada ou substituida por uma correccao nao marca o dia", () => {
    const entrada = entradaMesReal({
      ...base,
      locais: [LOCAL],
      assiduidade: assiduidade([
        picagem("anulada", "2026-10-06", { ...A_640_METROS, estado: "anulada" }),
        picagem("original", "2026-10-07", A_640_METROS),
        picagem("corrigida", "2026-10-07", { ...A_35_METROS, corrige_picagem_id: "original" }),
      ]),
    });
    expect(entrada.diasForaDoLocal.size).toBe(0);
  });

  it("sem centros nenhum dia fica fora do local", () => {
    const entrada = entradaMesReal({ ...base, assiduidade: assiduidade([picagem("p1", "2026-10-06", A_640_METROS)]) });
    expect(entrada.diasForaDoLocal.size).toBe(0);
  });
});
