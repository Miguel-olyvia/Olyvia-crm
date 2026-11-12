// 11/11/2026: uma obra em curso de exemplo para o Estúdio da obra (a demonstração sem conta e os testes). O negócio 1027 do seed (Tiago
// Almeida) chega pago e com o plano; põe-se a obra a andar no 5.º dia útil, com um pouco de tudo o que o Estúdio trata: uma tarefa
// validada, uma por validar, uma atrasada, uma parada por um imprevisto à espera da proposta, a montagem adiada (folga para adiantar),
// o montador noutra obra num dos dias dela e uma mensagem do cliente por ler.
import { acoes, seed, type Estado, type Negocio } from "../motor";
import { FINANCEIRO, emFalta } from "../campos";
import { fotoExemplo } from "../obraOps";
import { guardarBase } from "../ajustesPlano";
import { gerarEncCliente } from "../preparacaoObra";
import { PROJETO_EXEMPLO } from "@/pages/prototipo-estudio/exemploEstudio";

export const ID_EXEMPLO_OBRA = 1027;
export const INICIO_EXEMPLO = "2026-11-04";

export function obraDeExemplo(): { S: Estado; d: Negocio } {
  const S = seed();
  const d = S.deals.find((x) => x.id === ID_EXEMPLO_OBRA)!;
  for (let i = 0; i < 4; i++) for (const c of emFalta(FINANCEIRO, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-11-03" : "x";
  const A = acoes(S, () => {}, (fn) => fn());
  S.role = "financeiro"; A.emitir(d.id); A.validar(d.id); S.role = "operacoes";
  d.f.retif_aceite = "2026-11-03";
  const p = d.obra.plano!;
  p.inicio = INICIO_EXEMPLO;
  guardarBase(p);
  p.estado = "em curso";
  p.dia = 4; // ter, 10 nov
  const [dem, can, rev, pav, mont] = p.tasks;
  const q = (dia: number, h = "17:30") => `${["qua 4/11", "qui 5/11", "sex 6/11", "seg 9/11", "ter 10/11"][dia] ?? "hoje"} ${h}`;
  // a demolição acabou e está validada
  if (dem) dem.exec = { estado: "validada", horas: 6, fotos: [fotoExemplo(dem.nome, "#b45309", 0)], validada: q(0, "18:10"),
    envios: [{ q: q(0), dia: 0, quem: "João Silva", k: "feita", horas: 6, fotos: [fotoExemplo(dem.nome, "#b45309", 0)], nota: "Tudo picado até ao tijolo" }, { q: q(0, "18:10"), dia: 0, quem: "Filipe Rocha", k: "validada" }] };
  // a canalização está feita, à espera da validação
  if (can) can.exec = { estado: "feita", horas: 4, fotos: [fotoExemplo(can.nome, "#0e7490", 1), fotoExemplo(can.nome, "#0e7490", 2)], feita: q(1),
    envios: [{ q: q(1), dia: 1, quem: "Marco Antunes", k: "feita", horas: 4, fotos: [fotoExemplo(can.nome, "#0e7490", 1), fotoExemplo(can.nome, "#0e7490", 2)], nota: "Ensaio de pressão feito, 30 min sem perdas" }] };
  // o revestimento devia ter acabado ontem e ainda está a meio
  if (rev) rev.exec = { estado: "em curso", horas: 9, fotos: [fotoExemplo(rev.nome, "#7c5ce0", 0)],
    envios: [{ q: q(1, "18:00"), dia: 1, quem: "Sérgio Faria", k: "registo", horas: 4, fotos: [fotoExemplo(rev.nome, "#7c5ce0", 0)], nota: "Impermeabilização e primeira fiada" }, { q: q(2, "18:00"), dia: 2, quem: "Sérgio Faria", k: "registo", horas: 5, fotos: [], nota: "Paredes do duche" }] };
  // a montagem tinha dois dias de intervalo (à espera dos móveis, que já chegaram): há folga para adiantar
  if (mont) mont.dia = Math.max(mont.dia, 7);
  // o pavimento parou por um imprevisto: betonilha solta por baixo do pavimento antigo
  const ip = pav ? p.tasks.indexOf(pav) : -1;
  if (ip >= 0) A.registarImprevisto(d.id, { texto: "Betonilha solta por baixo do pavimento antigo", onde: "Chão junto à base de duche", grav: "impede", tarefas: [ip], fotos: [fotoExemplo("Betonilha solta", "#be185d", 1)], custo: 380 });
  // o montador está noutra obra (Marta Lima) no último dia da montagem (adiantar a montagem resolve)
  const outra = S.deals.find((x) => x.id === 1022);
  const op = outra?.obra.plano;
  if (op && mont?.tec) {
    op.inicio = INICIO_EXEMPLO; op.dia = 4; op.origem = "orcamento";
    const ult = op.tasks[op.tasks.length - 1];
    ult.tec = mont.tec; ult.dia = mont.dia + 3; ult.dur = 1;
  }
  // a encomenda de cliente: tudo reservado no armazém, menos o último produto da visita (ainda não chegou)
  if (!d.obra.ec) {
    const ec = gerarEncCliente(d, S, "EC-2026-0099", "sex 6/11");
    ec.linhas.forEach((l) => { l.res = l.q; l.falta = 0; });
    const ult = [...ec.linhas].reverse().find((l) => l.de === "produto") ?? ec.linhas[ec.linhas.length - 1];
    if (ult) { ult.res = 0; ult.falta = ult.q; }
    d.obra.ec = ec;
  }
  // 12/11: o projeto do Estúdio do projeto (o de exemplo), para o 3D do Estúdio da obra
  if (!d.f.estudio) d.f.estudio = JSON.stringify({ ...PROJETO_EXEMPLO, nome: d.nome, negocio: d.id });
  (d.obra.chat ??= []).push({ de: "cliente", quem: d.nome, t: "Bom dia! Amanhã chegam a que horas? Tenho de sair às 10h.", q: "ter 10/11 08:47" });
  return { S, d };
}
