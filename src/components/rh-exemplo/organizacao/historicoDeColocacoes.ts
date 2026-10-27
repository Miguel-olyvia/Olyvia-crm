/**
 * O historico de ligacoes de UMA pessoa, derivado das linhas de `pessoas_colocacao_organograma` (todas, abertas e fechadas).
 *
 * Regra:
 *  - a 1a linha e um «ligar» (data = `valido_de`);
 *  - uma linha com sucessora colada (o `valido_ate` da anterior e a vespera do `valido_de` da seguinte, como grava o
 *    «Alterar») e um «alterar»: de/para = filiais consecutivas, data = `valido_de` da sucessora, motivo da sucessora;
 *  - uma linha fechada cuja sucessora nao esta colada (ha intervalo) ou que nao tem sucessora e ja terminou
 *    (`valido_ate` anterior a hoje) e um «desligar»: data = `valido_ate`, motivo = o da propria linha; uma sucessora
 *    depois do intervalo e um novo «ligar».
 *
 * A colocacao so guarda a filial (nao o centro, que vive na ficha): o destino leva `centroId: ""` e o `filialId` e `""`
 * quando a linha esta «sem classificacao» (`organograma_node_id` nulo).
 */
import type { DestinoLigacao, EventoLigacao } from "@/components/rh-exemplo/organizacao/tipos";

export interface LinhaColocacao {
  id: string;
  organograma_node_id: string | null;
  valido_de: string;
  valido_ate: string | null;
  motivo: string | null;
}

const MS_DIA = 24 * 60 * 60 * 1000;

function diaAnterior(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) - MS_DIA).toISOString().slice(0, 10);
}

export function eventosDeColocacoes(
  pessoaId: string,
  linhas: readonly LinhaColocacao[],
  empresaId: string,
  hoje: string,
): EventoLigacao[] {
  const ordenadas = [...linhas].sort((a, b) => a.valido_de.localeCompare(b.valido_de));
  const destino = (l: LinhaColocacao): DestinoLigacao => ({ empresaId, filialId: l.organograma_node_id ?? "", centroId: "" });
  const eventos: EventoLigacao[] = [];
  let ligada = false;

  ordenadas.forEach((l, i) => {
    const anterior = ordenadas[i - 1];
    if (!ligada) {
      eventos.push({
        id: `${l.id}:ligar`, pessoaId, data: l.valido_de, tipo: "ligar", de: null, para: destino(l), motivo: l.motivo ?? "",
      });
      ligada = true;
    } else if (anterior) {
      eventos.push({
        id: `${l.id}:alterar`, pessoaId, data: l.valido_de, tipo: "alterar", de: destino(anterior), para: destino(l), motivo: l.motivo ?? "",
      });
    }
    const seguinte = ordenadas[i + 1];
    if (l.valido_ate === null) return;
    const colada = seguinte !== undefined && diaAnterior(seguinte.valido_de) <= l.valido_ate;
    if (colada) return;
    if (seguinte === undefined && l.valido_ate >= hoje) return;
    eventos.push({
      id: `${l.id}:desligar`, pessoaId, data: l.valido_ate, tipo: "desligar", de: destino(l), para: null, motivo: l.motivo ?? "",
    });
    ligada = false;
  });

  return eventos;
}
