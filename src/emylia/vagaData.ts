// 19/11 (auditoria): a vaga da visita com a data completa. Antes o motor tirava o dia do texto da vaga («qui 15/10 · 10:00») e punha-lhe
// sempre 2026 (MESES_DIA): uma visita marcada para janeiro ficava no ano errado. Agora quem marca passa a data ISO («2027-01-14») e a hora;
// o texto fica só para mostrar. Os negócios antigos, com o texto sem ano, continuam a ler-se: o ano é o que põe a data mais perto no futuro.

/** Uma vaga para a visita: o dia em ISO («aaaa-mm-dd») e a hora («10:00»). */
export interface Vaga { data: string; hora: string }

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const dois = (n: number) => String(n).padStart(2, "0");
/** O dia de uma data local, em ISO. */
export const isoDoDia = (d: Date): string => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
const dataValida = (a: number, m: number, d: number): Date | null => {
  const x = new Date(a, m - 1, d);
  return x.getFullYear() === a && x.getMonth() === m - 1 && x.getDate() === d ? x : null;
};

/** «2027-01-14» e «10:00» → «qui 14/01 · 10:00», o texto que se mostra (o mesmo formato de sempre). */
export function rotuloVaga(v: Vaga): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.data);
  if (!m) return v.hora;
  const x = dataValida(Number(m[1]), Number(m[2]), Number(m[3]));
  return `${x ? SEMANA[x.getDay()] + " " : ""}${m[3]}/${m[2]} · ${v.hora}`;
}

/** Lê a vaga de um texto. Com a data ISO («2027-01-14 · 10:00»), tal e qual. Com o texto antigo sem ano («qui 15/10 · 10:00»), o ano é o
 *  que põe o dia mais perto no futuro, a contar de `hoje` (hoje conta). `null` se o texto não tem dia e hora. */
export function lerVaga(texto: string, hoje = new Date()): Vaga | null {
  const hora = /(\d{1,2}):(\d{2})(?!.*\d{1,2}:\d{2})/.exec(texto);
  const h = hora ? `${dois(Number(hora[1]))}:${hora[2]}` : "";
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso && dataValida(Number(iso[1]), Number(iso[2]), Number(iso[3]))) return h ? { data: iso[0], hora: h } : null;
  const m = /(\d{1,2})\/(\d{1,2})(?!\/\d)/.exec(texto);
  if (!m || !h) return null;
  const dia = Number(m[1]), mes = Number(m[2]);
  const base = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  // o primeiro ano (deste em diante) em que o dia existe e não ficou para trás; 29/02 salta para o próximo ano bissexto
  for (let a = hoje.getFullYear(); a <= hoje.getFullYear() + 8; a++) {
    const x = dataValida(a, mes, dia);
    if (x && x >= base) return { data: isoDoDia(x), hora: h };
  }
  return null;
}

/** A vaga, venha como objeto (a data completa) ou como texto (lido por `lerVaga`). */
export const vagaDe = (v: string | Vaga, hoje = new Date()): Vaga | null => (typeof v === "string" ? lerVaga(v, hoje) : v.data ? v : null);
