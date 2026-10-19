// Os documentos antigos da pessoa (orçamentos, propostas e contratos) que ainda não pertencem a nenhum negócio, para ligar a um negócio
// aberto. Um contrato sem orçamento nem proposta não se liga (a base recusa-o, NG014): o botão fica aria-disabled e a explicação em texto
// visível, ligada por aria-describedby; nunca chega a pedir à base. Só na ficha real.
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { DocumentoPorLigar } from "@/components/negocio-metas/costuraNegocio";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { chaveDe } from "./RegistosLigadosLista";

const P = "pessoasPagina.";

/** O texto de um documento: «Proposta P-3». */
export const oQueDoDocumento = (t: (chave: string, params?: Record<string, string | number>) => string, d: DocumentoPorLigar): string =>
  t(`${P}neg.doc.what`, { kind: t(`${P}neg.doc.kind.${d.tipo}`), number: d.numero });

interface LinhaProps {
  documento: DocumentoPorLigar;
  ocupada: boolean;
  aoLigar: (d: DocumentoPorLigar) => void;
}

function Linha({ documento: d, ocupada, aoLigar }: LinhaProps) {
  const { t } = useTranslation();
  const idExplicacao = useId();
  const semBase = !d.temBase;
  const oQue = oQueDoDocumento(t, d);
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <span className="text-[15px] text-foreground">{oQue}</span>
      <Button
        type="button" variant="outline" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-label={t(`${P}linked.linkLabel`, { what: oQue })}
        aria-disabled={semBase || ocupada || undefined} aria-busy={ocupada || undefined} aria-describedby={semBase ? idExplicacao : undefined}
        onClick={() => { if (!semBase && !ocupada) aoLigar(d); }}
      >
        {t(`${P}linked.link`)}
      </Button>
      {semBase && <span id={idExplicacao} className="basis-full text-sm text-muted-foreground">{t(`${P}neg.link.docs.noBase`)}</span>}
    </li>
  );
}

interface DocumentosPorLigarProps {
  documentos: readonly DocumentoPorLigar[];
  ocupadas: ReadonlySet<string>;
  aoLigar: (d: DocumentoPorLigar) => void;
}

export function DocumentosPorLigar({ documentos, ocupadas, aoLigar }: DocumentosPorLigarProps) {
  const { t } = useTranslation();
  const idTitulo = useId();
  if (documentos.length === 0) return null;
  return (
    <div role="group" aria-labelledby={idTitulo} className="space-y-1">
      <p id={idTitulo} className="text-sm font-semibold text-foreground">{t(`${P}neg.link.docs.title`)}</p>
      <p className="text-sm text-muted-foreground">{t(`${P}neg.link.docs.hint`)}</p>
      <ul role="list" className="divide-y divide-border">
        {documentos.map((d) => (
          <Linha key={chaveDe({ tipo: d.tipo, id: d.id })} documento={d} ocupada={ocupadas.has(chaveDe({ tipo: d.tipo, id: d.id }))} aoLigar={aoLigar} />
        ))}
      </ul>
    </div>
  );
}
