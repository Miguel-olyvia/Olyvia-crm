// As condições (prazo, início, pagamento e garantia) da proposta ligada ao negócio, na ficha real: mostram-se e, com pessoas.edit, edita-se
// (`CondicoesPropostaDialogo`). Uma proposta aceite já não se edita. Só existe na ficha real: o exemplo não tem `terms` e não desenha nada.
import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useMutacoesDaFicha } from "@/components/negocio-metas/mutacoesNegocio";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { useAvisarNegocio } from "@/components/negocio-metas/useAvisarNegocio";
import type { CondicoesTermos } from "@/components/negocio-metas/termosProposta";
import { CondicoesPropostaDialogo } from "./CondicoesPropostaDialogo";
import { textoDiaCompleto } from "./formatoPessoas";
import { useFocoDepois } from "./useFocoDepois";

const N = "pessoasPagina.neg.terms.";
const P = "pessoasPagina.proposal.";

function Valores({ condicoes }: { condicoes: CondicoesTermos }) {
  const { t } = useTranslation();
  const garantia = condicoes.garantia === 1 ? t(`${P}warranty.one`) : t(`${P}warranty.many`, { years: condicoes.garantia });
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
      <dt className="text-muted-foreground">{t(`${N}show.duration`)}</dt>
      <dd className="text-foreground">{t(`${N}show.durationValue`, { days: condicoes.prazo })}</dd>
      <dt className="text-muted-foreground">{t(`${N}show.start`)}</dt>
      <dd className="text-foreground">{textoDiaCompleto(condicoes.inicio)}</dd>
      <dt className="text-muted-foreground">{t(`${N}show.payment`)}</dt>
      <dd className="text-foreground">{t(`${P}payment.${condicoes.pagamento}`)}</dd>
      <dt className="text-muted-foreground">{t(`${N}show.warranty`)}</dt>
      <dd className="text-foreground">{garantia}</dd>
    </dl>
  );
}

interface CondicoesDaPropostaProps {
  negocio: NegocioMes;
  /** O dia de hoje (AAAA-MM-DD), para validar o início. */
  hoje: string;
}

export function CondicoesDaProposta({ negocio, hoje }: CondicoesDaPropostaProps) {
  const { t } = useTranslation();
  const dados = useDadosNegocio();
  const mutacoes = useMutacoesDaFicha();
  const avisar = useAvisarNegocio();
  const [aberto, setAberto] = useState(false);
  const botao = useRef<HTMLButtonElement>(null);
  const focarDepois = useFocoDepois();
  const proposta = dados?.proposta?.(negocio.id) ?? null;
  if (!dados || !proposta) return null;
  const aceite = proposta.estado === "aceite";
  // Editar as condições pede pessoas.edit E proposals.edit (sem a lista de permissões, no exemplo e nos testes antigos, nada se restringe: a base decide).
  const podeNaProposta = dados.podeNoDocumento?.("proposta", "edit") ?? true;
  const podeEditar = dados.podeEditar && podeNaProposta && mutacoes?.guardarCondicoes !== undefined && !aceite;
  const rotulo = proposta.condicoes === null && proposta.legivel ? t(`${N}add`) : t(`${N}edit`);
  return (
    <Seccao titulo={t(`${N}title`)} nivel={4} className="mt-3">
      <div className="space-y-3">
        {proposta.condicoes ? <Valores condicoes={proposta.condicoes} /> : (
          <p className="text-[15px] text-muted-foreground">{t(proposta.legivel ? `${N}empty` : `${N}unreadable`)}</p>
        )}
        {aceite && <p className="text-sm text-muted-foreground">{t(`${N}locked`)}</p>}
        {podeEditar && (
          <Button ref={botao} type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setAberto(true)}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            {rotulo}
          </Button>
        )}
      </div>
      <CondicoesPropostaDialogo
        alvo={aberto ? { negocio, proposta } : null} hoje={hoje} aoFechar={() => setAberto(false)}
        aoGuardado={(anuncio) => {
          avisar(anuncio);
          // O botão que abriu o diálogo continua aí: o foco volta-lhe (o diálogo não o devolve depois de gravar).
          focarDepois(botao);
        }}
      />
    </Seccao>
  );
}
