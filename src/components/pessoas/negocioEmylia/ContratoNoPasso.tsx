// O contrato montado, no passo Contrato do Negócio (12/11, Rúben: «falta ver aqui o contrato»). Antes de ir ao portal do cliente vê-se o
// documento inteiro: os dados do cliente e da obra, o corpo da minuta escolhida (já preenchido) e, no fim, as cláusulas do negócio
// (preço, prestações, prazo, garantia, adendas) e as assinaturas. É a folha do contrato da Emylia (ContratoDoc, a mesma do portal), com a minuta
// no lugar da frase de abertura. Sem minuta, o documento continua à vista e diz, em cima e no sítio do corpo, o que falta para haver contrato.
import { hasSignatoryHook } from "@/components/contracts/contractDocument";
import { ContratoDoc } from "@/emylia/DocsCliente";
import type { Estado, Negocio } from "@/emylia/motor";

export interface ContratoNoPassoProps {
  S: Estado;
  d: Negocio;
  /** O corpo da minuta já preenchido e limpo (sanitizeRichHtml); `null` quando ainda não há minuta escolhida. */
  minutaHtml: string | null;
  nomeMinuta: string | null;
  /** O que falta para haver contrato, uma frase curta por linha. */
  falta: readonly string[];
}

/** O HTML da minuta vem de um editor de texto rico: estes estilos dão-lhe títulos, listas e parágrafos legíveis, e as tabelas largas
 *  deslizam dentro da folha em vez de a alargarem (390 px). */
const ESTILO_MINUTA = [
  "space-y-3 text-slate-800 [overflow-wrap:anywhere]",
  "[&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold",
  "[&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
  "[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_td]:p-1 [&_td]:align-top [&_th]:p-1 [&_img]:h-auto [&_img]:max-w-full",
].join(" ");

export function ContratoNoPasso({ S, d, minutaHtml, nomeMinuta, falta }: ContratoNoPassoProps) {
  if (!d.orc) {
    return (
      <p role="status" className="rounded-xl border border-dashed border-border bg-muted/40 p-3 text-[15px] text-muted-foreground">
        Ainda não há orçamento neste negócio: o contrato monta-se a partir dele.
      </p>
    );
  }
  const corpo = minutaHtml !== null
    ? (
      <section aria-label={nomeMinuta ? `Minuta «${nomeMinuta}»` : "Minuta do contrato"} className={ESTILO_MINUTA}>
        <div dangerouslySetInnerHTML={{ __html: minutaHtml }} />
      </section>
    )
    : (
      <p className="rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-amber-900">
        Aqui entra o corpo do contrato, que vem da minuta. Ainda não há minuta escolhida, por isso ainda não há contrato para enviar.
      </p>
    );
  return (
    <section aria-labelledby="contrato-no-passo" className="space-y-3">
      <div className="space-y-1">
        <h4 id="contrato-no-passo" className="text-[15px] font-semibold">O contrato</h4>
        <p className="text-sm text-muted-foreground">
          Como o cliente o vai ler.{minutaHtml !== null ? " A verde, os dados que vêm do negócio; entre chavetas, o que falta preencher." : ""}
        </p>
      </div>
      {falta.length > 0 && (
        <div role="status" className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-[15px]">
          <p className="font-medium">Para haver contrato, falta:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{falta.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      {/* a minuta com as suas linhas de assinatura: a folha não as repete no fim */}
      <ContratoDoc S={S} d={d} corpo={corpo} semAssinaturas={minutaHtml !== null && hasSignatoryHook(minutaHtml)} />
    </section>
  );
}
