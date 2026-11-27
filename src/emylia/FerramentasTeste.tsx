// FERRAMENTAS-TESTE (temporário, remover antes da main)
// 11/11 (Rafael): o painel «Ferramentas de teste» no negócio, para pôr negócios depressa no Financeiro sem criar emails de cliente nem ir
// ao portal. Para retirar: apagar este ficheiro, o teste ao lado e as linhas marcadas «FERRAMENTAS-TESTE» em NegocioSimples.tsx.
//
// Só aparece com as DUAS condições:
//  (a) o ambiente de testes: VITE_FERRAMENTAS_TESTE === "1", ou o endereço tem «testarh» (o deploy de testes), ou é localhost;
//  (b) o modo de teste da base (useModoTeste): a página real só o liga quando fn_modo_teste_para_mim diz que sim, isto é, a base tem o
//      interruptor app_modo_teste ligado (só a base do ramo RH; em produção a linha nasce desligada) E quem entrou é super admin ou
//      admin de sistema da organização (fn_super_admin_de). O servidor volta a verificar as duas coisas em cada ação.
// E só com a conta real (modoReal): o protótipo e o estúdio, sem base, não o mostram.
//
// Os botões:
//  1. «Aceitar a proposta como o cliente»: a Edge Function client-portal-action, ação «simular_cliente» → sign_proposal, o MESMO caminho do
//     portal, sem o código por SMS, sem email nem SMS (real/modoTeste.ts: simularCliente).
//  2. «Assinar o contrato como o cliente»: idem, sign_contract (os gatilhos do contrato correm como na assinatura real).
//  3. «Avançar para o passo seguinte»: o próximo passo do negócio (motor.proximo), feito pela MESMA ação do botão do passo (fazer), que
//     grava pelo caminho de sempre. Os passos do cliente usam 1 e 2. Os que precisam de alguém a escrever (a fatura do ERP, as medidas,
//     o plano…) não se forçam: o painel diz qual é e leva lá. Nunca escreve a fase à força.
//     17/11: o auto de receção por assinar também (motor.simularAuto).
//  4. 17/11 (Rúben, teste A-Z na Mudelar: «sim, cria»): com a obra em curso, «Fazer a tarefa seguinte como o técnico» e «Fazer todas as tarefas
//     como os técnicos». O ecrã do técnico só mostra as tarefas do dia; aqui faz-se a tarefa pelas MESMAS ações do ecrã dele (começar, os
//     passos, as horas previstas, uma fotografia de exemplo, «Correu como previsto.», enviar e terminar). A validação continua do responsável
//     (nas Operações), e o fim da obra também.
//  5. 25/11 (Rúben: «reset à obra para voltar a ter o plano original, para testarmos criar tasks e validar tudo»): «Recomeçar o plano do
//     orçamento» (motor.recomecarPlano), com confirmação. O plano volta ao que o motor gera, por aprovar; o que estava mudado fica no
//     antes e depois (planoAntesDepois.ts).
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { proximo, type Estado, type Negocio } from "./motor";
import { RES_INTERESSADO } from "./campos";
import { fotoExemplo } from "./obraOps";
import { COR_FASE } from "./planoObra";
import { listaMicro } from "./microtarefas";
import { fazer, type Ctx } from "./pecas";
import { modoReal } from "./acessosPortal";
import { useModoTeste } from "./real/modoTeste";
import { lerNumeros, type ResultadoArranque } from "./real/levarAoArranque";

/** (a) O ambiente de testes: a variável do build, o deploy de testes (testarh) ou o computador de quem programa. */
export function ambienteDeTeste(env: string | undefined, host: string | undefined): boolean {
  if (env === "1") return true;
  const h = (host ?? "").toLowerCase();
  return h.includes("testarh") || h === "localhost";
}
const ambienteAqui = () => ambienteDeTeste(import.meta.env.VITE_FERRAMENTAS_TESTE as string | undefined, typeof window === "undefined" ? undefined : window.location.hostname);

/** Os passos que abrem um ecrã (ou precisam de alguém a escrever): o painel leva lá, não faz por ninguém. */
const SO_NO_ECRA = new Set(["irVerif", "abrirRetificacao", "abrirPlano", "abrirRevisao", "abrirInv", "irObra", "registarFaturaErp", "pedidoCliente"]);

export type PassoTeste =
  | { tipo: "cliente"; acao: "aceitar" | "assinar"; t: string; sub?: string }
  | { tipo: "acao"; act: string; arg?: string; t: string; sub?: string; btn: string }
  | { tipo: "ecra"; act: string; arg?: string; t: string; sub?: string; btn?: string; navega: boolean }
  | { tipo: "espera"; t: string; sub?: string };

/** O que o «Avançar» faz agora neste negócio (sem React, para os testes). */
export function passoDeTeste(d: Negocio, S: Estado, A?: Ctx["A"]): PassoTeste {
  const p = proximo(d, S);
  if (p.sim === "aceitar" || p.sim === "assinar") return { tipo: "cliente", acao: p.sim, t: p.t, sub: p.sub };
  // 17/11 (A-Z na Mudelar): o auto de receção por assinar no portal: o cliente assina-o (motor.simularAuto, a assinatura simulada do protótipo)
  if (p.sim === "auto") return { tipo: "acao", act: "simularAuto", t: p.t, sub: p.sub, btn: "Assinar o auto de receção como o cliente" };
  if (p.act && SO_NO_ECRA.has(p.act)) {
    const navega = !!A && typeof (A as unknown as Record<string, unknown>)[p.act] === "function" && p.act !== "registarFaturaErp";
    return { tipo: "ecra", act: p.act, arg: p.arg, t: p.t, sub: p.sub, btn: p.btn, navega };
  }
  // 19/11 (auditoria): «Registar chamada» pede o resultado; avançar é a chamada com o cliente interessado
  if (p.act && p.btn) return { tipo: "acao", act: p.act, arg: p.act === "contactar" ? RES_INTERESSADO : p.arg, t: p.t, sub: p.sub, btn: p.btn };
  return { tipo: "espera", t: p.t, sub: p.sub };
}

/** A tarefa seguinte da obra em curso por fazer (pela ordem do plano), sem as paradas por um imprevisto; -1 sem nenhuma. */
export function tarefaSeguinte(d: Negocio): number {
  const p = d.obra.plano;
  if (!p || p.estado !== "em curso") return -1;
  return p.tasks.findIndex((t) => !t.bloqueio && t.exec?.estado !== "feita" && t.exec?.estado !== "validada");
}
/** As tarefas por fazer da obra em curso. */
export const tarefasPorFazer = (d: Negocio): number =>
  d.obra.plano?.estado === "em curso" ? d.obra.plano.tasks.filter((t) => !t.bloqueio && t.exec?.estado !== "feita" && t.exec?.estado !== "validada").length : 0;

/** Faz a tarefa `ti` como o técnico dela: as mesmas ações do Hoje do técnico (dentro de um ctx.run). */
export function fazerTarefaComoTecnico(A: Ctx["A"], d: Negocio, ti: number, S?: Ctx["S"]): void {
  const t = d.obra.plano?.tasks[ti];
  if (!t) return;
  A.comecarTarefa(d.id, ti);
  // 24/11: as microtarefas da tarefa (pelo id), as mesmas que o técnico vê no Hoje
  const ja = new Set(t.exec?.passos ?? []);
  listaMicro(t, S, d.obra.plano).forEach((m) => { if (!ja.has(m.id)) A.marcarPasso(d.id, ti, m.id); });
  const horas = t.h > 0 ? t.h : 1;
  A.enviarRegisto(d.id, ti, { horas, fotos: [fotoExemplo(t.nome, t.fase ? COR_FASE[t.fase] : undefined, 0)], nota: "Correu como previsto. (teste)", feita: true });
}

// FERRAMENTAS-TESTE (temporário, remover antes da main)
export function FerramentasTeste({ ctx, d, ambiente = ambienteAqui }: { ctx: Ctx; d: Negocio; /** para os testes */ ambiente?: () => boolean }) {
  const teste = useModoTeste();
  const [aFazer, setAFazer] = useState<string | null>(null);
  const [recomecar, setRecomecar] = useState(false);
  // 27/11 (Rúben: «passa todos os negócios que importamos via contrato para o arranque de obra»): levar até à obra em curso
  const [numeros, setNumeros] = useState("");
  const [aLevar, setALevar] = useState<string | null>(null);
  const [levados, setLevados] = useState<ResultadoArranque[]>([]);
  if (!teste || !modoReal() || !ambiente()) return null;
  const o = d.orc;
  const podeAceitar = !d.perdido && !d.anulado && !!o?.enviada && !o.aceite;
  const podeAssinar = !d.perdido && !d.anulado && !!o && !o.vendaDireta && o.contrato === "enviado";
  const porQueAceitar = podeAceitar ? null : !o?.enviada ? "A proposta ainda não foi enviada." : o.aceite ? "A proposta já está aceite." : "O negócio está fechado.";
  const porQueAssinar = podeAssinar ? null : o?.vendaDireta ? "Venda direta: não há contrato." : o?.contrato === "assinado" ? "O contrato já está assinado." : "O contrato ainda não foi enviado.";
  const P = passoDeTeste(d, ctx.S, ctx.A);

  const cliente = (acao: "aceitar" | "assinar") => {
    setAFazer(acao);
    void (acao === "aceitar" ? teste.aceitarProposta(d) : teste.assinarContrato(d)).finally(() => setAFazer(null));
  };
  const avancar = () => {
    if (P.tipo === "cliente") { cliente(P.acao); return; }
    if (P.tipo === "acao" || (P.tipo === "ecra" && P.navega)) ctx.go(() => fazer(ctx.A, P.act, d.id, P.arg))();
  };
  // 17/11: as tarefas da obra em curso, como os técnicos (a validação fica para o responsável)
  const porFazer = tarefasPorFazer(d);
  const tarefas = (todas: boolean) => ctx.run(() => {
    // o negócio do estado (as ações mudam-no aqui dentro); a mesma tarefa duas vezes seguidas quer dizer que não passou: pára
    const atual = () => ctx.S.deals.find((x) => x.id === d.id) ?? d;
    let antes = -1;
    for (let i = 0, ti = tarefaSeguinte(atual()); ti >= 0 && ti !== antes && i < 200; i++, antes = ti, ti = tarefaSeguinte(atual())) {
      fazerTarefaComoTecnico(ctx.A, atual(), ti, ctx.S);
      if (!todas) break;
    }
  });
  const plano = d.obra.plano, podeRecomecar = !!plano && !!o && plano.estado !== "concluída";
  const fazerRecomecar = () => { setRecomecar(false); ctx.run(() => { ctx.A.recomecarPlano(d.id); }); };
  const levar = (ids: number[]) => {
    if (!teste.levarAoArranque || !ids.length) return;
    setLevados([]); setALevar("a começar…");
    void teste.levarAoArranque(ids, (t) => setALevar(t)).then((r) => setLevados(r)).finally(() => setALevar(null));
  };
  const botaoAvancar = P.tipo === "cliente" ? (P.acao === "aceitar" ? "Aceitar a proposta como o cliente" : "Assinar o contrato como o cliente")
    : P.tipo === "acao" ? `Avançar: ${P.btn}`
    : P.tipo === "ecra" && P.navega ? `Ir para o passo: ${P.btn ?? P.t}`
    : null;

  return (
    <section aria-labelledby="ferramentas-teste-t" data-testid="ferramentas-teste"
      className="mt-4 space-y-3 rounded-2xl border-2 border-dashed border-amber-500 bg-amber-100 p-4 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 shrink-0" aria-hidden="true" />
        <h2 id="ferramentas-teste-t" className="text-[16px] font-semibold">Ferramentas de teste</h2>
        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">TESTE — só no ambiente de testes</span>
      </div>
      <p className="text-[15px]">
        Próximo passo: <b>{P.t}</b>{P.sub ? ` · ${P.sub}` : ""}
        {P.tipo === "ecra" && !P.navega ? " Este passo faz-se no ecrã do negócio, abaixo (não se força)." : ""}
        {P.tipo === "espera" ? " Não há nada a fazer aqui por agora." : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="border-amber-600 bg-white text-amber-900 hover:bg-amber-50" disabled={!podeAceitar || !!aFazer}
          title={porQueAceitar ?? undefined} onClick={() => cliente("aceitar")}>
          {aFazer === "aceitar" ? "A aceitar…" : "Aceitar a proposta como o cliente"}
        </Button>
        <Button type="button" variant="outline" className="border-amber-600 bg-white text-amber-900 hover:bg-amber-50" disabled={!podeAssinar || !!aFazer}
          title={porQueAssinar ?? undefined} onClick={() => cliente("assinar")}>
          {aFazer === "assinar" ? "A assinar…" : "Assinar o contrato como o cliente"}
        </Button>
        {porFazer > 0 && (
          <>
            <Button type="button" variant="outline" className="border-amber-600 bg-white text-amber-900 hover:bg-amber-50" disabled={!!aFazer} onClick={() => tarefas(false)}>
              Fazer a tarefa seguinte como o técnico
            </Button>
            <Button type="button" variant="outline" className="border-amber-600 bg-white text-amber-900 hover:bg-amber-50" disabled={!!aFazer} onClick={() => tarefas(true)}>
              Fazer todas as tarefas como os técnicos ({porFazer})
            </Button>
          </>
        )}
        {podeRecomecar && !recomecar && (
          <Button type="button" variant="outline" className="border-amber-600 bg-white text-amber-900 hover:bg-amber-50" disabled={!!aFazer} onClick={() => setRecomecar(true)}>
            Recomeçar o plano do orçamento
          </Button>
        )}
        {botaoAvancar && (
          <Button type="button" className="bg-amber-600 text-white hover:bg-amber-700" disabled={!!aFazer} onClick={avancar}>
            {botaoAvancar}
          </Button>
        )}
      </div>
      {teste.levarAoArranque && (
        <div className="space-y-2 rounded-xl border border-amber-600/60 bg-white/70 p-3 text-amber-950">
          <p className="text-[15px]"><b>Levar até ao arranque da obra</b> · contrato assinado, fatura e pagamento, medidas, plano aprovado, materiais garantidos, parcela do arranque e «Arrancar», pelos passos da app. Pára no passo que não avançar.</p>
          <div className="flex flex-wrap items-center gap-2">
            {!!o?.aceite && plano?.estado !== "em curso" && plano?.estado !== "concluída" && (
              <Button type="button" className="bg-amber-600 text-white hover:bg-amber-700" disabled={!!aLevar || !!aFazer} onClick={() => levar([d.id])}>
                Levar este negócio até ao arranque
              </Button>
            )}
            <label className="flex items-center gap-2 text-[15px]">Vários (n.º):
              <input value={numeros} onChange={(e) => setNumeros(e.target.value)} placeholder="1017-1047, 1015" aria-label="Números dos negócios a levar até ao arranque"
                className="h-10 w-48 rounded-lg border border-amber-600 bg-white px-2 text-[15px]" />
            </label>
            <Button type="button" variant="outline" className="border-amber-600 bg-white text-amber-900 hover:bg-amber-50" disabled={!!aLevar || !lerNumeros(numeros).length}
              onClick={() => levar(lerNumeros(numeros))}>
              Levar estes ({lerNumeros(numeros).length})
            </Button>
          </div>
          {aLevar && <p role="status" className="text-[15px]">A fazer: {aLevar}</p>}
          {levados.length > 0 && (
            <ul className="space-y-1 text-[15px]" aria-label="Resultado">
              {levados.map((r) => <li key={r.id}><b>{r.id}</b> {r.nome}: {r.ok ? "obra em curso" : `ficou em «${r.ficou}»`}{r.feito.length ? ` · ${r.feito.join(", ")}` : ""}</li>)}
            </ul>
          )}
        </div>
      )}
      {recomecar && (
        <div role="alertdialog" aria-labelledby="recomecar-t" className="space-y-2 rounded-xl border border-amber-600 bg-white p-3 text-amber-950">
          <p id="recomecar-t" className="text-[15px]">
            <b>Recomeçar o plano?</b> O plano volta a ser o que o motor gera do orçamento ({plano?.tasks.length ?? 0} tarefas agora), por aprovar.
            Saem as mudanças, as tarefas juntadas e os registos dos técnicos. O que estava mudado fica guardado no antes e depois. A encomenda e os pagamentos ficam.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" className="bg-amber-600 text-white hover:bg-amber-700" onClick={fazerRecomecar}>Sim, recomeçar</Button>
            <Button type="button" variant="outline" onClick={() => setRecomecar(false)}>Cancelar</Button>
          </div>
        </div>
      )}
      <p className="text-xs">
        {porQueAceitar && <>Aceitar: {porQueAceitar} </>}{porQueAssinar && <>Assinar: {porQueAssinar} </>}
        Aceitar e assinar usam o caminho do portal, sem código por SMS, email nem SMS; o avançar faz a mesma ação do botão do passo.
      </p>
    </section>
  );
}
