import type { FichaTecnicaEdificio } from "./fichaTecnicaEdificio";

/**
 * Os campos da ficha do local que o planeamento da obra mais usa (duração
 * das tarefas, proteções, logística). Nenhum é obrigatório: isto só serve
 * para dizer, com discrição, o que falta — o mesmo critério de
 * rpc_ops_obra_dados_em_falta nas Operações.
 */
const CHAVE: { campo: keyof FichaTecnicaEdificio; rotulo: string }[] = [
  { campo: "acesso", rotulo: "acesso" },
  { campo: "estacionamento", rotulo: "estacionamento" },
  { campo: "tem_elevador", rotulo: "elevador" },
  { campo: "habitada_durante_obra", rotulo: "casa habitada" },
  { campo: "pavimento", rotulo: "pavimento" },
];

/** A ficha tem alguma coisa preenchida (senão é "por preencher", não "incompleta"). */
export function fichaComDados(ficha: Partial<FichaTecnicaEdificio> | null | undefined): boolean {
  if (!ficha) return false;
  return Object.values(ficha).some((v) => v !== null && v !== undefined && v !== "");
}

/**
 * O que falta, por extenso ("estacionamento", "elevador", "andar"…). Vazio se
 * a ficha estiver vazia (aí diz-se "por preencher") ou completa.
 */
export function camposEmFaltaFicha(
  ficha: Partial<FichaTecnicaEdificio> | null | undefined,
  piso?: string | null,
): string[] {
  if (!fichaComDados(ficha)) return [];
  const f = ficha as Partial<FichaTecnicaEdificio>;
  const falta = CHAVE.filter(({ campo }) => f[campo] === null || f[campo] === undefined || f[campo] === "").map(
    ({ rotulo }) => rotulo,
  );
  if (!(piso ?? "").trim()) falta.push("andar");
  return falta;
}
