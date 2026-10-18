// DADOS DE EXEMPLO variados da página "Pessoas": 17 pessoas inventadas (8 leads e 9 clientes), para o utilizador testar o fluxo com
// registos e negócios em fases diferentes (ver `registosExemplo.ts` e `negociosExemploVariado.ts`). Nomes, moradas e contactos
// são inventados; nada vem da base de dados. O papel (lead ou cliente) não é guardado: deriva dos negócios.
import { dia } from "./exemploVariadoApoio";
import type { OrigemPessoa, Pessoa, ResultadoContacto, ViaEntrada } from "./pessoasTipos";

type Morada = readonly [rua: string, codigoPostal: string, localidade: string, distrito: string];

interface Dados {
  id: string;
  nome: string;
  comercial: string;
  morada: Morada;
  telefone: string;
  /** `null`: sem email. */
  email: string | null;
  origem: OrigemPessoa;
  canal: string;
  via: ViaEntrada;
  saude: number;
  /** Dias desde o último contacto. */
  contacto: number;
  /** Dias desde que é lead ou cliente (positivo, no passado). */
  desde: number;
  resultado?: ResultadoContacto;
  /** Dias de hoje até à próxima chamada; falta quando a pessoa não tem chamada agendada. */
  proxima?: number;
  /** Dias de hoje até à submissão (ou pedido novo) que a fez voltar à abordagem (negativo); falta nas outras. */
  abordagem?: number;
  nif?: string;
  campanha?: string;
}

const FORMULARIO = "Pedido de orçamento";

const pessoa = (d: Dados): Pessoa => ({
  id: d.id, nome: d.nome, comercial: d.comercial, origem: d.origem, canal: d.canal, viaEntrada: d.via, saude: d.saude,
  contacto: { telefone: d.telefone, email: d.email },
  ...(d.abordagem === undefined ? {} : { abordagemDesde: dia(d.abordagem) }),
  ultimoContactoDias: d.contacto, desde: dia(-d.desde), resultadoContacto: d.resultado, nif: d.nif, campanha: d.campanha,
  formulario: d.via === "formulario" ? FORMULARIO : undefined,
  proximoContacto: d.proxima === undefined ? null : dia(d.proxima),
  morada: { linha: d.morada[0], cp: d.morada[1], localidade: d.morada[2] }, distrito: d.morada[3],
});

const LEADS: Dados[] = [
  {
    id: "pv-ema", nome: "Ema Cardoso", comercial: "Ana Ribeiro", morada: ["Rua Padre Vitorino 18", "4470-120", "Maia", "Porto"],
    telefone: "931 200 101", email: "ema.cardoso@exemplo.pt", origem: "formulario", canal: "Site", campanha: "Pinturas de outono",
    via: "formulario", saude: 55, contacto: 1, desde: 1, proxima: 1,
  },
  {
    id: "pv-duarte", nome: "Duarte Pimentel", comercial: "Bruno Costa", morada: ["Rua de Santo António 74", "4810-002", "Guimarães", "Braga"],
    telefone: "932 300 202", email: null, origem: "telefone", canal: "Chamada recebida", via: "telefone", saude: 60, contacto: 4,
    desde: 6, resultado: "atendeuInteressado", proxima: 2,
  },
  {
    id: "pv-filipa", nome: "Filipa Azevedo", comercial: "Carla Mendes", morada: ["Rua Eng. Silva Pinto 9", "3800-170", "Aveiro", "Aveiro"],
    telefone: "933 400 303", email: "filipa.azevedo@exemplo.pt", origem: "campanha", canal: "Google Ads", campanha: "Remodelações",
    via: "formulario", saude: 70, contacto: 3, desde: 9, resultado: "atendeuInteressado",
  },
  {
    id: "pv-gaspar", nome: "Gaspar Loureiro", comercial: "Diogo Lopes", morada: ["Rua da Sofia 143", "3000-389", "Coimbra", "Coimbra"],
    telefone: "934 500 404", email: "gaspar.loureiro@exemplo.pt", origem: "site", canal: "Site", via: "formulario", saude: 64,
    contacto: 3, desde: 12, resultado: "atendeuInteressado",
  },
  {
    id: "pv-helga", nome: "Helga Brandão", comercial: "Ana Ribeiro", morada: ["Rua da República 56", "7000-656", "Évora", "Évora"],
    telefone: "935 600 505", email: "helga.brandao@exemplo.pt", origem: "indicacao", canal: "Recomendação", via: "indicacao", saude: 78,
    contacto: 2, desde: 15, resultado: "atendeuInteressado",
  },
  {
    id: "pv-ivo", nome: "Ivo Carneiro", comercial: "Bruno Costa", morada: ["Rua Dr. Correia Mateus 21", "2400-135", "Leiria", "Leiria"],
    telefone: "936 700 606", email: "ivo.carneiro@exemplo.pt", origem: "formulario", canal: "Facebook Ads", campanha: "Cozinhas 2026",
    via: "formulario", saude: 72, contacto: 5, desde: 18, resultado: "atendeuInteressado",
  },
  {
    id: "pv-jaime", nome: "Jaime Serrano", comercial: "Carla Mendes", morada: ["Av. Luísa Todi 310", "2900-460", "Setúbal", "Setúbal"],
    telefone: "937 800 707", email: null, origem: "telefone", canal: "Chamada recebida", via: "telefone", saude: 66, contacto: 2,
    desde: 10, resultado: "atendeuInteressado",
  },
  {
    id: "pv-leonor", nome: "Leonor Quintela", comercial: "Diogo Lopes", morada: ["Rua de Santo António 27", "8000-283", "Faro", "Faro"],
    telefone: "938 900 808", email: "leonor.quintela@exemplo.pt", origem: "indicacao", canal: "Recomendação", via: "indicacao", saude: 68,
    contacto: 4, desde: 5, resultado: "atendeuInteressado",
  },
];

const CLIENTES: Dados[] = [
  {
    id: "pv-otilia", nome: "Otília Resende", comercial: "Ana Ribeiro", morada: ["Rua Formosa 88", "3510-100", "Viseu", "Viseu"],
    telefone: "939 101 909", email: "otilia.resende@exemplo.pt", origem: "indicacao", canal: "Recomendação", via: "indicacao", saude: 85,
    contacto: 2, desde: 220, resultado: "atendeuInteressado", nif: "209 111 301",
  },
  {
    id: "pv-pascoal", nome: "Pascoal Rebelo", comercial: "Bruno Costa", morada: ["Rua do Raio 140", "4710-923", "Braga", "Braga"],
    telefone: "931 202 010", email: "pascoal.rebelo@exemplo.pt", origem: "site", canal: "Site", via: "formulario", saude: 80,
    contacto: 3, desde: 300, resultado: "atendeuInteressado", nif: "209 111 302",
  },
  {
    id: "pv-quiteria", nome: "Quitéria Magalhães", comercial: "Carla Mendes", morada: ["Rua da Carreira 62", "9000-042", "Funchal", "Madeira"],
    telefone: "932 303 111", email: "quiteria.magalhaes@exemplo.pt", origem: "indicacao", canal: "Recomendação", via: "indicacao", saude: 74,
    contacto: 6, desde: 400, resultado: "atendeuMaisTarde", nif: "209 111 303",
  },
  {
    id: "pv-rodrigo", nome: "Rodrigo Valadares", comercial: "Diogo Lopes", morada: ["Rua Dr. Parreira 15", "8800-390", "Tavira", "Faro"],
    telefone: "933 404 212", email: null, origem: "telefone", canal: "Chamada recebida", via: "telefone", saude: 58, contacto: 1,
    desde: 500, nif: "209 111 304", abordagem: -1,
  },
  {
    id: "pv-sara", nome: "Sara Bettencourt", comercial: "Ana Ribeiro", morada: ["Rua Capitão Leitão 7", "2710-540", "Sintra", "Lisboa"],
    telefone: "934 505 313", email: "sara.bettencourt@exemplo.pt", origem: "formulario", canal: "Google Ads", campanha: "Cozinhas 2026",
    via: "formulario", saude: 82, contacto: 2, desde: 260, resultado: "atendeuInteressado", nif: "209 111 305",
  },
  {
    id: "pv-tomas", nome: "Tomás Gouveia", comercial: "Bruno Costa", morada: ["Rua Direita 99", "6200-150", "Covilhã", "Castelo Branco"],
    telefone: "935 606 414", email: "tomas.gouveia@exemplo.pt", origem: "campanha", canal: "Facebook Ads", campanha: "Remodelações",
    via: "formulario", saude: 61, contacto: 4, desde: 180, resultado: "atendeuInteressado", nif: "209 111 306",
  },
  {
    id: "pv-ursula", nome: "Úrsula Caldeira", comercial: "Carla Mendes", morada: ["Rua Serpa Pinto 33", "2560-300", "Torres Vedras", "Lisboa"],
    telefone: "936 707 515", email: "ursula.caldeira@exemplo.pt", origem: "site", canal: "Site", via: "formulario", saude: 63, contacto: 5,
    desde: 240, resultado: "atendeuInteressado", nif: "209 111 307",
  },
  {
    id: "pv-vitor", nome: "Vítor Almada", comercial: "Diogo Lopes", morada: ["Rua Bocage 120", "2830-300", "Barreiro", "Setúbal"],
    telefone: "937 808 616", email: "vitor.almada@exemplo.pt", origem: "indicacao", canal: "Recomendação", via: "indicacao", saude: 35,
    contacto: 14, desde: 330, resultado: "atendeuMaisTarde", nif: "209 111 308",
  },
  {
    id: "pv-zita", nome: "Zita Moniz", comercial: "Ana Ribeiro", morada: ["Rua Serpa Pinto 4", "2000-100", "Santarém", "Santarém"],
    telefone: "938 909 717", email: "zita.moniz@exemplo.pt", origem: "formulario", canal: "Site", via: "formulario", saude: 88, contacto: 1,
    desde: 280, resultado: "atendeuInteressado", nif: "209 111 309",
  },
];

/** As 17 pessoas dos exemplos variados: as 8 leads e depois os 9 clientes. */
export const PESSOAS_VARIADO: Pessoa[] = [...LEADS, ...CLIENTES].map(pessoa);

/** Os ids das 17 pessoas dos exemplos variados. */
export const IDS_PESSOAS_VARIADO: ReadonlySet<string> = new Set(PESSOAS_VARIADO.map((p) => p.id));

export const pessoaVariado = (id: string): Pessoa => {
  const p = PESSOAS_VARIADO.find((x) => x.id === id);
  if (!p) throw new Error(`Pessoa de exemplo desconhecida: ${id}`);
  return p;
};
