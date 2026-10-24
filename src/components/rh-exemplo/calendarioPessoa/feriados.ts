/**
 * Feriados nacionais de Portugal, calculados (sem tabela por ano): as datas fixas mais as moveis ligadas a Pascoa.
 * Funcoes puras. O codigo devolvido e a chave da traducao (`rhCal.feriado.<codigo>`).
 */

/** Domingo de Pascoa (algoritmo de Meeus/Jones/Butcher), em AAAA-MM-DD. */
export function pascoa(ano: number): string {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10);
}

const FIXOS: ReadonlyArray<readonly [string, string]> = [
  ["01-01", "anoNovo"],
  ["04-25", "liberdade"],
  ["05-01", "trabalho"],
  ["06-10", "portugal"],
  ["08-15", "assuncao"],
  ["10-05", "republica"],
  ["11-01", "santos"],
  ["12-01", "restauracao"],
  ["12-08", "conceicao"],
  ["12-25", "natal"],
];

/** Data (AAAA-MM-DD) -> codigo do feriado, para um ano. */
export function feriadosDoAno(ano: number): ReadonlyMap<string, string> {
  const easter = pascoa(ano);
  const mapa = new Map<string, string>(FIXOS.map(([md, codigo]) => [`${ano}-${md}`, codigo]));
  mapa.set(somarDias(easter, -2), "sextaSanta");
  mapa.set(easter, "pascoa");
  mapa.set(somarDias(easter, 60), "corpoDeus");
  return mapa;
}

const CACHE = new Map<number, ReadonlyMap<string, string>>();

/** O codigo do feriado nacional desse dia, ou `null`. */
export function feriadoDe(iso: string): string | null {
  const ano = Number(iso.slice(0, 4));
  if (!Number.isFinite(ano)) return null;
  let doAno = CACHE.get(ano);
  if (!doAno) {
    doAno = feriadosDoAno(ano);
    CACHE.set(ano, doAno);
  }
  return doAno.get(iso) ?? null;
}
