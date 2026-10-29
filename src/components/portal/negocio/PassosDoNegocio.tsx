// Os passos do cliente no portal, iguais aos da pré-visualização «Ver como o cliente» da ficha do negócio (src/emylia/PortalCliente.tsx):
// barra de 5 passos e cartão «Passo n de 5». Só apresentação: o passo vem da proposta e do contrato reais do negócio.
import { formatCurrency } from "@/lib/utils";

export const PASSOS_PORTAL = [
  { id: 1, nome: "Rever a proposta", titulo: "Reveja a sua proposta", texto: "Está toda aqui em baixo: o que vamos fazer, fase a fase, os materiais, o preço e as condições." },
  { id: 2, nome: "Aceitar", titulo: "Aceite a proposta", texto: "Se está de acordo, aceite com o código que lhe enviamos por SMS. Se quiser mudar alguma coisa, peça alterações." },
  { id: 3, nome: "Assinar o contrato", titulo: "Assine o contrato", texto: "A proposta foi aceite. Leia o contrato e assine com o código que lhe enviamos por SMS." },
  { id: 4, nome: "Acompanhar a obra", titulo: "A sua obra está em curso", texto: "O contrato está assinado. A equipa avisa-o por aqui e por contacto direto a cada avanço." },
  { id: 5, nome: "Receber a obra", titulo: "Receber a obra", texto: "No fim da obra confirmamos consigo que está tudo como combinado." },
] as const;

export type PassoPortal = 1 | 2 | 3 | 4 | 5;

/** O passo do cliente, a partir do estado da proposta e do contrato do negócio. Contrato assinado = obra em curso; proposta aceite = falta assinar. */
export function passoDoNegocio(propostaEstado?: string | null, contratoEstado?: string | null): PassoPortal {
  if (contratoEstado === "signed" || contratoEstado === "active") return 4;
  if (propostaEstado === "accepted") return 3;
  return 1;
}

interface PassosDoNegocioProps {
  passo: PassoPortal;
  titulo: string;
  subtitulo?: string;
  total?: number | null;
  prazo?: string | null;
}

export function PassosDoNegocio({ passo, titulo, subtitulo, total, prazo }: PassosDoNegocioProps) {
  const atual = PASSOS_PORTAL[passo - 1];
  return (
    <section aria-labelledby="portal-negocio-titulo" className="space-y-4">
      <div>
        <h2 id="portal-negocio-titulo" className="text-xl font-bold text-foreground">{titulo}</h2>
        {subtitulo && <p className="text-sm text-muted-foreground">{subtitulo}</p>}
      </div>
      <ol aria-label="Passos do negócio" className="grid grid-cols-5 gap-2">
        {PASSOS_PORTAL.map((p) => {
          const feito = p.id < passo;
          const ativo = p.id === passo;
          return (
            <li key={p.id} aria-current={ativo ? "step" : undefined} className="min-w-0 space-y-1.5">
              <div className={`h-1.5 rounded-full ${feito || ativo ? "bg-primary" : "bg-muted"}`} aria-hidden="true" />
              <p className={`text-[11px] leading-tight sm:text-xs ${ativo ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {p.nome}
                {feito && <span className="sr-only"> (feito)</span>}
                {ativo && <span className="sr-only"> (passo atual)</span>}
              </p>
            </li>
          );
        })}
      </ol>
      <div className="space-y-3 rounded-xl border border-border bg-card p-5">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Passo {passo} de {PASSOS_PORTAL.length}</p>
          <h3 className="text-lg font-semibold text-foreground">{atual.titulo}</h3>
          <p className="text-sm text-muted-foreground">{atual.texto}</p>
        </div>
        {(total != null || prazo) && (
          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-3">
            {total != null && (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Total, com IVA</dt>
                <dd className="text-lg font-bold text-foreground">{formatCurrency(total)}</dd>
              </div>
            )}
            {prazo && (
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Prazo</dt>
                <dd className="text-lg font-bold text-foreground">{prazo}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </section>
  );
}
