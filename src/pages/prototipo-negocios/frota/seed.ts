// Os dados de exemplo da Frota (função seed() do protótipo HTML), ligados ao resto do protótipo:
// - os condutores técnicos são os técnicos do motor (TECS: João Silva, Rui Alves, Marco Antunes, Sérgio Faria, Hugo Neves, Paulo Mota) e o comercial é o Rúben;
// - as obras são as do Estado de exemplo (#1022 Marta Lima, em curso; #1050 Joana Ribeiro, concluída) e as "ordens" são as tarefas do plano delas;
// - as carrinhas com armazém são os armazéns do tipo "viatura" do Inventário (inventario/carrinhas.ts, CARRINHAS);
// - a AA-12-BC é a "Carrinha Renault Master" dos recursos da Agenda (Definições › Agenda).
// Datas fixas: hoje é 14/10/2026. Tudo inventado.
import { CARRINHAS } from "../inventario/carrinhas";
import { addDias } from "./base";
import type { Atribuicao, Compromisso, Custo, Frota, Leitura, Manutencao, Ocorrencia, Pessoa, Viatura } from "./tipos";

/** A versão dos dados guardados (localStorage): sobe quando a seed muda de forma. */
export const VERSAO_FROTA = 2;

export const CENTROS = ["Instalações · Norte", "Instalações · Sul", "Assistência · Sul", "Assistência · Centro", "Comercial", "Obras"];
export const OFICINAS = ["Oficina Auto Sul", "Pneus Express Loures", "Centro de Inspeções Lisboa Norte", "Concessionário Renault Sacavém"];
export const POSTOS = ["Cartão frota · Galp", "Cartão frota · Repsol", "Carregamento · Mobi.E", "Pagamento direto"];
export const TIPOS_CUSTO = ["Combustível", "Carregamento", "Portagens", "Estacionamento", "Lavagem", "Oficina", "Renting / leasing", "Seguro", "IUC", "Outro"];

/** O centro de custo de uma obra do protótipo ("Obra #1022") e o caminho inverso. */
export const centroObra = (id: number): string => `Obra #${id}`;
export function obraDoCentro(c: string | undefined | null): number | null {
  const m = /^Obra #(\d+)$/.exec(c ?? "");
  return m ? Number(m[1]) : null;
}

/** O armazém do Inventário de cada carrinha (pela matrícula). */
const armazemDe = (mat: string): string | null => CARRINHAS.find((c) => c.mat === mat)?.id ?? null;

export function seedFrota(): Frota {
  const pessoas: Pessoa[] = [
    { id: "p1", nome: "João Silva", funcao: "Servente · demolição", equipa: "Equipa Norte", carta: ["B"], cartaVal: "2031-03-12", tec: "js" },
    { id: "p2", nome: "Rui Alves", funcao: "Servente · demolição", equipa: "Equipa Sul", carta: ["B"], cartaVal: "2026-11-20", tec: "ra" },
    { id: "p3", nome: "Marco Antunes", funcao: "Canalizador · chefe de equipa", equipa: "Equipa Norte", carta: ["B", "C"], cartaVal: "2029-07-01", tec: "ma" },
    { id: "p4", nome: "Sérgio Faria", funcao: "Ladrilhador", equipa: "Equipa Centro", carta: ["B"], cartaVal: "2033-01-15", tec: "sf" },
    { id: "p5", nome: "Rúben", funcao: "Comercial", equipa: "Comercial", carta: ["B"], cartaVal: "2030-05-09" },
    { id: "p6", nome: "Hugo Neves", funcao: "Ladrilhador", equipa: "Equipa Sul", carta: ["B"], cartaVal: "2028-02-28", tec: "hn" },
    { id: "p7", nome: "Paulo Mota", funcao: "Montador", equipa: "Equipa Centro", carta: [], cartaVal: null, tec: "pm" },
    { id: "p8", nome: "Sofia Martins", funcao: "Gestora de frota", equipa: "Administrativo", carta: ["B"], cartaVal: "2032-09-30" },
  ];
  // todas as viaturas do exemplo são recursos da Agenda
  const V = (v: Omit<Viatura, "armazemId" | "agenda">): Viatura => ({ ...v, armazemId: v.armazem ? armazemDe(v.mat) : null, agenda: true });
  const viaturas: Viatura[] = [
    V({ id: "v1", mat: "AA-12-BC", marca: "Renault", modelo: "Master 2.3 dCi Furgão L2H2", tipo: "Furgão", comb: "Gasóleo", posse: "Própria", ano: 2021, km: 148230, estado: "ativa", cat: "B", centro: "Instalações · Norte",
      venc: { seguro: "2026-11-02", ipo: "2026-10-28", iuc: "2027-03-31" }, seguradora: "Fidelidade", apolice: "AU-77812345", rev: { cadaKm: 30000, cadaMeses: 12, ultKm: 120000, ultData: "2025-11-20" }, armazem: true, recursoAgenda: "Carrinha Renault Master" }),
    V({ id: "v2", mat: "45-XZ-78", marca: "Peugeot", modelo: "Partner 1.5 BlueHDi", tipo: "Furgão compacto", comb: "Gasóleo", posse: "Renting", renda: 489, fimContrato: "2027-08-31", ano: 2023, km: 61240, estado: "ativa", cat: "B", centro: "Assistência · Sul",
      venc: { seguro: "2027-08-31", ipo: "2027-04-18", iuc: "2027-05-31" }, seguradora: "Incluído no renting", apolice: "—", rev: { cadaKm: 30000, cadaMeses: 24, ultKm: 60000, ultData: "2026-04-10" }, armazem: true }),
    V({ id: "v3", mat: "BR-03-QP", marca: "Citroën", modelo: "Jumpy 2.0 BlueHDi", tipo: "Furgão", comb: "Gasóleo", posse: "Própria", ano: 2019, km: 203880, estado: "oficina", motivo: "Embraiagem a patinar · Oficina Auto Sul", cat: "B", centro: "Instalações · Sul",
      venc: { seguro: "2027-02-14", ipo: "2027-01-20", iuc: "2027-04-30" }, seguradora: "Fidelidade", apolice: "AU-77812391", rev: { cadaKm: 30000, cadaMeses: 12, ultKm: 180000, ultData: "2025-12-02" }, armazem: true }),
    V({ id: "v4", mat: "12-TT-90", marca: "Ford", modelo: "Transit Custom 2.0 TDCi", tipo: "Furgão", comb: "Gasóleo", posse: "Própria", ano: 2018, km: 231400, estado: "ativa", cat: "B", centro: "Instalações · Norte",
      venc: { seguro: "2027-01-09", ipo: "2026-10-05", iuc: "2027-02-28" }, seguradora: "Tranquilidade", apolice: "TQ-2214509", rev: { cadaKm: 30000, cadaMeses: 12, ultKm: 210000, ultData: "2025-10-01" }, armazem: true }),
    V({ id: "v5", mat: "AF-77-LM", marca: "Renault", modelo: "Kangoo E-Tech 100% elétrica", tipo: "Furgão compacto", comb: "Elétrico", posse: "Renting", renda: 512, fimContrato: "2028-02-29", ano: 2024, km: 28650, estado: "ativa", cat: "B", centro: "Assistência · Centro",
      venc: { seguro: "2028-02-29", ipo: "2027-03-15", iuc: null }, seguradora: "Incluído no renting", apolice: "—", rev: { cadaKm: 40000, cadaMeses: 24, ultKm: 20000, ultData: "2026-01-20" }, armazem: true }),
    V({ id: "v6", mat: "88-PL-21", marca: "Toyota", modelo: "Corolla Touring Sports Hybrid", tipo: "Ligeiro de passageiros", comb: "Híbrido", posse: "Leasing", renda: 398, fimContrato: "2027-11-30", ano: 2022, km: 74310, estado: "ativa", usoPessoal: true, cat: "B", centro: "Comercial",
      venc: { seguro: "2026-12-01", ipo: "2026-11-25", iuc: "2027-01-31" }, seguradora: "Allianz", apolice: "AZ-90311207", rev: { cadaKm: 15000, cadaMeses: 12, ultKm: 60000, ultData: "2026-02-11" }, armazem: false }),
    V({ id: "v7", mat: "BX-55-RT", marca: "Mercedes-Benz", modelo: "Sprinter 316 CDI Furgão", tipo: "Furgão grande", comb: "Gasóleo", posse: "Própria", ano: 2020, km: 176020, estado: "ativa", cat: "B", centro: "Obras", pool: true,
      venc: { seguro: "2027-05-10", ipo: "2027-06-01", iuc: "2027-06-30" }, seguradora: "Fidelidade", apolice: "AU-77812402", rev: { cadaKm: 30000, cadaMeses: 12, ultKm: 150000, ultData: "2026-05-05" }, armazem: true }),
    V({ id: "v8", mat: "03-HJ-46", marca: "Opel", modelo: "Combo 1.3 CDTI", tipo: "Furgão compacto", comb: "Gasóleo", posse: "Própria", ano: 2015, km: 298700, estado: "vendida", motivo: "Vendida em 15/09/2026 · fim de vida útil", cat: "B", centro: "Assistência · Sul",
      venc: { seguro: null, ipo: null, iuc: null }, seguradora: "—", apolice: "—", rev: { cadaKm: 30000, cadaMeses: 12, ultKm: 270000, ultData: "2025-06-02" }, armazem: false }),
  ];
  const atrib: Atribuicao[] = [
    { id: "a1", vid: "v1", pid: "p1", tipo: "permanente", ini: "2025-02-01", fim: null, kmIni: 96000 },
    { id: "a2", vid: "v2", pid: "p2", tipo: "permanente", ini: "2026-03-01", fim: null, kmIni: 52010 },
    { id: "a3", vid: "v4", pid: "p3", tipo: "permanente", ini: "2024-06-10", fim: null, kmIni: 171300 },
    { id: "a4", vid: "v5", pid: "p4", tipo: "permanente", ini: "2026-01-20", fim: null, kmIni: 19880 },
    { id: "a5", vid: "v6", pid: "p5", tipo: "permanente", ini: "2025-09-01", fim: null, kmIni: 51200, nota: "Uso pessoal autorizado" },
    { id: "a6", vid: "v3", pid: "p6", tipo: "permanente", ini: "2025-05-01", fim: "2026-10-08", kmIni: 171900, kmFim: 203880, nota: "Entregue na oficina" },
    // a obra #1022 (Marta Lima, Odivelas): o Hugo Neves faz o revestimento e pavimento de qua 15 a qui 16/10 e leva a carrinha partilhada
    { id: "a7", vid: "v7", pid: "p6", tipo: "pontual", ini: "2026-10-15", fim: "2026-10-16", nota: "Obra #1022 · Revestimento e pavimento", obra: 1022 },
    // a 12-TT-90 do Marco Antunes vai à revisão a 21/10: leva a partilhada nesses dias
    { id: "a8", vid: "v7", pid: "p3", tipo: "pontual", ini: "2026-10-20", fim: "2026-10-21", nota: "Substituição temporária" },
    // a obra #1050 (Joana Ribeiro, Lisboa) arrancou a 29/09: a demolição levou a partilhada
    { id: "a9", vid: "v7", pid: "p1", tipo: "pontual", ini: "2026-09-29", fim: "2026-10-01", kmIni: 175400, kmFim: 176020, nota: "Obra #1050 · Demolição", obra: 1050 },
  ];
  const manut: Manutencao[] = [
    { id: "m1", vid: "v3", tipo: "Reparação · embraiagem", data: "2026-10-08", prev: "2026-10-16", estado: "em curso", oficina: "Oficina Auto Sul", valor: 980, nota: "Orçamento aprovado. Kit de embraiagem e volante bimassa." },
    { id: "m2", vid: "v4", tipo: "Inspeção periódica (IPO)", data: "2026-10-16", estado: "agendada", oficina: "Centro de Inspeções Lisboa Norte", valor: 37.3 },
    { id: "m3", vid: "v4", tipo: "Revisão anual", data: "2026-10-21", estado: "agendada", oficina: "Oficina Auto Sul", valor: 320 },
    { id: "m4", vid: "v1", tipo: "Pneus traseiros", data: "2026-09-12", km: 146100, estado: "concluída", oficina: "Pneus Express Loures", valor: 286 },
    { id: "m5", vid: "v2", tipo: "Revisão 60 000 km", data: "2026-04-10", km: 60000, estado: "concluída", oficina: "Concessionário (renting)", valor: 0 },
  ];
  const kmPer: Record<string, number> = { v1: 3610, v2: 2890, v3: 1720, v4: 4120, v5: 1980, v6: 3870, v7: 620 };
  const ultimaLeitura: Record<string, string> = { v3: "2026-10-08", v7: "2026-10-01" };
  const leituras: Leitura[] = [];
  for (const [vid, k] of Object.entries(kmPer)) {
    const v = viaturas.find((x) => x.id === vid)!;
    leituras.push({ vid, data: "2026-09-01", km: v.km - k, origem: "Fecho de agosto" });
    leituras.push({ vid, data: ultimaLeitura[vid] ?? "2026-10-13", km: v.km, origem: "Última leitura" });
  }
  const custos: Custo[] = [];
  let n = 1;
  const plano: Record<string, [number, number, number]> = { v1: [10.2, 1.62, 6], v2: [6.1, 1.62, 4], v3: [8.4, 1.62, 3], v4: [9.6, 1.62, 6], v6: [4.9, 1.79, 5], v7: [11, 1.62, 1], v5: [17.5, 0.24, 6] };
  for (const [vid, [cons, preco, fills]] of Object.entries(plano)) {
    const v = viaturas.find((x) => x.id === vid)!;
    const k0 = v.km - kmPer[vid];
    const dFim = vid === "v3" ? 36 : 41;
    for (let i = 1; i <= fills; i++) {
      const km = Math.round(k0 + (kmPer[vid] * i) / fills);
      const data = vid === "v7" ? "2026-10-01" : addDias("2026-09-01", Math.round((dFim * i) / fills));
      const q = Math.round(((kmPer[vid] / fills) * cons) / 10) / 10;
      const a = atrib.find((x) => x.vid === vid && x.ini <= data && (!x.fim || x.fim >= data));
      const el = v.comb === "Elétrico";
      custos.push({ id: "c" + n++, vid, data, tipo: el ? "Carregamento" : "Combustível", qtd: q, un: el ? "kWh" : "L", valor: Math.round(q * preco * 100) / 100, km, pid: a ? a.pid : null,
        centro: vid === "v7" ? "Obra #1050" : v.centro, fonte: el ? "Carregamento · Mobi.E" : i % 2 ? "Cartão frota · Galp" : "Cartão frota · Repsol" });
    }
  }
  const portagens: [string, number][] = [["v1", 84.35], ["v2", 41.2], ["v4", 126.8], ["v6", 58.9], ["v7", 22.4], ["v5", 18.6], ["v3", 37.15]];
  for (const [vid, valor] of portagens)
    custos.push({ id: "c" + n++, vid, data: "2026-10-05", tipo: "Portagens", valor, fonte: "Via Verde · extrato de setembro", centro: vid === "v7" ? "Obra #1050" : viaturas.find((x) => x.id === vid)!.centro });
  for (const [vid, valor] of [["v2", 489], ["v5", 512], ["v6", 398]] as [string, number][])
    for (const d of ["2026-09-01", "2026-10-01"]) custos.push({ id: "c" + n++, vid, data: d, tipo: "Renting / leasing", valor, fonte: "Fatura do locador", centro: viaturas.find((x) => x.id === vid)!.centro });
  custos.push({ id: "c" + n++, vid: "v1", data: "2026-09-12", tipo: "Oficina", valor: 286, fonte: "Pneus Express Loures", centro: "Instalações · Norte", nota: "Pneus traseiros" });
  // estacionamentos nas obras do protótipo: a demolição da #1022 (13/10, Odivelas) e a canalização da #1050 (30/09, Lisboa)
  custos.push({ id: "c" + n++, vid: "v1", data: "2026-10-13", tipo: "Estacionamento", valor: 12.5, fonte: "Pagamento direto", centro: "Obra #1022", pid: "p1" });
  custos.push({ id: "c" + n++, vid: "v6", data: "2026-10-03", tipo: "Lavagem", valor: 15, fonte: "Pagamento direto", centro: "Comercial", pid: "p5" });
  custos.push({ id: "c" + n++, vid: "v4", data: "2026-09-30", tipo: "Estacionamento", valor: 9.8, fonte: "Pagamento direto", centro: "Obra #1050", pid: "p3" });
  const ocorr: Ocorrencia[] = [
    { id: "o1", vid: "v4", tipo: "Multa", quando: "2026-10-02T10:42", local: "A2 km 12, sentido Sul", desc: "Excesso de velocidade: 102 km/h numa via de 80 km/h", valor: 120, notificada: "2026-10-09", estado: "por identificar" },
    { id: "o2", vid: "v7", tipo: "Multa", quando: "2026-09-30T18:15", local: "Rua Morais Soares, Lisboa", desc: "Estacionamento em lugar proibido", valor: 60, notificada: "2026-10-07", estado: "por identificar" },
    { id: "o3", vid: "v3", tipo: "Avaria", quando: "2026-10-08T08:20", local: "Seixal", desc: "Embraiagem a patinar em subidas. Viatura levada à oficina.", pid: "p6", estado: "em resolução", ligacao: "m1" },
    { id: "o4", vid: "v1", tipo: "Sinistro", quando: "2026-09-30T13:05", local: "Parque do Fórum Almada", desc: "Riscos e mossa na porta lateral, em estacionamento. Sem terceiros identificados.", pid: "p1", estado: "participado", valor: 0, fotos: 3 },
    { id: "o5", vid: "v6", tipo: "Multa", quando: "2026-08-14T09:10", local: "A5, Linda-a-Velha", desc: "Passagem em portagem sem identificador ativo", valor: 34.5, notificada: "2026-08-28", pid: "p5", estado: "resolvido" },
  ];
  // A agenda: as tarefas do plano das obras do protótipo (o técnico leva a sua viatura) e a visita marcada da Luísa Freitas (#1036, Rúben).
  const agenda: Compromisso[] = [
    { vid: "v1", data: "2026-10-13", hora: "08:00", ref: "Obra #1022", desc: "Demolição · WC Marta Lima, Odivelas", pid: "p1", obra: 1022, tarefa: "Demolição" },
    { vid: "v4", data: "2026-10-14", hora: "08:30", ref: "Obra #1022", desc: "Canalização · WC Marta Lima, Odivelas", pid: "p3", obra: 1022, tarefa: "Canalização" },
    { vid: "v7", data: "2026-10-15", hora: "08:00", ref: "Obra #1022", desc: "Revestimento e pavimento · WC Marta Lima, Odivelas", pid: "p6", obra: 1022, tarefa: "Revestimento e pavimento" },
    { vid: "v6", data: "2026-10-15", hora: "10:00", ref: "Negócio #1036", desc: "Visita · Cozinha · Luísa Freitas, Oeiras", pid: "p5", negocio: 1036 },
    { vid: "v7", data: "2026-10-16", hora: "08:00", ref: "Obra #1022", desc: "Revestimento e pavimento · WC Marta Lima, Odivelas", pid: "p6", obra: 1022, tarefa: "Revestimento e pavimento" },
    { vid: "v4", data: "2026-10-17", hora: "08:30", ref: "Obra #1022", desc: "Louças e acabamentos · WC Marta Lima, Odivelas", pid: "p3", obra: 1022, tarefa: "Louças e acabamentos" },
  ];
  return { v: VERSAO_FROTA, pessoas, viaturas, atrib, manut, leituras, custos, ocorr, agenda, log: [] };
}
