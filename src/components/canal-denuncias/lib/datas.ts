// Datas do canal de denúncias: texto AAAA-MM-DD, contas sempre em UTC para não depender do fuso da máquina.

/** Hoje, nos dados de exemplo (15/10/2026). Fixo, para os prazos da apresentação não mudarem de dia para dia. */
export const HOJE_EXEMPLO = "2026-10-15";

const MS_DIA = 86_400_000;

const emUtc = (iso: string): Date => {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};

const iso = (d: Date): string => d.toISOString().slice(0, 10);

export function somarDias(data: string, dias: number): string {
  return iso(new Date(emUtc(data).getTime() + dias * MS_DIA));
}

/** Soma meses mantendo o dia; se o mês de chegada for mais curto, fica no último dia (31/05 + 1 mês = 30/06). */
export function somarMeses(data: string, meses: number): string {
  const base = emUtc(data);
  const alvo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(base.getUTCDate(), ultimo));
  return iso(alvo);
}

/** Dias de `de` até `ate` (negativo se `ate` é anterior). */
export function diasEntre(de: string, ate: string): number {
  return Math.round((emUtc(ate).getTime() - emUtc(de).getTime()) / MS_DIA);
}

/** «18/10» (ou «18/10/2026» com o ano). */
export function dataCurta(data: string, comAno = false): string {
  const [a, m, d] = data.slice(0, 10).split("-");
  return comAno ? `${d}/${m}/${a}` : `${d}/${m}`;
}

const dois = (n: number): string => String(n).padStart(2, "0");

/** O dia de hoje no fuso da máquina, como AAAA-MM-DD (a base real; os dados de exemplo usam `HOJE_EXEMPLO`). */
export function hojeLocal(agora: Date = new Date()): string {
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

/** Um instante ISO com fuso (`timestamptz` da base) como AAAA-MM-DDTHH:MM no fuso da máquina; texto inválido devolve o próprio texto. */
export function instanteLocal(isoComFuso: string): string {
  const d = new Date(isoComFuso);
  if (Number.isNaN(d.getTime())) return isoComFuso;
  return `${hojeLocal(d)}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** «15/10/2026 09:30» a partir de AAAA-MM-DDTHH:MM. */
export function dataHora(instante: string): string {
  return `${dataCurta(instante, true)} ${instante.slice(11, 16)}`.trim();
}
