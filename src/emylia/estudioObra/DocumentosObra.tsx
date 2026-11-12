// 12/11 (Rúben: «falta no estúdio da gestão da obra também os documentos enviados ao cliente, ter também a parte do 3D para ver»).
// Dois separadores do Estúdio da obra:
//  · Documentos: o que foi para o portal do cliente (documentosObra.ts), quando e em que estado; abrir cada um por cima (o «voltar» fecha,
//    ?doc=) e reenviar o acesso ao cliente com esse documento (pede confirmação; numa conta real, a permissão do portal);
//  · 3D: o projeto do Estúdio do projeto em volume (obra3d.ts), só para ver: o que está feito a cores, o que falta transparente.
import { useEffect, useMemo, useState } from "react";
import { Box, Check, FileText, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { NaFrente } from "../NaFrente";
import { podeNeg } from "../permissoes";
import { modoReal, emailDaFicha } from "../acessosPortal";
import { usePodeAcessoPortal } from "../AcessoPortalNegocio";
import { ContratoDoc, FaturaDoc, Partilhar, PropostaDoc } from "../DocsCliente";
import { AutoRececaoDoc } from "../AutoRececao";
import { usePainelUrl } from "../usarParamUrl";
import { Vista3D } from "@/pages/prototipo-estudio/Vista3D";
import { documentosEnviados, type DocEnviado, type TomDoc } from "./enviadosAoCliente";
import { obraEm3D } from "./obra3d";

const TOM: Record<TomDoc, string> = {
  ok: "bg-success/15 text-success", espera: "bg-warning/15 text-amber-800 dark:text-amber-300", mau: "bg-destructive/10 text-destructive", neutro: "bg-muted text-muted-foreground",
};

/* ================================================================== os documentos enviados ao cliente */
export function DocumentosDaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const L = documentosEnviados(d, ctx.S);
  if (!L.length) return <p className="rounded-xl bg-muted/50 px-4 py-3 text-[15px] text-muted-foreground">Ainda nada foi enviado ao cliente.</p>;
  return (
    <section aria-label="Documentos enviados ao cliente" className="space-y-3">
      <div>
        <h2 className="text-[15px] font-semibold">Enviados ao cliente</h2>
        <p className="text-sm text-muted-foreground">O que o cliente tem no portal, do primeiro ao último. Toque para abrir.</p>
      </div>
      <ul className="space-y-2">{L.map((x) => <LinhaDoc key={x.id} ctx={ctx} d={d} x={x} />)}</ul>
    </section>
  );
}

function LinhaDoc({ ctx, d, x }: { ctx: Ctx; d: Negocio; x: DocEnviado }) {
  const [aberto, setAberto] = usePainelUrl("doc", x.id);
  const [confirmar, setConfirmar] = useState(false);
  const planeia = podeNeg(ctx.S.role, "obra.planear");
  return (
    <li className="rounded-xl bg-card ring-1 ring-border transition-colors hover:bg-muted/40 hover:ring-foreground/30">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-2 pr-3">
        <button type="button" onClick={() => setAberto(true)} aria-label={`${x.titulo} ${x.numero}: ${x.estado}. Abrir`}
          className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium">{x.titulo}</span>
            <span className="block text-sm text-muted-foreground">{x.numero}{x.quando ? ` · enviado ${/^\d/.test(x.quando) ? "a " : ""}${x.quando}` : ""}</span>
          </span>
          <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium", TOM[x.tom])}>{x.estado}</span>
        </button>
        {planeia && x.tom !== "neutro" && !confirmar && <Button type="button" size="sm" variant="ghost" className="min-h-10 rounded-full" onClick={() => setConfirmar(true)}><Send className="mr-1.5 h-4 w-4" aria-hidden="true" />Reenviar</Button>}
      </div>
      {confirmar && (modoReal() ? <ReenviarReal ctx={ctx} d={d} x={x} fechar={() => setConfirmar(false)} /> : <Reenviar ctx={ctx} d={d} x={x} pode fechar={() => setConfirmar(false)} />)}
      {aberto && <DocAberto ctx={ctx} d={d} x={x} fechar={() => setAberto(false)} />}
    </li>
  );
}

/** Numa conta real, reenviar o acesso pede a permissão do portal (a mesma do «Acesso ao portal» do negócio). */
function ReenviarReal(props: { ctx: Ctx; d: Negocio; x: DocEnviado; fechar: () => void }) {
  const perm = usePodeAcessoPortal(props.d, true);
  return <Reenviar {...props} pode={perm.pode} porque={!perm.pode && !perm.aLer ? perm.motivo : undefined} />;
}
function Reenviar({ ctx, d, x, pode, porque, fechar }: { ctx: Ctx; d: Negocio; x: DocEnviado; pode: boolean; porque?: string; fechar: () => void }) {
  const email = emailDaFicha(d);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">{pode ? <>Reenviar ao cliente o aviso com {x.titulo.toLowerCase()} {x.numero}{email ? <> para <b className="font-medium">{email}</b></> : ""}?</> : porque ?? "Sem permissão para reenviar."}</span>
      {pode && <Button type="button" size="sm" className="min-h-10 rounded-full" onClick={() => { ctx.run(() => ctx.A.reenviarDocumento(d.id, x.reenvio, `${x.titulo} ${x.numero}`)); fechar(); }}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Sim, reenviar</Button>}
      <Button type="button" size="sm" variant="ghost" className="min-h-10 rounded-full" onClick={fechar}>{pode ? "Não" : "Fechar"}</Button>
    </div>
  );
}

/** O documento por cima do Estúdio (no telemóvel, em ecrã inteiro). Esc fecha só o documento. */
function DocAberto({ ctx, d, x, fechar }: { ctx: Ctx; d: Negocio; x: DocEnviado; fechar: () => void }) {
  const S = ctx.S;
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); fechar(); } };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, [fechar]);
  const doc = x.k === "proposta" ? <PropostaDoc S={S} d={d} /> : x.k === "contrato" ? <ContratoDoc S={S} d={d} />
    : x.k === "fatura" ? <FaturaDoc S={S} d={d} /> : x.k === "faturaTranche" ? <FaturaDoc S={S} d={d} reg={x.reg} regParcela={x.reg?.tranche} />
    : x.k === "propostaAdenda" ? <PropostaDoc S={S} d={d} a={x.a} /> : x.k === "contratoAdenda" ? <ContratoDoc S={S} d={d} a={x.a} />
    : x.k === "faturaAdenda" ? <FaturaDoc S={S} d={d} a={x.a} ft={x.ft} /> : <AutoRececaoDoc d={d} />;
  const tipo = x.k === "proposta" ? "proposta" : x.k === "contrato" || x.k === "contratoAdenda" ? "contrato" : x.k === "propostaAdenda" ? "adenda" : x.k === "auto" ? null : "fatura";
  return (
    <NaFrente>
    <div className="fixed inset-0 z-[60] flex justify-center bg-black/40 sm:items-center sm:p-6" onClick={fechar}>
      <div role="dialog" aria-modal="true" aria-label={`${x.titulo} ${x.numero}`} onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-4xl flex-col bg-card shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{x.numero} · {x.estado}</p>
            <h2 className="text-lg font-semibold">{x.titulo}</h2>
          </div>
          <Button type="button" variant="ghost" className="min-h-10 shrink-0" aria-label="Fechar" onClick={fechar}><X className="h-4 w-4" /></Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tipo ? <Partilhar ctx={ctx} d={d} tipo={tipo} estado={x.estado}>{doc}</Partilhar> : doc}
        </div>
        <div className="flex justify-end border-t border-border p-3">
          <Button type="button" variant="outline" size="lg" onClick={fechar}>Fechar</Button>
        </div>
      </div>
    </div>
    </NaFrente>
  );
}

/* ================================================================== o projeto em 3D */
export function ProjetoEm3D({ d }: { d: Negocio }) {
  const O = useMemo(() => obraEm3D(d), [d, d.f.estudio, d.obra.plano]); // eslint-disable-line react-hooks/exhaustive-deps
  const [qual, setQual] = useState<"obra" | "antes">("obra");
  if (!O) {
    return <p className="rounded-xl bg-muted/50 px-4 py-3 text-[15px] text-muted-foreground">Este negócio não tem projeto do Estúdio do projeto: o 3D aparece quando a visita é feita no Estúdio.</p>;
  }
  const opcao = (on: boolean) => cn("min-h-11 rounded-full px-4 text-[15px] font-medium transition-colors", on ? "bg-background shadow-sm" : "text-muted-foreground");
  return (
    <section aria-label="O projeto em 3D" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold"><Box className="h-4 w-4 text-primary" aria-hidden="true" />Como a obra vai ficar</h2>
          <p className="text-sm text-muted-foreground">
            {qual === "obra" ? <>O projeto aprovado. <b className="font-medium text-foreground">A cores, o que já está feito</b>; transparente, o que falta{O.total ? ` (${O.feitas} de ${O.total} peças feitas)` : ""}. Só para ver.</> : "A divisão como estava antes da obra."}
          </p>
        </div>
        <div role="group" aria-label="O que ver" className="inline-flex rounded-full bg-muted p-1">
          <button type="button" aria-pressed={qual === "obra"} onClick={() => setQual("obra")} className={opcao(qual === "obra")}>A obra hoje</button>
          <button type="button" aria-pressed={qual === "antes"} onClick={() => setQual("antes")} className={opcao(qual === "antes")}>Antes</button>
        </div>
      </div>
      <Vista3D cena={qual === "obra" ? O.cena : O.antes} titulo={qual === "obra" ? "A obra em 3D, com o que está feito" : "A divisão antes da obra"} />
    </section>
  );
}
