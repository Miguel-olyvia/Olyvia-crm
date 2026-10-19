// Quando se oferece «Dar como ganho» a um negócio. A fonte de verdade é o `prontoAGanhar` que a base calcula por negócio (regra da
// organização: manual, proposta aceite ou contrato assinado); sem ele vale a regra local. A interface só oferece: quem decide é a
// base (NG006). Funções puras.
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { MomentoGanho } from "@/hooks/pessoas/useFontePessoas";

/** Porque não se oferece o ganho; o texto de cada um é `pessoasPagina.neg.ganhar.blocked.<motivo>`. */
export type MotivoNaoGanha = "naoAberto" | "semProposta" | "semContrato" | "semRegra";

export interface ResultadoPodeGanhar {
  pode: boolean;
  motivo: MotivoNaoGanha | null;
}

const SIM: ResultadoPodeGanhar = { pode: true, motivo: null };
const nao = (motivo: MotivoNaoGanha): ResultadoPodeGanhar => ({ pode: false, motivo });

/** O que falta, pela regra da organização (a manual e a desconhecida não têm documento em falta: a regra é que não se cumpre). */
function motivoDaRegra(momento: MomentoGanho | null): MotivoNaoGanha {
  if (momento === "proposta_aceite") return "semProposta";
  return momento === "contrato_assinado" ? "semContrato" : "semRegra";
}

function cumpreARegra(negocio: NegocioMes, momento: MomentoGanho | null): boolean {
  if (momento === "manual") return true;
  if (momento === "proposta_aceite") return negocio.proposta?.estado === "aceite";
  if (momento === "contrato_assinado") return negocio.contrato?.estado === "assinado";
  return false;
}

export function podeGanhar(negocio: NegocioMes, momento: MomentoGanho | null): ResultadoPodeGanhar {
  if (negocio.estadoReal !== "aberto") return nao("naoAberto");
  const pronto = negocio.prontoAGanhar ?? cumpreARegra(negocio, momento);
  return pronto ? SIM : nao(motivoDaRegra(momento));
}
