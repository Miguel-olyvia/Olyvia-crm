// 25/11 (Rúben: as tarefas reais da Mudelar no Infraspeak como microtarefas na Olyvia). Escolhe, para uma tarefa do plano da obra, as
// tarefas do Infraspeak que lhe correspondem (dados/infraspeakMudelar.ts): pela obra (cozinha ou casa de banho, pelo nome das tarefas do
// plano) e pelo trabalho (o nome e o ofício da tarefa: demolição, canalização, eletricidade, revestimentos, louças…). Cada tarefa do
// Infraspeak é uma microtarefa, com as horas previstas e a checklist como pontos.
import type { Plano, Tarefa } from "./motor";
import { FASES_MUDELAR, type TarefaMudelar } from "./dados/infraspeakMudelar";

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Cozinha ou casa de banho. 25/11 (obra 1048: cozinha e casa de banho na mesma obra): primeiro pelo nome da própria tarefa («MO Modelo
 *  … Cozinha · …», «Lava Loiça», «Sanita»…); sem pista nele, pelas tarefas do plano (só cozinha → cozinha; senão, casa de banho). */
const COZINHA = /cozinha|bancada|exaustor|eletrodomest|placa de|forno|lava ?lo[iu]?ca|lava-lo|armario (inferior|superior)|gaveta|pimenteiro/;
const WC = /casa de banho|\bwc\b|sanita|base de duche|lavatorio|bide|banheira|resguardo|coluna de duche|toalheiro|ventax|mobiliario wc/;
export function obraDoPlano(p?: Pick<Plano, "tasks"> | null, t?: Tarefa): "cozinha" | "wc" {
  const proprio = sem(t?.nome ?? "");
  if (COZINHA.test(proprio) && !WC.test(proprio)) return "cozinha";
  if (WC.test(proprio)) return "wc";
  const txt = sem((p?.tasks ?? []).map((x) => x.nome).join(" "));
  return COZINHA.test(txt) && !WC.test(txt) ? "cozinha" : "wc";
}

/** Os grupos do Infraspeak (o 2.º número do código) em cada tipo de obra: "todos", uma lista, ou [] (não se aplica a esse tipo). */
type Grupos = { wc: number[] | "todos"; cozinha: number[] | "todos" };
type Regra = { re: RegExp; fase: number | ((t: Tarefa) => number); grupos: Grupos | ((t: Tarefa) => Grupos) };
const montagem = (t: Tarefa) => (t.fase ?? 2) >= 4;
/** As regras, pela ordem: a primeira que casa com o nome (e o ofício) da tarefa decide a fase e os grupos do Infraspeak. */
const REGRAS: Regra[] = [
  { re: /retific|mediç|medic/, fase: 0, grupos: { wc: "todos", cozinha: "todos" } },
  { re: /entrega|book/, fase: 5, grupos: { wc: "todos", cozinha: [] } },
  { re: /limpeza|selag|retoque|silicone/, fase: 4, grupos: { wc: [4], cozinha: [4] } },
  { re: /demol|remoc|desmont|entulho|protec|picar/, fase: 1, grupos: { wc: [1, 2, 3, 4], cozinha: [1, 2, 3, 4, 5, 6] } },
  { re: /transporte|levantamento de material|armazem|carga/, fase: 1, grupos: { wc: [5], cozinha: [7] } },
  { re: /toalheiro|radiador|aquecimento|convetor/, fase: 2, grupos: { wc: [3], cozinha: [] } },
  { re: /\bgas\b/, fase: (t) => (montagem(t) ? 4 : 2), grupos: { wc: [], cozinha: [3] } },
  // lava-loiça e torneira de cozinha: as ligações de água da montagem final da cozinha (804.3)
  { re: /lava ?lo[iu]?ca|lava-lo|torneira de cozinha/, fase: 4, grupos: { wc: [2], cozinha: [3] } },
  { re: /roco|rasgo/, fase: 2, grupos: { wc: [1], cozinha: [1] } },
  { re: /canaliz|agua|esgoto|tubag|hidraul|abastecimento/, fase: 2, grupos: { wc: [1], cozinha: [1] } },
  { re: /eletr|eletric|luz|tomada|ilumin|aplique|quadro|interruptor|luminar|ventax|led/, fase: (t) => (montagem(t) ? 4 : 2),
    grupos: (t) => (montagem(t) ? { wc: [3], cozinha: [3] } : { wc: [2], cozinha: [2] }) },
  { re: /sanita|lavatorio|bide|base de duche|banheira|louca|loica/, fase: 4, grupos: { wc: [1], cozinha: [] } },
  { re: /impermeab|regulariz|betonilha|reboco|alvenaria|tijolo/, fase: 3, grupos: { wc: [1], cozinha: [1] } },
  { re: /teto|tecto|pladur|gesso|pintur|estuque|sanca|rodape/, fase: (t) => (montagem(t) && /pintur/.test(sem(t.nome)) ? 4 : 3),
    grupos: (t) => (montagem(t) && /pintur/.test(sem(t.nome)) ? { wc: [4], cozinha: [4] } : { wc: [3], cozinha: [3] }) },
  { re: /revest|azulej|ceram|pavim|ladrilh|mosaico/, fase: 3, grupos: { wc: [2], cozinha: [2] } },
  { re: /torneir|misturad|coluna|chuveiro|acessori|espelho|resguardo|toalh|movel|moveis|mobil|armario|gaveta|pimenteiro/, fase: 4, grupos: { wc: [2], cozinha: [1] } },
  { re: /bancada|modulo|tampo|carpint/, fase: 4, grupos: { wc: [], cozinha: [1] } },
  { re: /eletrodomest|exaustor|forno|placa|frigor|maquina/, fase: 4, grupos: { wc: [], cozinha: [2] } },
];

/** A tarefa do Infraspeak pela referência guardada na microtarefa («wc.2.5»: a obra, a fase e o lugar na fase). */
export function tarefaMudelar(ref: string | undefined): TarefaMudelar | null {
  const m = ref ? /^(wc|cozinha)\.(\d+)\.(\d+)$/.exec(ref) : null;
  if (!m) return null;
  return FASES_MUDELAR.find((f) => f.obra === m[1] && f.fase === +m[2])?.tarefas[+m[3]] ?? null;
}

/** As tarefas do Infraspeak para uma tarefa do plano, com a referência de cada uma (vazio se nenhuma regra casar). */
export function tarefasMudelarDe(t: Tarefa, p?: Pick<Plano, "tasks"> | null): (TarefaMudelar & { ref: string })[] {
  // o nome curto pesa primeiro («MO Modelo … · canalização» → «canalização»); o ofício só se o nome não disser nada
  const nome = sem(t.nome.split(" · ").slice(-1)[0] ?? t.nome), todo = sem(`${t.nome} ${t.sk ?? ""}`);
  const regra = REGRAS.find((r) => r.re.test(nome)) ?? REGRAS.find((r) => r.re.test(todo));
  if (!regra) return [];
  const obra = obraDoPlano(p, t);
  const fase = typeof regra.fase === "function" ? regra.fase(t) : regra.fase;
  const g = (typeof regra.grupos === "function" ? regra.grupos(t) : regra.grupos)[obra];
  const F = FASES_MUDELAR.find((f) => f.obra === obra && f.fase === fase);
  // [] = este trabalho não existe neste tipo de obra (louças numa cozinha): nenhuma (antes contava como «todas»)
  if (!F || (g !== "todos" && !g.length)) return [];
  return F.tarefas.map((x, k) => ({ ...x, ref: `${obra}.${fase}.${k}` })).filter((x) => g === "todos" || g.includes(x.g));
}
