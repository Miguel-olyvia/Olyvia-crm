// O caso real (26/10/2026): o contrato CC-2026-0331 (proposta P-2026-0109, Anabela Schroeder, 64 971,81 € com IVA) levado da lead
// ao fim da obra numa organização real (estadoVazio: sem técnicos nem dados de exemplo), só com o que a app deixa fazer.
// O que a app não deixa fazer fica em LACUNAS, com o que se fez no lugar (para o relatório).
// 26/10 (2.ª volta): usa o que a 1.ª volta pediu (linha "Remodelação geral", linhas livres, IVA por linha, produto sem a instalação,
// prestações à medida e as faturas de todas as prestações), sem contornos à mão. As lacunas já corrigidas não podem voltar.
import { beforeEach, describe, expect, it } from "vitest";
import { acoes, ivaDaLinha, porZonaDe, r2, tot, totaisIva, type Aviso, type Estado, type Negocio } from "../motor";
import { estadoVazio } from "../estadoOrganizacao";
import { OBRA, PROPOSTA } from "../campos";
import { ligarCatalogo } from "../produtosVisita";
import { usarTecnicos } from "../equipa/tecnicos";
import { esquecerInventario } from "../inventario/loja";
import { receberTudo } from "../testeObra";
import { pontosEncerrar } from "../encerrarObra";
import { seguranca } from "../obraOps";
import { PAGAMENTO_MEDIDA, planoObra, prestacoes, type Prestacao } from "../planoObra";
import { faturasDe, guardarFaturas, tranchesDe, totalComIva } from "../v2/estadoV2";
import { registarFatura, resumoFin, validarPagamento, valorTranche } from "../v2/financeiro";
import { ZONAS, TAXA, OFICIAL, PAGAMENTO, PRAZO_CONTRATO } from "./propostaAnabela";
import { K_ANABELA, LINHAS_P, SVC_DO_SKU, montarAnabela, preencher } from "./montarAnabela";

const LACUNAS: { k: string; t: string; feito: string }[] = [];
const lacuna = (k: string, t: string, feito: string) => { if (!LACUNAS.some((x) => x.k === k)) LACUNAS.push({ k, t, feito }); };
/** As lacunas da 1.ª volta que já estão corrigidas: não podem aparecer outra vez. */
const CORRIGIDAS = ["uma-linha", "ligacao-produto", "demolicao", "levantamento-gas", "linhas-livres", "iva-subempreitada", "taxa", "prestacoes", "tranches", "obrigacao-produto", "levantamento", "zonas", "dois-precos"];

const K = K_ANABELA;

/** As prestações do contrato, com o momento da obra (a retificação das medidas da cozinha fica no fim da fase 1, das demolições). */
const MOMENTO: Prestacao["fase"][] = [0, 0, 0, 1, "fim"];

beforeEach(() => { localStorage.clear(); esquecerInventario(); ligarCatalogo(() => K); });

describe("caso real: contrato CC-2026-0331 da Anabela Schroeder", () => {
  it("vai da lead ao fim da obra com o valor do contrato", () => {
    const S: Estado = estadoVazio("org-caso-real");
    usarTecnicos(S.tecnicos!);
    const avisos: Aviso[] = [];
    const A = acoes(S, (a) => avisos.push(a), (fn) => fn());

    /* ---------------- 0 a 3. a organização vazia, a equipa falsa, a lead, a visita e o orçamento com as zonas (montarAnabela.ts) */
    const M = montarAnabela(S, A, avisos);
    for (const x of M.lacunas) lacuna(x.k, x.t, x.feito);
    console.log(M.log.join("\n"));
    const { id, qSvc, livres } = M;
    void qSvc; void livres;
    const d = () => S.deals.find((x) => x.id === id)!;
    expect(d().linha).toBe("geral");
    expect(d().fase).toBe(3);
    const o = d().orc!;
    // nenhuma linha de serviço a mais e nenhuma linha do levantamento (as proteções vão no «MO Modelo»)
    expect(o.linhas.filter((l) => l.t === "svc" && !M.qSvc.has(l.sid))).toEqual([]);
    expect(o.linhas.filter((l) => l.t === "mat" && l.d.startsWith("Levantamento · "))).toEqual([]);
    const TI = totaisIva(d(), S);
    console.log("TOTAIS DA APP · mo", r2(TI.mo), "mat", r2(TI.mat), "base", r2(TI.base), "iva 6%", r2(TI.ivaMo), "iva 23%", r2(TI.ivaMat), "total", r2(TI.total));
    expect(r2(TI.base)).toBe(OFICIAL.subtotal);
    expect(r2(TI.ivaMo)).toBe(OFICIAL.iva6);
    expect(r2(TI.ivaMat)).toBe(OFICIAL.iva23);
    expect(r2(TI.total)).toBe(OFICIAL.total);
    // cada linha com a taxa da proposta: as subempreitadas a 23%, a taxa de consultoria a 6%
    for (const sku of ["MATISAC", "MATISJPVC"]) {
      const l = o.linhas.find((x) => x.t === "svc" && x.sid === SVC_DO_SKU.get(sku));
      if (l) expect(ivaDaLinha(l, S), sku).toBe(23);
    }
    expect(ivaDaLinha(o.linhas.find((x) => x.t === "mat" && x.d === TAXA.d)!, S)).toBe(6);
    // a proposta por zona: as quatro zonas do contrato (a taxa de consultoria fica fora delas) e a soma é a do contrato
    const Z = porZonaDe(d(), S);
    expect(Z.map((g) => g.z)).toEqual([...ZONAS.map((z) => z.zona), "Outros trabalhos"]);
    expect(r2(Z.reduce((a, g) => a + g.total, 0))).toBe(OFICIAL.subtotal);
    for (const z of ZONAS) {
      const prop = r2(LINHAS_P.filter((l) => l.zona === z.zona).reduce((a, l) => a + r2(l.q * l.pu), 0)), app = Z.find((g) => g.z === z.zona)!.total;
      console.log(`ZONA ${z.zona} · app ${app} · proposta ${prop}`);
      // só a cozinha leva o acerto dos cêntimos do arredondamento antigo
      expect(Math.abs(r2(app - prop)), z.zona).toBeLessThanOrEqual(z.zona === "Cozinha" ? 1.21 : 0.004);
    }
    // as duas casas de banho, cada uma com o seu «MO Modelo»
    expect(o.linhas.find((l) => l.t === "svc" && l.sid === SVC_DO_SKU.get("MOMRCCBC"))!.zonas).toEqual([{ z: "Casa de banho comum", q: 1 }, { z: "Casa de banho suite", q: 1 }]);
    const T = tot(d(), S);
    console.log("MARGEM · custo", r2(T.custo), "preço", r2(T.pf), "margem", (T.m * 100).toFixed(1) + "%", "horas", r2(T.h));

    /* ---------------- 4. a proposta, as prestações do contrato, a aceitação e o contrato */
    A.verificar(id);
    for (const [k, v] of Object.entries({ validade: "15 dias", inicio_prev: "2026-11-02", garantia: "5 anos", modelo_contrato: "Empreitada de remodelação", assinatura: "Digital, no portal", representante: "Direção", multa: "Não", notas_cliente: "Proposta P-2026-0109. Inclui IVA à taxa legal." })) A.campo(id, k, v);
    expect(d().orc!.inicioObra, "o início previsto passa para o plano").toBe("2026-11-02");
    // as condições de pagamento do contrato, como estão escritas: 30% + 20% + 15% + 10% + 25%
    const fases: Prestacao[] = PAGAMENTO.map(([l, p], i) => ({ l, p: p / 100, fase: MOMENTO[i] }));
    expect(A.pagamentoPlano(id, PAGAMENTO_MEDIDA, fases)).toBe(true);
    expect(prestacoes(d().f.pagamento, d().orc!.pagFases).map((x) => [x.l, Math.round(x.p * 100)])).toEqual(PAGAMENTO);
    preencher(d(), PROPOSTA);
    A.enviar(id);
    expect(d().orc!.enviada, "enviar: " + JSON.stringify(avisos.slice(-2))).toBeTruthy();
    A.aceitar(id);
    A.enviarContrato(id);
    expect(d().orc!.contrato).toBe("enviado");
    A.assinarCom(id, { tipo: "sms", nome: "Anabela Correia", q: "12/10/2026 12:54", id: "OTP-CC-2026-0331" });
    expect(d().orc!.contrato).toBe("assinado");
    expect(d().fase).toBe(4);
    expect(S.clientes.some((c) => c.deal === id)).toBe(true);

    /* ---------------- 5. o Financeiro: a 1.ª prestação (adjudicação, 30%) põe a obra a andar */
    const TR = tranchesDe(d());
    expect(TR.map((t) => t.nome)).toEqual(PAGAMENTO.map(([l, p]) => `${l} ${p}%`));
    for (const [k, v] of Object.entries({ nome_fiscal: "Anabela Maria Machado Correia Schroeder", nif_fat: "123456789", morada_fiscal_igual: "Sim", email_fat: "cliente.caso@exemplo.pt", serie: "FT 2026", tranche: TR[0].nome, vencimento: "Pronto pagamento", metodo: "Transferência", conta: "Banco A · conta à ordem", comprovativo: "Transferência adjudicação" })) A.campo(id, k, v);
    S.role = "financeiro";
    A.emitir(id);
    expect(d().fin.fatura).toBeTruthy();
    A.validar(id);
    expect(d().fin.pago).toBe(true);
    expect(Number(d().f.valor_recebido)).toBeCloseTo(r2(OFICIAL.total * 0.3), 2);
    expect(d().fase).toBe(5);
    // a fatura da adjudicação fica gravada no negócio, como a 1.ª prestação
    guardarFaturas(S, id, faturasDe(S, d()));
    expect(d().fin.tranches?.map((f) => [f.tranche, !!f.pagamento])).toEqual([[TR[0].id, true]]);

    /* ---------------- 6. a obra: plano, materiais, arranque, tarefas, fim e auto de receção */
    const p = d().obra.plano!;
    expect(p).toBeTruthy();
    expect(p.inicio, "o plano começa no início previsto da proposta").toBe("2026-11-02");
    const porAtribuir = p.tasks.filter((t) => !t.tec);
    const diasPlano = Math.max(...p.tasks.map((t) => t.dia + t.dur));
    console.log("PRAZO · prazo_exec", d().f.prazo_exec, "· dias úteis do plano", diasPlano, "· início", p.inicio);
    // 26/10: o «MO Modelo» parte-se por ofício já no plano do orçamento, cada parte na sua fase e ao lado dos outros serviços:
    // o plano cabe no prazo do contrato (94 dias úteis; antes dava 99) e a fase 1 é só a preparação (antes tinha 39,5 dias)
    expect(diasPlano).toBeLessThanOrEqual(PRAZO_CONTRATO);
    expect(planoObra(d(), S).fases[0].fim).toBeLessThan(10);
    // o mesmo ofício nunca tem duas tarefas ao mesmo tempo
    const porOficio = new Map<string, typeof p.tasks>();
    for (const t of p.tasks) if (t.perfilId) porOficio.set(t.perfilId, [...(porOficio.get(t.perfilId) ?? []), t]);
    for (const [of, ts] of porOficio) {
      const ord = [...ts].sort((x, y) => x.dia - y.dia);
      for (let i = 1; i < ord.length; i++) expect(ord[i].dia, `${of}: ${ord[i].nome}`).toBeGreaterThanOrEqual(ord[i - 1].dia + ord[i - 1].dur - 1);
    }
    console.log("PLANO ·", p.tasks.length, "tarefas · por atribuir:", porAtribuir.map((t) => t.nome).join(", ") || "nenhuma");
    console.log("TAREFAS:\n  " + p.tasks.map((t) => `${t.nome} · ${t.sk} · ${t.tec ?? "—"} · dia ${t.dia} · ${t.dur} d · ${r2(t.h)} h`).join("\n  "));
    // os «MO Modelo» partem-se por ofício: cada parte com um técnico do seu ofício
    const doModelo = p.tasks.filter((t) => /MO Modelo/i.test(t.nome));
    console.log("TAREFAS DOS MO MODELO:", doModelo.length, "·", [...new Set(doModelo.map((t) => t.sk))].join(", "));
    if (doModelo.length && new Set(doModelo.map((t) => t.sk)).size < 2) lacuna("modelo-um-oficio", "As tarefas dos «MO Modelo» ficam com um só ofício.", "Nada.");
    S.role = "operacoes";
    preencher(d(), [OBRA[0]]);
    A.campo(id, "inicio", "2026-11-02");
    A.aprovarPlano(id);
    expect(d().obra.plano!.estado).toBe("aprovado");
    const ref = d().obra.ec?.ref;
    console.log("ENCOMENDA DE CLIENTE:", d().obra.ec?.n, ref);
    if (ref) expect(receberTudo(ref)).toBe("");
    A.arrancar(id);
    expect(d().obra.plano!.estado, "arrancar: " + JSON.stringify(avisos.slice(-2))).toBe("em curso");

    // os técnicos fazem cada tarefa (horas previstas e uma fotografia), o responsável valida
    const pl = d().obra.plano!;
    for (let ti = 0; ti < pl.tasks.length; ti++) {
      pl.dia = Math.max(pl.dia, pl.tasks[ti].dia);
      A.comecarTarefa(id, ti);
      A.registarTarefa(id, ti, { horas: Math.max(0.5, pl.tasks[ti].h), foto: "foto-" + ti });
      A.marcarFeita(id, ti);
    }
    A.validarVarias(id, pl.tasks.map((_, i) => i));
    const naoValidadas = pl.tasks.filter((t) => t.exec?.estado !== "validada").map((t) => `${t.nome} (${t.exec?.estado ?? "sem registo"}, tec ${t.tec ?? "—"})`);
    expect(naoValidadas, "por validar: " + JSON.stringify(avisos.slice(-3))).toEqual([]);
    // a segurança da obra (o aviso ao condomínio) trata-se na página da obra
    for (const x of seguranca(d())) if (!x.ok) A.tratarSeguranca(id, x.k);
    for (const [k, v] of Object.entries({ vistoria: "2026-12-18", auto_rececao: "Sim", satisfacao: "5", notas_fecho: "Obra entregue." })) A.campo(id, k, v);
    const falta = pontosEncerrar(d(), S).filter((x) => !x.ok);
    console.log("PARA ENCERRAR FALTA:", falta.map((x) => `${x.t} (${x.sub})`).join(" | ") || "nada");
    A.fimObra(id);
    expect(d().obra.plano!.estado, "fim: " + JSON.stringify(avisos.slice(-2))).toBe("concluída");
    A.enviarAuto(id);
    A.assinarAuto(id, { tipo: "sms", nome: "Anabela Correia", q: "18/12/2026 17:00", id: "OTP-AUTO" });
    expect(d().obra.auto?.estado).toBe("assinado");
    console.log("RESULTADO · real", JSON.stringify(d().obra.real && { custo: r2(d().obra.real!.custoReal), m: (d().obra.real!.m * 100).toFixed(1) + "%" }));

    /* ---------------- 7. as outras 4 prestações: faturadas e pagas, gravadas no negócio */
    const total = totalComIva(S, d());
    expect(r2(total)).toBe(OFICIAL.total);
    let fs = faturasDe(S, d());
    TR.slice(1).forEach((t, i) => {
      fs = registarFatura(fs, { numero: `FT 2026/${501 + i}`, data: "2026-12-18", valor: valorTranche(total, TR, t.id), tranche: t.id });
      fs = validarPagamento(fs, fs.at(-1)!.id, { data: "2026-12-19", conta: "Banco A · conta à ordem", ref: "Transferência " + t.nome }, `RG 2026/${501 + i}`);
    });
    guardarFaturas(S, id, fs);
    const R = resumoFin(total, TR, d().fin.tranches!);
    console.log("FINANCEIRO · faturado", R.faturado, "· pago", R.pago, "·", d().fin.tranches!.map((f) => `${f.numero} ${f.valor}`).join(" | "));
    expect(R.completo).toBe(true);
    expect(R.pago).toBe(OFICIAL.total);
    // gravadas no negócio: vão na sincronização e voltam ao recarregar
    expect((JSON.parse(JSON.stringify(d())) as Negocio).fin.tranches).toHaveLength(PAGAMENTO.length);

    console.log("LACUNAS (" + LACUNAS.length + "):\n" + LACUNAS.map((x, i) => `${i + 1}. [${x.k}] ${x.t}\n   Feito: ${x.feito}`).join("\n"));
    expect(LACUNAS.map((x) => x.k).filter((k) => CORRIGIDAS.includes(k))).toEqual([]);
  });
});
