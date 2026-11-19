// O passo Medidas da Obra (9/11; o fluxo em vigor a 19/11): depois do pagamento validado, o gestor da obra escolhe quem vai medir (uma pessoa
// do RH, avisada no Hoje dela, com o passo «Medir no local»); essa pessoa vai ao local e, no Estúdio das medidas (o único caminho para as
// mudar e aceitar), confere as medidas da visita e aceita-as. Só depois as Operações aprovam o plano. Se a retificação mudar o valor, segue a
// adenda do acerto ao Financeiro (ou a nota de crédito, se baixar) antes da encomenda de cliente.
// 19/11 (auditoria): o formulário que havia aqui (outro «Aceitar as medidas», com os mesmos campos do Estúdio) passou a resumo só de leitura;
// quem mede deixou de ser o «Responsável de obra» (um nome) e passou a ser a pessoa (d.f.supervisor_medidas, A.supervisorMedidas).
import { RotateCcw, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINHAS, PAPEIS, TECS, camposMedida, medida, medidasRetificadas, nfmt, type Negocio } from "./motor";
import { SEM_PERM, podeNeg } from "./permissoes";
import type { Ctx } from "./pecas";
import { AbrirEstudioMedidas } from "./estudioPlano/EstudioMedidas";
import { planoAprovadoDe, podeRetificar, supervisorDasMedidas } from "./preparacaoObra";
import { rotuloOficios } from "./equipa/tecnicos";

export function RetificacaoMedidas({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const CM = camposMedida(LINHAS[d.linha]);
  const aceite = d.f.retif_aceite;
  // 11/11: só quem planeia a obra (o gestor e o supervisor, nas Operações) escolhe quem mede e aceita; os outros veem e sabem de quem é o passo
  const meu = podeNeg(ctx.S.role, "obra.planear");
  const aberto = podeRetificar(d);
  const sup = supervisorDasMedidas(d);
  const retif = medidasRetificadas(d);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
        <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Ruler className="h-5 w-5" /></span>
        <div className="min-w-0 text-[15px]">
          <p className="font-semibold">{aceite ? `Medidas aceites a ${aceite.split("-").reverse().join("/")}${d.f.retif_por ? `, por ${d.f.retif_por}` : ""}` : sup ? `${sup.n} mede no local` : "Medir no local"}</p>
          <p className="text-muted-foreground">{aceite
            ? (planoAprovadoDe(d) ? "Com o plano aprovado, segue a encomenda de cliente." : "Segue o plano: as Operações aprovam-no. Se a retificação mudou o valor, primeiro a adenda do acerto.")
            : aberto ? "O gestor da obra escolhe quem vai medir. Essa pessoa vê o pedido no Hoje dela, confere as medidas da visita no local e aceita-as no Estúdio das medidas. Depois, as Operações aprovam o plano. Se a retificação mudar o valor, segue a adenda do acerto ao Financeiro."
            : "As medidas abrem depois de o Financeiro validar o pagamento."}</p>
        </div>
      </div>

      {/* 19/11 (auditoria): quem vai medir é uma pessoa do RH (como no Hoje do técnico e na página Técnicos), não o «Responsável de obra» */}
      {aberto && !aceite && (
        <label className="grid max-w-md gap-1.5 text-[15px] font-medium">
          Quem vai medir
          <select value={d.f.supervisor_medidas ?? ""} disabled={!meu} onChange={(e) => { const v = e.target.value; if (v) ctx.run(() => ctx.A.supervisorMedidas(d.id, v)); }}
            className="h-11 rounded-lg border border-input bg-background px-3 text-[15px] font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-70">
            <option value="">Escolher a pessoa</option>
            {TECS.map((x) => <option key={x.id} value={x.id}>{x.n} · {rotuloOficios(x)}</option>)}
          </select>
          <span className="text-sm font-normal text-muted-foreground">{sup ? `${sup.n} tem o passo «Medir no local» no Hoje dele.` : "Escolhida a pessoa, ela recebe o aviso e o passo «Medir no local» no Hoje dela."}</span>
        </label>
      )}

      {/* 9/11: o Estúdio das medidas, pensado para o telemóvel no local (a planta, os botões grandes, aceitar): o único caminho principal */}
      {meu ? (aberto && !aceite && !sup
        ? <p className="rounded-xl bg-muted/60 px-4 py-3 text-[15px] text-muted-foreground">Escolha quem vai medir: depois abre-se aqui o Estúdio das medidas.</p>
        : <AbrirEstudioMedidas ctx={ctx} d={d} />)
        : !aceite && aberto && (
        <p className="flex flex-wrap items-center gap-x-2 rounded-xl bg-muted/60 px-4 py-3 text-[15px]">
          <span>Este passo é das Operações: quem vai medir aceita as medidas no local.</span>
          {/* 11/11 (F3): a permissão em falta, como nos outros passos (o servidor também a pede: 20270113110000) */}
          <span className="w-full text-muted-foreground">{SEM_PERM["obra.planear"].sub}</span>
          <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => ctx.run(() => ctx.A.role("operacoes"))}>Mudar para {PAPEIS.operacoes.n}</button>
        </p>
      )}

      {/* o resumo, só de leitura: as da visita e as aceites (as medidas mudam-se no Estúdio) */}
      {CM.length ? (
        <div className="overflow-hidden rounded-2xl border border-border" role="table" aria-label="As medidas">
          <div role="row" className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] gap-3 bg-muted/60 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span role="columnheader">Medida</span><span role="columnheader" className="text-right">Na visita</span><span role="columnheader" className="text-right">{aceite ? "Aceite" : "No local"}</span>
          </div>
          <div role="rowgroup" className="divide-y divide-border">
            {CM.map(([k, l]) => {
              const antes = medida(d.visita.med, k), v = retif[k], dif = v != null ? v - antes : 0;
              return (
                <div role="row" key={k} className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-center gap-3 px-4 py-2.5">
                  <span role="cell" className="min-w-0 text-[15px]">{l}{Math.abs(dif) > 0.001 && <span className={cn("ml-2 rounded-full px-2 text-xs font-medium", dif > 0 ? "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200" : "bg-muted")}>{dif > 0 ? "+" : ""}{nfmt(dif)}</span>}</span>
                  <span role="cell" className="text-right tabular-nums text-muted-foreground">{nfmt(antes)}</span>
                  <span role="cell" className="text-right tabular-nums">{v != null ? nfmt(v) : "—"}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : <p className="text-[15px] text-muted-foreground">Esta linha não tem medidas: quem mede só confirma o local, nas notas.</p>}

      {d.f.retif_notas && <p className="rounded-xl bg-muted/60 px-4 py-3 text-[15px]"><span className="font-medium">Notas de quem mediu:</span> {d.f.retif_notas}</p>}

      {aceite && meu && d.obra.plano?.estado === "por aprovar" && (
        <div>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => ctx.run(() => ctx.A.campo(d.id, "retif_aceite", ""))}>
            <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />Voltar a retificar
          </Button>
        </div>
      )}
    </div>
  );
}
