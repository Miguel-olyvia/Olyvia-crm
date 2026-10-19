import type { ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { TableCell, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AvatarPessoa } from "./AvatarPessoa";
import {
  Comercial, Criado, Etapa, Formulario, Passo, SemDado, SemTexto, SeloPapel, Sublinha, TextoOuTravessao, UltimoContacto, Valor, Whatsapp,
} from "./CelulasLinhaPessoa";
import type { IdColuna, VistaLinhaPessoa } from "./vistaLinhaPessoa";

const CELULA = "px-3 py-1 align-middle text-sm";
const R = "pessoasPagina.real.";

export interface LinhaPessoaVistaProps {
  vista: VistaLinhaPessoa;
  /** As colunas a desenhar, por ordem. «person» vai sempre primeiro. */
  colunas: readonly IdColuna[];
  /** Abre a ficha; `origem` é o botão do nome (o foco volta-lhe ao fechar). Sem isto o nome é texto e a linha não é clicável. */
  aoAbrir?: (origem: HTMLElement | null) => void;
  /** Células que quem chama desenha (negócios, próxima visita), por coluna. */
  celulas?: Partial<Record<IdColuna, ReactNode>>;
  /** Por baixo do sublinhado do nome (o resumo de negócios do protótipo). */
  abaixoDoNome?: ReactNode;
  /** A primeira célula é o cabeçalho da linha (`th scope="row"`), como na Lista real. */
  cabecalhoDeLinha?: boolean;
  /** O botão do nome tem 44 px de altura (a Lista real); senão alarga a área de toque sem aumentar a linha (o protótipo). */
  nomeAlto?: boolean;
}

function BotaoNome({ vista, nomeAlto }: { vista: VistaLinhaPessoa; nomeAlto: boolean }) {
  const { t } = useTranslation();
  const semNome = vista.nome === "";
  const texto = semNome ? t(`${R}noName`) : vista.nome;
  return (
    <button
      type="button" data-linha-pessoa={vista.id} data-abrir-pessoa={vista.id} aria-haspopup="dialog"
      className={cn(
        nomeAlto
          ? "-ml-1 inline-flex min-h-11 w-fit items-center rounded-sm px-1 text-left text-sm font-medium leading-5 hover:underline"
          : "relative w-fit rounded-sm text-left text-sm font-medium leading-5 hover:underline after:absolute after:-inset-x-1 after:-inset-y-3 after:content-['']",
        semNome ? "italic text-muted-foreground" : "text-foreground",
        FOCO,
      )}
    >
      {texto}
    </button>
  );
}

function CelulaPessoa({ p }: { p: LinhaPessoaVistaProps }) {
  const { t } = useTranslation();
  const { vista } = p;
  const semNome = vista.nome === "";
  return (
    <span className="flex items-center gap-2.5">
      <AvatarPessoa nome={vista.nome} pequeno />
      <span className="flex min-w-0 flex-col">
        <span className="flex flex-wrap items-center gap-x-2">
          {p.aoAbrir ? (
            <BotaoNome vista={vista} nomeAlto={!!p.nomeAlto} />
          ) : (
            <span className={cn("text-sm font-medium leading-5", semNome ? "italic text-muted-foreground" : "text-foreground")}>
              {semNome ? t(`${R}noName`) : vista.nome}
            </span>
          )}
          <SeloPapel vista={vista} />
        </span>
        <Sublinha vista={vista} />
        {p.abaixoDoNome}
      </span>
    </span>
  );
}

/** O conteúdo de cada coluna, a partir da vista. As que `celulas` traz têm precedência. */
function conteudo(id: IdColuna, p: LinhaPessoaVistaProps): ReactNode {
  const { vista } = p;
  const extra = p.celulas?.[id];
  if (extra !== undefined) return extra;
  switch (id) {
    case "person": return <CelulaPessoa p={p} />;
    case "place": return <PlaceTexto vista={vista} />;
    case "stage": return <Etapa vista={vista} />;
    case "form": return <Formulario vista={vista} />;
    case "lastContact": return <UltimoContacto vista={vista} />;
    case "next": return <Passo vista={vista} />;
    case "value": return <Valor vista={vista} />;
    case "assigned": return <Comercial vista={vista} />;
    case "phone": return <Contacto valor={vista.telefone} vazio="noPhone" />;
    case "email": return <Contacto valor={vista.email} vazio="noEmail" quebra />;
    case "whatsapp": return <Whatsapp vista={vista} />;
    case "created": return <Criado vista={vista} />;
    case "origin": return <Contacto valor={vista.origem} vazio="noData" />;
    case "campaign": return <Contacto valor={vista.campanha} vazio="noData" />;
    default: return <SemDado />;
  }
}

function PlaceTexto({ vista }: { vista: VistaLinhaPessoa }) {
  const { t } = useTranslation();
  return <TextoOuTravessao valor={vista.localidade} vazio={t("pessoasPagina.place.none")} />;
}

function Contacto({ valor, vazio, quebra }: { valor: string | null | undefined; vazio: string; quebra?: boolean }) {
  const { t } = useTranslation();
  return valor === null ? <SemTexto rotulo={t(`${R}${vazio}`)} /> : <TextoOuTravessao valor={valor} vazio={t(`${R}${vazio}`)} quebra={quebra} />;
}

const classeDe = (id: IdColuna): string =>
  cn(CELULA, id === "value" && "text-right tabular-nums", (id === "form" || id === "email") && "break-words text-xs");

/**
 * Uma linha de pessoa: o nome é o botão que abre a ficha (Enter) e a linha toda também abre ao clicar. Desenha as colunas
 * pedidas, pela ordem; o que a vista não sabe (undefined) aparece como «—», nunca como um texto inventado.
 */
export function LinhaPessoaVista(p: LinhaPessoaVistaProps) {
  const { vista, aoAbrir } = p;
  const ordem = ["person", ...p.colunas.filter((c) => c !== "person")] as IdColuna[];
  return (
    <TableRow
      data-pessoa-id={vista.id} className={aoAbrir ? "cursor-pointer" : undefined}
      onClick={aoAbrir ? (e) => {
        const botao = e.currentTarget.querySelector<HTMLElement>("[data-linha-pessoa]");
        botao?.focus();
        aoAbrir(botao);
      } : undefined}
    >
      {ordem.map((id, i) => (i === 0 && p.cabecalhoDeLinha ? (
        <th key={id} scope="row" className={cn(CELULA, "text-left font-normal")}>{conteudo(id, p)}</th>
      ) : (
        <TableCell key={id} className={classeDe(id)}>{conteudo(id, p)}</TableCell>
      )))}
    </TableRow>
  );
}
