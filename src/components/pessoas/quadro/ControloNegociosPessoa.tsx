import { ChevronDown } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { ResumoPessoa } from "../pessoasTipos";
import { idPainelNegocios, itemEmFoco } from "../processo/itensProcesso";
import { passoDoItem } from "../processo/passosProcesso";
import type { ItemProcesso } from "../processo/tiposProcesso";

interface BotaoNegociosProps {
  pessoaId: string;
  nome: string;
  quantidade: number;
  aberta: boolean;
  aoAlternar: (pessoaId: string) => void;
}

/**
 * "Ver negócios (n)" / "Esconder negócios". Vive numa linha que abre a ficha ao clicar, por isso não deixa o clique subir.
 * O nome acessível é o texto visível mais " de {nome}" (só para leitores de ecrã): começa pelo que se vê (WCAG 2.5.3) e só
 * `aria-expanded` diz o estado, sem o repetir no nome. Um nome fixo "Negócios (n) de {nome}" contradiria o texto visível
 * "Ver negócios" / "Esconder negócios". `aria-controls` só existe com o painel aberto: fechado, o painel não está no DOM.
 */
export function BotaoNegocios({ pessoaId, nome, quantidade, aberta, aoAlternar }: BotaoNegociosProps) {
  const { t } = useTranslation();
  return (
    <Button
      type="button" variant="outline" aria-expanded={aberta} aria-controls={aberta ? idPainelNegocios(pessoaId) : undefined}
      onClick={(e) => { e.stopPropagation(); aoAlternar(pessoaId); }}
      className={cn("h-auto min-h-11 w-full justify-between gap-1 whitespace-normal px-2 py-1 text-left text-sm motion-reduce:transition-none", FOCO)}
    >
      <span>
        {aberta ? t("pessoasPagina.deals.hide") : t("pessoasPagina.deals.show", { count: quantidade })}
        {/* O espaço fica fora do sr-only: dentro dele, o cálculo do nome acessível perde-o ("negóciosde"). */}
        {" "}
        <span className="sr-only">{t("pessoasPagina.deals.for", { name: nome })}</span>
      </span>
      <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none", aberta && "rotate-180")} aria-hidden="true" />
    </Button>
  );
}

/** Pessoa sem itens em curso: sem botão, só a nota. */
export function SemNegocios() {
  const { t } = useTranslation();
  return <span className="text-xs text-muted-foreground">{t("pessoasPagina.deals.none")}</span>;
}

/**
 * Com as sub-linhas fechadas: "2 em curso · A fazer: Registar a chamada". O passo é o do negócio mais avançado, o mesmo
 * critério da coluna "Próximo passo" (`itemEmFoco`), para as duas dizerem a mesma coisa da mesma pessoa.
 */
export function ResumoNegocios({ resumo, itens }: { resumo: Pick<ResumoPessoa, "abertos">; itens: readonly ItemProcesso[] }) {
  const { t } = useTranslation();
  const emFoco = itemEmFoco(resumo, itens);
  if (emFoco === null) return null;
  const step = t(passoDoItem(emFoco).chave);
  return (
    <span className="text-xs leading-4 text-muted-foreground">
      {itens.length === 1
        ? t("pessoasPagina.deals.summary.one", { step })
        : t("pessoasPagina.deals.summary.many", { count: itens.length, step })}
    </span>
  );
}
