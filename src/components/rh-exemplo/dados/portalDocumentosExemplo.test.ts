// Os documentos de exemplo do Portal do colaborador por token: o que cada pessoa tem em Recebidos e em Pedidos do RH. Só dados.
import { describe, expect, it } from "vitest";
import { lerAdmissoes } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { criarPortalInicial } from "@/components/rh-exemplo/dados/portalDocumentosExemplo";
import { pendentesDaPessoa } from "@/components/rh-exemplo/lib/portalDocumentos";
import { recebidosVisiveis } from "@/components/rh-exemplo/lib/portalEstado";

describe("os dados de exemplo por token", () => {
  const dados = criarPortalInicial();
  const adm = (id: string) => lerAdmissoes().porPessoa[id];
  const visiveis = (id: string) => recebidosVisiveis(dados.porPessoa[id]?.recebidos ?? [], adm(id));

  it("exemplo: 3 pedidos do RH por enviar e um regulamento; contrato: contrato por assinar e 2 pedidos por enviar", () => {
    expect(dados.porPessoa["p-beatriz"].pedidosRh.map((p) => p.estado)).toEqual(["por_enviar", "por_enviar", "por_enviar"]);
    expect(dados.porPessoa["p-beatriz"].recebidos.map((d) => d.titulo)).toEqual(["Regulamento interno"]);
    expect(visiveis("p-vasco").map((d) => [d.titulo, d.assinadoEm])).toEqual([["Contrato de trabalho sem termo", null], ["Política de privacidade", null]]);
    expect(dados.porPessoa["p-vasco"].pedidosRh.filter((p) => p.estado === "por_enviar")).toHaveLength(2);
  });

  it("assinado: contrato assinado e um pedido aceite; submetida: todos os pedidos enviados à espera de aceitação", () => {
    expect(visiveis("p-eva")[0].assinadoEm).not.toBeNull();
    expect(dados.porPessoa["p-eva"].pedidosRh.map((p) => p.estado)).toEqual(["aceite"]);
    expect(dados.porPessoa["p-marco"].pedidosRh.every((p) => p.estado === "enviado" && p.ficheiros.length > 0)).toBe(true);
    expect(pendentesDaPessoa(visiveis("p-eva"), dados.porPessoa["p-eva"].pedidosRh)).toBe(0);
  });

  it("devolvida: um pedido recusado com motivo; e ninguém passa de 4 ficheiros por pedido", () => {
    expect(dados.porPessoa["p-nadia"].pedidosRh.find((p) => p.estado === "recusado")?.motivoRecusa).toMatch(/titular/);
    for (const p of Object.values(dados.porPessoa)) {
      for (const x of p.pedidosRh) expect(x.ficheiros.length).toBeLessThanOrEqual(4);
    }
  });
});
