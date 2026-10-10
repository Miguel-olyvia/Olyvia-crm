// Os separadores da ficha de uma pessoa que são listas: Negócios, Entradas, Atividade e Contratos e documentos.
// Linhas separadas por traços, sem cartões dentro de cartões. A cor fica nos ícones.
import {
  ArrowRight, FileCheck2, FileSignature, FileText, Globe, History, Mail, NotebookPen, Pencil, Phone, Receipt, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, type Estado } from "./motor";
import type { CampoRotulado } from "./leadsDocs";
import { documentosDe, type PessoaApp } from "./pessoasDocs";
import { resumoDoc } from "./negociosApp";
import { ESTADO_TOQUE, campanhaDe, toquesDe, utmTexto } from "./toquesDocs";
import { atividadeDe, pagamentoDe, type ItemAtividade, type Perfil } from "./perfilDocs";
import { FASE_COR, FASE_ICONE, Chip } from "./pecas";

export const CHIP_PEQ = "h-7 w-7 rounded-lg [&_svg]:h-4 [&_svg]:w-4";
export const LINHA = "group flex min-h-11 w-full cursor-pointer flex-col gap-0.5 px-1 py-3 text-left transition-colors duration-150 hover:bg-muted/60 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary";
export const SETA = "ml-1 inline h-4 w-4 align-[-3px] transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none";

const ICONE_TIPO: Record<string, { i: LucideIcon; cor: string }> = {
  Lead: { i: FASE_ICONE[0], cor: FASE_COR[0] }, Contacto: { i: FASE_ICONE[1], cor: FASE_COR[1] }, Visita: { i: FASE_ICONE[2], cor: FASE_COR[2] },
  Orçamento: { i: FileText, cor: FASE_COR[0] }, Proposta: { i: FileCheck2, cor: FASE_COR[3] }, "Proposta conjunta": { i: FileCheck2, cor: FASE_COR[3] },
  Contrato: { i: FileSignature, cor: FASE_COR[2] }, Financeiro: { i: FASE_ICONE[4], cor: FASE_COR[4] },
  Fatura: { i: FileText, cor: FASE_COR[4] }, Recibo: { i: Receipt, cor: FASE_COR[4] },
};
export const icone = (tipo: string): { i: LucideIcon; cor: string } => ICONE_TIPO[tipo] ?? ICONE_TIPO.Lead;

export const Vazio = ({ texto }: { texto: string }) => <p className="border-t border-border pt-4 text-[15px] text-muted-foreground">{texto}</p>;
export const Exemplo = () => <span className="ml-2 text-[15px] font-normal text-muted-foreground">exemplo</span>;

/** Etiqueta e valor em lista de definições. */
export function ListaCampos({ campos, larg = "9rem" }: { campos: CampoRotulado[]; larg?: string }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-[15px] sm:grid-cols-[var(--larg)_minmax(0,1fr)]" style={{ "--larg": larg } as React.CSSProperties}>
      {campos.map((c) => <div key={c.rotulo} className="contents"><dt className="text-muted-foreground">{c.rotulo}</dt><dd className="break-words text-foreground">{c.valor}</dd></div>)}
    </dl>
  );
}

type Abrir = (id: number) => () => void;

export function SepEntradas({ S, p }: { S: Estado; p: PessoaApp }) {
  const toques = [...toquesDe(S, p.nome)].reverse();
  if (!toques.length) return <Vazio texto="Ainda não há entradas: nem formulários, nem registos à mão." />;
  return (
    <ul className="divide-y divide-border border-y border-border" aria-label="Entradas: formulários e registos">
      {toques.map((t) => {
        const mao = t.via === "mao";
        return (
          <li key={t.id} className="grid gap-1.5 py-4">
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Chip icone={mao ? Pencil : Globe} cor={FASE_COR[mao ? 2 : 0]} className={CHIP_PEQ} />
              <span className="text-base font-semibold">{mao ? "Registada à mão" : t.formulario}</span>
              <span className="ml-auto text-[15px] text-muted-foreground">{t.data}</span>
            </p>
            <p className="text-[15px] font-medium">{ESTADO_TOQUE[t.estado]}</p>
            {t.motivo && <p className="text-[15px] text-muted-foreground">{t.motivo}</p>}
            {t.conflito && <p role="note" className="text-[15px] font-medium">Conflito: {t.conflito}</p>}
            <ListaCampos campos={t.campos} />
            <p className="text-[15px] text-muted-foreground">Origem: {t.origem} · Canal: {t.canal} · Campanha: {campanhaDe(t)}</p>
            {!mao && <p className="break-words text-[15px] text-muted-foreground">{t.utm ? `UTM em bruto: ${utmTexto(t.utm)}` : "Sem UTM"}</p>}
            <p className="text-[15px] text-muted-foreground">exemplo</p>
          </li>
        );
      })}
    </ul>
  );
}

const TIPO_ATIV: Record<ItemAtividade["tipo"], { i: LucideIcon; nome: string; cor: string }> = {
  historico: { i: History, nome: "Histórico", cor: FASE_COR[3] }, chamada: { i: Phone, nome: "Chamada", cor: FASE_COR[1] },
  email: { i: Mail, nome: "Email", cor: FASE_COR[0] }, nota: { i: NotebookPen, nome: "Nota", cor: FASE_COR[2] },
};

export function SepAtividade({ S, p, f }: { S: Estado; p: PessoaApp; f: Perfil }) {
  const itens = atividadeDe(p, S, f);
  if (!itens.length) return <Vazio texto="Ainda não se passou nada com esta pessoa." />;
  return (
    <ol className="divide-y divide-border border-y border-border" aria-label="Atividade, da mais recente para a mais antiga">
      {itens.map((e) => {
        const t = TIPO_ATIV[e.tipo];
        return (
          <li key={e.id} className="flex gap-3 py-3">
            <Chip icone={t.i} cor={t.cor} className={cn(CHIP_PEQ, "mt-0.5")} />
            <span className="min-w-0 flex-1 text-[15px]">
              <span className="block text-muted-foreground">{t.nome}{e.exemplo && <Exemplo />}</span>
              <span className="block break-words text-foreground">{e.titulo}</span>
              {e.detalhe && <span className="block text-muted-foreground">{e.detalhe}</span>}
            </span>
            <span className="shrink-0 text-[15px] text-muted-foreground">{e.q}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function SepDocumentos({ S, p, abrir }: { S: Estado; p: PessoaApp; abrir: Abrir }) {
  const docs = documentosDe(p), pg = pagamentoDe(S, p);
  if (!docs.length) return <Vazio texto="Ainda não há contratos nem documentos." />;
  return (
    <div className="grid gap-5">
      <ListaCampos campos={[
        { rotulo: "Valor contratado", valor: `${eur(pg.total)} €` }, { rotulo: "Já recebido", valor: `${eur(pg.pago)} €` }, { rotulo: "Falta receber", valor: `${eur(pg.falta)} €` },
      ]} />
      <p className="-mt-3 text-[15px] text-muted-foreground">Pagamentos de exemplo, calculados a partir do valor contratado. Só para ler: cada linha abre o negócio. Os negócios de exemplo abrem o negócio base da pessoa.</p>
      <ul className="divide-y divide-border border-y border-border" aria-label="Contratos e documentos">
        {docs.map((d) => {
          const ic = icone(d.tipo);
          return (
            <li key={d.id}>
              <button type="button" onClick={abrir(d.negocioId)} className={LINHA}>
                <span className="flex items-center gap-2 text-[15px] text-muted-foreground"><Chip icone={ic.i} cor={ic.cor} className={CHIP_PEQ} />{d.tipo}</span>
                <span className="text-base font-semibold">{d.titulo}</span>
                {d.titulo !== d.servico && <span className="text-[15px] text-muted-foreground">Negócio: {d.servico}</span>}
                <span className="text-[15px] text-muted-foreground">{resumoDoc(d)}</span>
                <span className="text-[15px] font-medium">Abrir o negócio<ArrowRight className={SETA} aria-hidden="true" /></span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
