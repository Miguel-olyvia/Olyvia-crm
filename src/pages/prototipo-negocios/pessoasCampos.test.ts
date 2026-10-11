// Os sete campos novos da página Pessoas e as pessoas de exemplo que os mostram: formulário, resultado do último contacto, MQL e SQL, "voltou a contactar",
// distrito, motivo da perda e pessoa ou empresa. Tudo derivado e determinístico; nada muda o Estado.
import { afterEach, describe, expect, it } from "vitest";
import { seed, type Estado } from "./motor";
import { CONTACTO } from "./campos";
import { idade } from "./leadsDocs";
import { EXEMPLOS } from "./exemplosDocs";
import { COLUNAS_V2, cartoesV2 } from "./negociosDocs";
import { dealsExemplo } from "./dealsPessoas";
import { NEGOCIOS_PESSOAS, PESSOAS_EXEMPLO, extraDe, idAbrivel } from "./pessoasExemplo";
import { distritoDe, distritoTexto } from "./distritos";
import { MOTIVOS_PERDA, SEM_MOTIVO, esquecerPerdas, lembrarPerda, motivoCurto } from "./perdaDocs";
import {
  SEM_FILTROS, chipsDe, clientesApp, contagens, documentosDe, leadsApp, listaVisivel, perdidasApp, todosApp, valorPessoa, type PessoaApp,
} from "./pessoasDocs";
import { camposContacto, perfilDe, type Perfil } from "./perfilDocs";
import { SEM_CONTACTO, SEM_FORMULARIO, formularioDe, resultadoContacto, voltouAContactar } from "./camposPessoa";
import { etapaTexto } from "./listaDocs";
import { toquesDe } from "./toquesDocs";

afterEach(() => esquecerPerdas());

const NOVAS = PESSOAS_EXEMPLO.map((e) => e.nome);
const LEADS_SEED = ["Ana Martins", "Pedro Lopes", "Rita Sousa", "Manuel Costa", "Luísa Freitas", "Hugo Matos", "Carla Nunes", "Sérgio Pinto"];
const CLIENTES_SEED = ["Tiago Almeida", "Marta Lima", "Joana Ribeiro"];
const nomes = (l: { nome: string }[]): string[] => l.map((p) => p.nome);
const de = (S: Estado, n: string): PessoaApp => todosApp(S).find((p) => p.nome === n)!;
const perfil = (S: Estado, n: string): Perfil => perfilDe(de(S, n), S);

describe("pessoas de exemplo · os dados", () => {
  const S = seed();
  it("os números dos negócios de exemplo são únicos, a partir de 90201, e não colidem com a seed, com S.seq nem com os negócios de exemplosDocs", () => {
    const ids = [...PESSOAS_EXEMPLO.map((e) => e.id), ...Object.values(NEGOCIOS_PESSOAS).flat().map((n) => n.id)];
    expect(new Set(ids).size).toBe(ids.length);
    const usados = new Set([...S.deals.map((d) => d.id), ...Object.values(EXEMPLOS).flat().map((n) => n.id)]);
    for (const id of ids) { expect(id).toBeGreaterThan(S.seq); expect(usados.has(id), String(id)).toBe(false); }
    expect(Math.min(...PESSOAS_EXEMPLO.map((e) => e.id))).toBe(90201);
  });
  it("são pessoas novas (nomes que a seed não tem), com telefone no formato da app, marcadas exemplo, e nenhum negócio base em falta", () => {
    const seedNomes = new Set(S.deals.map((d) => d.nome));
    for (const e of PESSOAS_EXEMPLO) {
      expect(seedNomes.has(e.nome), e.nome).toBe(false);
      expect(e.tel, e.nome).toMatch(/^\d{3} \d{3} \d{3}$/);
      expect(de(S, e.nome).exemplo, e.nome).toBe(true);
      expect(S.deals.some((d) => d.id === e.base), e.nome).toBe(true);
      expect(idAbrivel(e.id), e.nome).toBe(e.base);
      expect(idade(e.quando), e.nome).toBeGreaterThanOrEqual(0);
    }
    expect(todosApp(S).filter((p) => p.exemplo)).toHaveLength(PESSOAS_EXEMPLO.length);
    expect(idAbrivel(1044)).toBe(1044);
  });
  it("os negócios das pessoas de exemplo não existem no Estado e as funções puras não o mudam (JSON antes e depois)", () => {
    const antes = JSON.stringify(S);
    for (const d of dealsExemplo(S)) expect(S.deals.some((x) => x.id === d.id)).toBe(false);
    for (const p of todosApp(S)) { const f = perfilDe(p, S); formularioDe(S, p); resultadoContacto(f); voltouAContactar(S, p, f); camposContacto(f, p.empresa); toquesDe(S, p.nome); }
    cartoesV2(S); contagens(S, ""); listaVisivel(S, "todos", SEM_FILTROS, "urgencia");
    expect(JSON.stringify(S)).toBe(antes);
    expect(JSON.stringify(dealsExemplo(S))).toBe(JSON.stringify(dealsExemplo(S)));
  });
  it("o perfil de todas as pessoas é determinístico, as novas incluídas", () => {
    const a = todosApp(seed()).map((p) => perfilDe(p, seed())), b = todosApp(seed()).map((p) => perfilDe(p, seed()));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("pessoas de exemplo · aparecem em todo o lado e mudam os totais", () => {
  const S = seed();
  it("as 8 leads e 3 clientes da seed mantêm o papel; os totais mudam só por causa das 10 pessoas novas (6 leads, 2 clientes, 2 perdidas)", () => {
    const novasLeads = ["Inês Carvalho", "Bruno Teixeira", "Filipa Moreira", "Ricardo Nogueira", "Condomínio Jardins do Tejo", "Modas Aurora"];
    const novosClientes = ["Hotel Praia Dourada", "Armando Figueiredo"], novasPerdidas = ["Teresa Antunes", "Duarte Gouveia"];
    expect([...novasLeads, ...novosClientes, ...novasPerdidas].sort()).toEqual([...NOVAS].sort());
    expect(nomes(leadsApp(S)).sort()).toEqual([...LEADS_SEED, ...novasLeads].sort());
    expect(nomes(clientesApp(S)).sort()).toEqual([...CLIENTES_SEED, ...novosClientes].sort());
    expect(nomes(perdidasApp(S)).sort()).toEqual([...novasPerdidas].sort());
    expect(perdidasApp(S)).toHaveLength(2);
    expect(contagens(S, "")).toEqual({ leads: 14, clientes: 5, todos: 21 });
    for (const n of LEADS_SEED) expect(de(S, n).papel, n).toBe("lead");
    for (const n of CLIENTES_SEED) expect(de(S, n).papel, n).toBe("cliente");
  });
  it("cada pessoa nova está em Leads, Clientes ou Perdidas, e em Todos uma só vez", () => {
    const todos = nomes(listaVisivel(S, "todos", SEM_FILTROS, "urgencia"));
    expect(new Set(todos).size).toBe(todos.length);
    for (const n of NOVAS) expect(todos, n).toContain(n);
    expect(nomes(listaVisivel(S, "leads", SEM_FILTROS, "urgencia"))).toContain("Inês Carvalho");
    expect(nomes(listaVisivel(S, "clientes", SEM_FILTROS, "urgencia"))).toContain("Hotel Praia Dourada");
  });
  it("o papel segue a regra de ganho: contrato assinado (fase 4) faz clientes; proposta enviada e perdidos não", () => {
    expect(de(S, "Hotel Praia Dourada").papel).toBe("cliente");
    expect(de(S, "Armando Figueiredo").papel).toBe("cliente");
    expect(de(S, "Condomínio Jardins do Tejo").papel).toBe("lead");
    expect(de(S, "Hotel Praia Dourada").novoNegocio).toBe(true);
    expect(de(S, "Armando Figueiredo").novoNegocio).toBe(false);
    expect(de(S, "Hotel Praia Dourada").todos.map((n) => n.titulo)).toEqual(["Cozinha do restaurante", "Casas de banho dos quartos"]);
  });
  it("a V2 de Negócios tem um cartão por negócio nas colunas certas, os perdidos ficam de fora e as quatro colunas continuam cobertas", () => {
    const cs = cartoesV2(S), doc = (n: string): string[] => cs.filter((c) => c.nome === n).map((c) => c.doc).sort();
    expect(doc("Condomínio Jardins do Tejo")).toEqual(["proposta"]);
    expect(doc("Hotel Praia Dourada")).toEqual(["financeiro", "orcamento"]);
    expect(doc("Armando Figueiredo")).toEqual(["financeiro"]);
    for (const n of ["Teresa Antunes", "Duarte Gouveia", "Inês Carvalho", "Bruno Teixeira", "Filipa Moreira", "Ricardo Nogueira", "Modas Aurora"]) expect(doc(n), n).toEqual([]);
    for (const { id } of COLUNAS_V2) expect(cs.some((c) => c.doc === id), id).toBe(true);
    expect(new Set(cs.map((c) => c.id)).size).toBe(cs.length);
    for (const c of cs.filter((x) => NOVAS.includes(x.nome))) expect(c.negocioId, c.id).toBeGreaterThanOrEqual(90201); // não existem no Estado: abrem o negócio base (idAbrivel)
  });
});

describe("campo 1 · o formulário por onde a pessoa entrou", () => {
  const S = seed();
  it("é o nome do formulário do primeiro toque, ou 'Registada à mão' quando não houve formulário", () => {
    expect(SEM_FORMULARIO).toBe("Registada à mão");
    const esperado: Record<string, string> = {
      "Pedro Lopes": "Site · pedido de orçamento", "Rita Sousa": "Cozinha nova", "Ana Martins": "Casa de banho nova", "Hugo Matos": SEM_FORMULARIO,
      "Manuel Costa": SEM_FORMULARIO, "Joana Ribeiro": SEM_FORMULARIO, "Carla Nunes": "Outdoor A1 · pedido de contacto", "Duarte Gouveia": SEM_FORMULARIO,
      "Inês Carvalho": "Site · pedido de orçamento", "Filipa Moreira": "Cozinha nova", "Bruno Teixeira": "Casa de banho nova", "Condomínio Jardins do Tejo": SEM_FORMULARIO,
    };
    for (const [n, f] of Object.entries(esperado)) expect(formularioDe(S, de(S, n)), n).toBe(f);
  });
  it("em todas as pessoas é o do primeiro toque e nunca a campanha (a campanha fica só na ficha)", () => {
    for (const p of todosApp(S)) {
      expect(formularioDe(S, p), p.nome).toBe(toquesDe(S, p.nome)[0]?.formulario ?? SEM_FORMULARIO);
      expect(formularioDe(S, p), p.nome).not.toMatch(/outubro|setembro|outono/i);
    }
    expect(new Set(todosApp(S).map((p) => formularioDe(S, p))).size).toBeGreaterThanOrEqual(4);
  });
});

describe("campo 2 · o resultado do último contacto", () => {
  const S = seed();
  const OPCOES = [...CONTACTO.flatMap((g) => g.campos).find((c) => c.k === "resultado")!.op!, SEM_CONTACTO];
  it("vem das chamadas da pessoa: o da última, ou 'Sem contacto' quando não houve nenhuma", () => {
    for (const p of todosApp(S)) {
      const f = perfilDe(p, S), chamada = f.interacoes.find((i) => i.tipo === "chamada");
      expect(resultadoContacto(f), p.nome).toBe(chamada ? chamada.detalhe : SEM_CONTACTO);
      expect(OPCOES, p.nome).toContain(resultadoContacto(f));
    }
  });
  it("tem variedade: sem contacto, atendeu e interessado, atendeu e ligar mais tarde, não atendeu", () => {
    const r = (n: string): string => resultadoContacto(perfil(S, n));
    for (const n of ["Ana Martins", "Pedro Lopes", "Rita Sousa", "Inês Carvalho"]) expect(r(n), n).toBe("Sem contacto");
    for (const n of ["Manuel Costa", "Sérgio Pinto", "Ricardo Nogueira"]) expect(r(n), n).toBe("Atendeu · ligar mais tarde");
    expect(r("Bruno Teixeira")).toBe("Não atendeu");
    for (const n of ["Luísa Freitas", "Filipa Moreira", "Hotel Praia Dourada"]) expect(r(n), n).toBe("Atendeu · interessado");
    expect(new Set(todosApp(S).map((p) => resultadoContacto(perfilDe(p, S)))).size).toBeGreaterThanOrEqual(4);
  });
  it("uma chamada que ninguém atendeu aparece nas interações como chamada sem resposta, e o seed não muda", () => {
    const bruno = perfil(S, "Bruno Teixeira").interacoes.filter((i) => i.tipo === "chamada");
    expect(bruno).toHaveLength(3);
    expect(bruno.every((i) => i.titulo === "Chamada sem resposta" && i.detalhe === "Não atendeu")).toBe(true);
    expect(S.deals.find((d) => d.id === 1038)!.f.resultado).toBe("Atendeu · interessado");
  });
});

describe("campo 3 · MQL ou SQL, só em alguns exemplos", () => {
  const S = seed();
  it("duas leads MQL, duas SQL e um cliente com SQL histórico; as restantes não têm etiqueta", () => {
    const q = (papel: string, v: string) => todosApp(S).filter((p) => p.papel === papel && p.qualificacao === v).map((p) => p.nome).sort();
    expect(q("lead", "MQL")).toEqual(["Pedro Lopes", "Ricardo Nogueira"]);
    expect(q("lead", "SQL")).toEqual(["Carla Nunes", "Filipa Moreira"]);
    expect(q("cliente", "SQL")).toEqual(["Armando Figueiredo"]);
    const com = todosApp(S).filter((p) => p.qualificacao !== null);
    expect(com).toHaveLength(5);
    expect(com.length).toBeLessThan(todosApp(S).length / 2);
    expect(extraDe("Ana Martins").qualificacao).toBeUndefined();
  });
});

describe("campo 4 · 'voltou a contactar' (derivado, desaparece com um contacto)", () => {
  const S = seed();
  const voltou = (n: string): boolean => voltouAContactar(S, de(S, n), perfil(S, n));
  it("é verdade para quem voltou a preencher o formulário sem ninguém lhe ter respondido (pelo menos duas pessoas)", () => {
    const com = todosApp(S).filter((p) => voltouAContactar(S, p, perfilDe(p, S))).map((p) => p.nome).sort();
    expect(com).toEqual(["Inês Carvalho", "Ricardo Nogueira"]);
    expect(toquesDe(S, "Inês Carvalho").some((t) => t.estado === "associada" && t.via === "online")).toBe(true);
  });
  it("a Carla Nunes também voltou a preencher, mas já teve contacto depois (a proposta): sem aviso", () => {
    expect(toquesDe(S, "Carla Nunes").some((t) => t.estado === "associada" && t.via === "online")).toBe(true);
    expect(voltou("Carla Nunes")).toBe(false);
  });
  it("desaparece quando alguém regista um contacto depois do último toque, e volta a existir se o contacto for anterior", () => {
    for (const n of ["Inês Carvalho", "Ricardo Nogueira"]) {
      const p = de(S, n), f = perfilDe(p, S);
      const depois = { ...f, interacoes: [{ id: "x", tipo: "chamada" as const, titulo: "Chamada · 3 min", detalhe: "Atendeu · interessado", q: "10/10 09:00", exemplo: true as const }, ...f.interacoes] };
      expect(voltouAContactar(S, p, f), n).toBe(true);
      expect(voltouAContactar(S, p, depois), n).toBe(false);
      const antes = { ...f, interacoes: [{ ...depois.interacoes[0], q: "01/09 09:00" }, ...f.interacoes] };
      expect(voltouAContactar(S, p, antes), n).toBe(true);
    }
  });
  it("com um toque online posterior a um contacto da seed volta a ser verdade; com o contacto posterior ao toque, não", () => {
    const p = de(S, "Carla Nunes"), f = perfil(S, "Carla Nunes");
    expect(f.interacoes.some((i) => i.titulo !== "Email de boas-vindas")).toBe(true);
    expect(voltouAContactar(S, p, f)).toBe(false);
    const antigo = { ...f, interacoes: f.interacoes.map((i) => ({ ...i, q: "01/09 09:00" })) };
    expect(voltouAContactar(S, p, antigo)).toBe(true);
  });
  it("o email de boas-vindas automático não conta como contacto, e só as leads em curso têm o aviso", () => {
    expect(perfil(S, "Inês Carvalho").interacoes.map((i) => i.titulo)).toEqual(["Email de boas-vindas"]);
    for (const p of [...clientesApp(S), ...perdidasApp(S)]) expect(voltouAContactar(S, p, perfilDe(p, S)), p.nome).toBe(false);
  });
});

describe("pessoa com negócios abertos e perdidos misturados (Marta Lima)", () => {
  const S = seed(), marta = de(S, "Marta Lima");
  it("tem os dois, continua cliente e o negócio perdido não conta para o valor nem para os documentos", () => {
    expect(marta.papel).toBe("cliente");
    expect(marta.todos.map((n) => n.perdido !== null)).toContain(true);
    expect(marta.todos.some((n) => n.perdido === null && n.titulo === "Cozinha nova")).toBe(true);
    const abertos = marta.todos.filter((n) => n.perdido === null);
    expect(valorPessoa(S, marta)).toBe(valorPessoa(S, { ...marta, todos: abertos }));
    expect(documentosDe(marta).some((d) => d.titulo === "Pavimento exterior")).toBe(false);
    expect(todosApp(S).filter((p) => p.nome === "Marta Lima")).toHaveLength(1);
    expect(marta.perdida).toBeNull();
  });
});

describe("campo 5 · o distrito, derivado da localidade", () => {
  const S = seed();
  it("o mapa fixo dá o distrito do concelho (sem diferença de acentos nem de maiúsculas); fora do mapa não há distrito", () => {
    expect(distritoDe("Sintra")).toBe("Lisboa");
    expect(distritoDe("Setúbal")).toBe("Setúbal");
    expect(distritoDe("SETUBAL")).toBe("Setúbal");
    expect(distritoDe("Guimarães")).toBe("Braga");
    expect(distritoDe("Terra do Nunca")).toBeNull();
    expect(distritoDe("")).toBeNull();
  });
  it("sem localidade (fallback): não há distrito e o Contacto diz 'Por indicar'", () => {
    expect(distritoTexto("")).toBe("Por indicar");
    expect(distritoTexto("Terra do Nunca")).toBe("Por indicar");
    const sem = seed(), ana = sem.deals.find((d) => d.nome === "Ana Martins")!;
    ana.local = "";
    const f = perfilDe(de(sem, "Ana Martins"), sem);
    expect(f.distrito).toBeNull();
    expect(camposContacto(f, null).find((c) => c.rotulo === "Distrito")?.valor).toBe("Por indicar");
  });
  it("as pessoas da seed têm o distrito da localidade", () => {
    const d = (n: string) => perfil(S, n).distrito;
    for (const n of ["Ana Martins", "Pedro Lopes", "Rita Sousa", "Manuel Costa", "Luísa Freitas", "Hugo Matos", "Marta Lima", "Joana Ribeiro"]) expect(d(n), n).toBe("Lisboa");
    for (const n of ["Carla Nunes", "Sérgio Pinto", "Tiago Almeida"]) expect(d(n), n).toBe("Setúbal");
  });
  it("as pessoas novas têm variedade: Lisboa, Setúbal, Porto, Braga, Faro e Coimbra", () => {
    expect(new Set(NOVAS.map((n) => perfil(S, n).distrito))).toEqual(new Set(["Lisboa", "Setúbal", "Porto", "Braga", "Faro", "Coimbra"]));
  });
  it("aparece no Resumo > Contacto a seguir à morada e como resposta em cada entrada por formulário", () => {
    for (const p of todosApp(S)) {
      const c = camposContacto(perfilDe(p, S), p.empresa).map((x) => x.rotulo);
      expect(c.indexOf("Distrito"), p.nome).toBe(c.indexOf("Morada") + 1);
      for (const t of toquesDe(S, p.nome).filter((x) => x.via === "online")) expect(t.campos.map((x) => x.rotulo), `${p.nome} ${t.id}`).toContain("Distrito");
    }
    expect(toquesDe(S, "Filipa Moreira")[0].campos.find((c) => c.rotulo === "Distrito")?.valor).toBe("Porto");
  });
});

describe("campo 6 · o motivo da perda", () => {
  const S = seed();
  it("a escolha é fixa: Preço, Adiou, Foi para outra empresa, Sem resposta, Não era o que procurava", () => {
    expect(MOTIVOS_PERDA.map((m) => m.nome)).toEqual(["Preço", "Adiou", "Foi para outra empresa", "Sem resposta", "Não era o que procurava"]);
    expect(motivoCurto("Foi para outra empresa")).toBe("Outra empresa");
    expect(motivoCurto("outro")).toBe("outro");
  });
  it("há duas leads perdidas de exemplo, com motivos diferentes, fora das leads por defeito e dentro de Todos e do filtro Perdidas", () => {
    expect(perdidasApp(S).map((p) => [p.nome, p.perdida])).toEqual([["Teresa Antunes", "Preço"], ["Duarte Gouveia", "Adiou"]]);
    expect(perdidasApp(S).every((p) => p.papel === "lead")).toBe(true);
    expect(nomes(listaVisivel(S, "leads", SEM_FILTROS, "urgencia"))).not.toContain("Teresa Antunes");
    expect(nomes(listaVisivel(S, "todos", SEM_FILTROS, "urgencia"))).toEqual(expect.arrayContaining(["Teresa Antunes", "Duarte Gouveia"]));
    expect(nomes(listaVisivel(S, "leads", { ...SEM_FILTROS, filtro: "perdidas" }, "urgencia"))).toEqual(["Teresa Antunes", "Duarte Gouveia"]);
    expect(nomes(listaVisivel(S, "todos", { ...SEM_FILTROS, filtro: "perdidas" }, "urgencia"))).toEqual(["Teresa Antunes", "Duarte Gouveia"]);
    expect(nomes(listaVisivel(S, "leads", { ...SEM_FILTROS, filtro: "atrasadas" }, "urgencia"))).toEqual(["Pedro Lopes"]);
    expect(nomes(listaVisivel(S, "todos", { ...SEM_FILTROS, filtro: "visita" }, "urgencia"))).not.toContain("Duarte Gouveia");
  });
  it("o chip Perdidas existe nas leads e em Todos, e não nos clientes (onde o filtro volta a Todas)", () => {
    expect(chipsDe("leads").map((c) => c.id)).toEqual(["todas", "por_contactar", "atrasadas", "perdidas"]);
    expect(chipsDe("todos").map((c) => c.id)).toEqual(["todas", "por_contactar", "atrasadas", "perdidas"]);
    expect(chipsDe("clientes").map((c) => c.id)).toEqual(["todas", "atrasadas"]);
    expect(nomes(listaVisivel(S, "clientes", { ...SEM_FILTROS, filtro: "perdidas" }, "urgencia"))).toEqual(nomes(clientesApp(S)));
  });
  it("a etapa na lista é 'Perdida' com o motivo curto, e o negócio perdido mostra o motivo", () => {
    expect(etapaTexto(de(S, "Teresa Antunes"))).toBe("Perdida · Preço");
    expect(etapaTexto(de(S, "Duarte Gouveia"))).toBe("Perdida · Adiou");
    const n = de(S, "Teresa Antunes").todos;
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ perdido: "Preço", titulo: "Cozinha" });
  });
  it("marcar uma lead como perdida guarda o motivo na memória da sessão: a pessoa passa a Perdidas e o Estado não muda", () => {
    const T = seed(), antes = JSON.stringify(T);
    lembrarPerda("Inês Carvalho", "Sem resposta");
    expect(de(T, "Inês Carvalho").perdida).toBe("Sem resposta");
    expect(nomes(leadsApp(T))).not.toContain("Inês Carvalho");
    expect(etapaTexto(de(T, "Inês Carvalho"))).toBe("Perdida · Sem resposta");
    expect(JSON.stringify(T)).toBe(antes);
    esquecerPerdas();
    expect(de(T, "Inês Carvalho").perdida).toBeNull();
    expect(nomes(leadsApp(T))).toContain("Inês Carvalho");
  });
  it("uma lead da seed perdida no motor também vai para Perdidas, com o motivo da sessão ou 'Motivo não registado'", () => {
    const T = seed();
    T.deals.find((d) => d.id === 1044)!.perdido = true;
    expect(de(T, "Pedro Lopes")).toMatchObject({ papel: "lead", perdida: SEM_MOTIVO });
    expect(de(T, "Pedro Lopes").todos[0]).toMatchObject({ titulo: "WC social", perdido: SEM_MOTIVO });
    lembrarPerda("Pedro Lopes", "Preço");
    expect(de(T, "Pedro Lopes").perdida).toBe("Preço");
    expect(nomes(leadsApp(T))).not.toContain("Pedro Lopes");
    T.deals.find((d) => d.id === 1044)!.perdido = false;
    expect(nomes(leadsApp(T))).toContain("Pedro Lopes");
  });
});

describe("campo 7 · pessoa ou empresa", () => {
  const S = seed();
  const EMPRESAS = ["Condomínio Jardins do Tejo", "Hotel Praia Dourada", "Modas Aurora"];
  it("há pelo menos três empresas (condomínio, hotelaria e retalho), entre leads e clientes, com pessoa de contacto e NIF de 9 dígitos", () => {
    const empresas = todosApp(S).filter((p) => p.empresa !== null);
    expect(nomes(empresas).sort()).toEqual([...EMPRESAS].sort());
    expect(new Set(empresas.map((p) => p.papel))).toEqual(new Set(["lead", "cliente"]));
    for (const p of empresas) {
      expect(p.empresa!.contacto, p.nome).not.toBe("");
      expect(p.empresa!.nif, p.nome).toMatch(/^\d{9}$/);
      expect(perfilDe(p, S).nif, p.nome).toBe(p.empresa!.nif);
    }
  });
  it("o Contacto de uma empresa mostra a pessoa de contacto e o NIF da empresa (de exemplo); numa pessoa nada muda", () => {
    const c = (n: string) => camposContacto(perfil(S, n), de(S, n).empresa);
    expect(c("Hotel Praia Dourada").map((x) => x.rotulo)).toEqual(["Telefone", "Email", "Morada", "Distrito", "Pessoa de contacto", "NIF da empresa"]);
    expect(c("Hotel Praia Dourada").find((x) => x.rotulo === "Pessoa de contacto")?.valor).toBe("Sónia Batista (gerente) (exemplo)");
    expect(c("Hotel Praia Dourada").find((x) => x.rotulo === "NIF da empresa")?.valor).toBe("509876543 (exemplo)");
    expect(c("Marta Lima").map((x) => x.rotulo)).toEqual(["Telefone", "Email", "Morada", "Distrito", "NIF"]);
    expect(c("Ana Martins").map((x) => x.rotulo)).toEqual(["Telefone", "Email", "Morada", "Distrito"]);
  });
  it("o NIF mostra-se na lead e no cliente (mesmos campos), mas só em alguns exemplos nas leads; os clientes têm sempre", () => {
    const leadsComNif = leadsApp(S).filter((p) => perfilDe(p, S).nif !== null).map((p) => p.nome).sort();
    expect(leadsComNif).toEqual(["Condomínio Jardins do Tejo", "Filipa Moreira", "Modas Aurora"]);
    for (const p of clientesApp(S)) expect(perfilDe(p, S).nif, p.nome).toMatch(/^\d{9}$/);
    expect(perfilDe(de(S, "Filipa Moreira"), S)).toMatchObject({ nif: "245678901", nifExemplo: true });
    expect(perfilDe(de(S, "Joana Ribeiro"), S)).toMatchObject({ nif: "123456789", nifExemplo: false });
  });
  it("o nome mostrado é o da empresa em todo o lado (lista, ficha e cartões da V2)", () => {
    expect(de(S, "Condomínio Jardins do Tejo").principal.nome).toBe("Condomínio Jardins do Tejo");
    expect(cartoesV2(S).some((c) => c.nome === "Hotel Praia Dourada")).toBe(true);
  });
});
