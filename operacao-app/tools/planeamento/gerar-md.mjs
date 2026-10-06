/**
 * A tabela legível dos tempos padrão: docs/tempos-padrao.md, a partir de dados.mjs.
 *
 *   node tools/planeamento/gerar-md.mjs              → escreve docs/tempos-padrao.md
 *   node tools/planeamento/gerar-md.mjs --verificar  → falha se o ficheiro não estiver igual
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FASES, MEDIDAS, WC, COZ, EXTRAS } from "./dados.mjs";

const SAIDA = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "tempos-padrao.md");
const n = (x) => String(x).replace(".", ",");
const h = (min) => {
  const v = Math.round(min * 10) / 10;
  return `${n(v)} h`;
};
const cel = (s) => String(s ?? "").replace(/\|/g, "/").replace(/\n/g, " ");

function referencia(pacote) {
  return Object.fromEntries(MEDIDAS[pacote].map(([m, v]) => [m, v]));
}

function tabelaPacote(titulo, pacote, linhas) {
  const ref = referencia(pacote);
  let total = 0;
  const corpo = linhas.map(([cod, nome, fase, oficio, deps, espera, origem, cond, , alt, pes, fix, vari, med, base]) => {
    const q = med === "só fixo" ? 0 : ref[med] ?? 0;
    const horas = fix + vari * q;
    total += horas / pes;
    return `| ${cod} | ${cel(nome)} | ${fase} | ${cel(oficio)} | ${deps.join(", ") || "—"} | ${espera ? `${espera} h` : ""} | ${pes} | ${n(fix)} | ${vari ? `${n(vari)} / ${cel(med)}` : "—"} | ${h(horas)} | ${cel(cond)} | ${cel(base)} |`;
  });
  return [
    `## ${titulo}`,
    "",
    `Medidas de referência (quando a visita não mede): ${MEDIDAS[pacote].map(([m, v]) => `${m} ${n(v)}`).join(" · ")}.`,
    "",
    "| Cód. | Tarefa | Fase | Ofício | Depois de | Espera | Pessoas | Horas fixas | Horas por medida | Horas-pessoa (ref.) | Condição | Base da estimativa |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
    ...corpo,
    "",
    `Soma dos dias de trabalho (horas-pessoa ÷ pessoas ÷ 8, sem paralelos nem esperas): ${n(Math.round((total / 8) * 10) / 10)} dias.`,
    "",
  ].join("\n");
}

function tabelaExtras() {
  return [
    "## Extras",
    "",
    "Encaixe: `X.Y` = junta-se ao passo X.Y do pacote (soma-lhe o tempo); `Entre X e Y` = tarefa própria entre os dois;",
    "`X + Y` = metade em cada; `Antes da obra` = não é trabalho no local (não dá tarefa).",
    "",
    "| Pacote | Serviço | Orçamentos | Qt mediana | Encaixe | Ofício | Horas fixas | Horas por unidade | Nota |",
    "|---|---|---|---|---|---|---|---|---|",
    ...EXTRAS.map(([pac, serv, nOrc, qt, un, enc, nota, of, fix, vari]) =>
      `| ${pac} | ${cel(serv)} | ${nOrc} | ${n(qt)} ${cel(un)} | ${cel(enc)} | ${cel(of)} | ${n(fix)} | ${n(vari)} | ${cel(nota)} |`),
    "",
  ].join("\n");
}

const md = [
  "# Tempos padrão — remodelação de casa de banho e de cozinha",
  "",
  "> Gerado por `tools/planeamento/gerar-md.mjs` a partir de `tools/planeamento/dados.mjs` — não editar à mão.",
  "> Os tempos são o ponto de partida validado a 03/10/2026; cada organização afina-os em Obras → Modelos e o",
  "> motor corrige-os com o real (ver [planeamento.md](planeamento.md)).",
  "",
  `Fases: ${Object.values(FASES).join(" · ")}.`,
  "",
  tabelaPacote("Casa de banho — Remodelação Completa", "Casa de banho", WC),
  tabelaPacote("Cozinha — Remodelação Completa", "Cozinha", COZ),
  "Os modelos parciais de casa de banho (0–3) e a mudança de mobiliário de cozinha são subconjuntos destes passos",
  "(ver `gerar-semente.mjs`).",
  "",
  tabelaExtras(),
].join("\n");

if (process.argv[2] === "--verificar") {
  const atual = existsSync(SAIDA) ? readFileSync(SAIDA, "utf8").replace(/\r\n/g, "\n") : "";
  if (atual !== md) {
    console.error("✗ docs/tempos-padrao.md não está igual a dados.mjs — corre gerar-md.mjs");
    process.exit(1);
  }
  console.log("✓ docs/tempos-padrao.md está igual a dados.mjs");
} else {
  writeFileSync(SAIDA, md);
  console.log("✓ docs/tempos-padrao.md escrito");
}
