// A matriz de permissões: um Accordion por entrada do menu (cabeçalho com "x de y"), e lá dentro uma GRELHA recurso × ação por
// subgrupo (GrelhaRecursoAcao; os blocos diretos do grupo fazem uma tabela sem título). Por omissão é só leitura ("Tem"/"Não tem");
// com `edicao` as células são caixas de seleção e cada módulo tem "Marcar tudo" e "Limpar" (formulário de role).
// Com `extra` (separador Permissões do utilizador, que diz de que role vem cada permissão) mantém-se a LISTA: a origem é por
// permissão e não cabe numa célula da grelha.
import { useId, useMemo, useState, type ReactNode } from "react";
import { Check, Minus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AcoesModulo } from "./AcoesModulo";
import { agruparPorMenu, distintivoAcao, type BlocoCategoria, type GrupoMenu } from "./gruposPermissoes";
import { GrelhaRecursoAcao, type EdicaoMatriz } from "./GrelhaRecursoAcao";
import { normalizar } from "./logica";
import { MarcaPerigosa } from "./pecas";
import type { Permissao } from "./tipos";

interface ArvorePermissoesProps {
  /** As permissões a listar (já filtradas pelo que quem edita pode ver). */
  permissoes: Permissao[];
  concedida: (codigo: string) => boolean;
  /** Complemento à direita de cada permissão (por exemplo, de que role vem). */
  extra?: (p: Permissao) => ReactNode;
  /** Torna a matriz editável (formulário de role). */
  edicao?: EdicaoMatriz;
}

interface LinhaPermissaoProps {
  permissao: Permissao;
  concedida: boolean;
  extra: ReactNode;
}

function LinhaPermissao({ permissao: p, concedida, extra }: LinhaPermissaoProps) {
  const { t } = useTranslation();
  const Icone = concedida ? Check : Minus;
  const acao = distintivoAcao(p.codigo);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-sm">
      <span className={cn("min-w-0 text-foreground", concedida && "font-medium")}>{p.nome}</span>
      <Badge variant="secondary" className={cn("px-1.5 text-xs", acao.classes)}>{acao.rotulo}</Badge>
      {p.perigosa && <MarcaPerigosa />}
      <span className="ml-auto flex flex-wrap items-center gap-x-1 text-foreground">
        <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
        {concedida ? t("usersProfiles.matrix.has") : t("usersProfiles.matrix.hasNot")}
        {extra}
      </span>
    </li>
  );
}

const CABECALHO_BLOCO = "mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground";

function Bloco({ bloco, comTitulo, linha }: { bloco: BlocoCategoria; comTitulo: boolean; linha: (p: Permissao) => ReactNode }) {
  return (
    <div>
      {comTitulo && <p className={CABECALHO_BLOCO}>{bloco.rotulo}</p>}
      <ul className="divide-y divide-border/60">{bloco.permissoes.map(linha)}</ul>
    </div>
  );
}

interface ItemGrupoProps {
  grupo: GrupoMenu;
  /** Quantas das permissões da lista estão concedidas. */
  concedidas: (lista: Permissao[]) => number;
  linha: (p: Permissao) => ReactNode;
  /** "Marcar tudo" e "Limpar" do módulo (só com edição). */
  acoes?: ReactNode;
  /** Desenha os blocos de uma tabela em grelha; sem isto, lista. */
  grelha?: (titulo: string, blocos: BlocoCategoria[]) => ReactNode;
}

/** Um módulo do menu: cabeçalho com o total concedido, categorias diretas e subgrupos. */
function ItemGrupo({ grupo: g, concedidas, linha, acoes, grelha }: ItemGrupoProps) {
  const { t } = useTranslation();
  const contagem = (lista: Permissao[]) => t("usersProfiles.matrix.count", { n: concedidas(lista), total: lista.length });
  return (
    <AccordionItem value={g.rotulo}>
      <AccordionTrigger className="min-h-11 py-2 text-left hover:no-underline motion-reduce:transition-none">
        <span className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-medium">{g.rotulo}</span>
          <Badge variant="outline">{contagem(g.permissoes)}</Badge>
        </span>
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3 pl-1 sm:pl-3">
          {acoes}
          {grelha
            ? g.blocos.length > 0 && grelha(g.rotulo, g.blocos)
            : g.blocos.map((b) => <Bloco key={b.categoria} bloco={b} comTitulo={g.blocos.length > 1} linha={linha} />)}
          {g.subgrupos.map((s) => (
            <div key={s.rotulo} className="space-y-2 border-l-2 border-border pl-3">
              <p className="flex flex-wrap items-center gap-x-3 text-sm font-medium text-foreground">
                {s.rotulo}
                <Badge variant="outline" className="text-xs">{contagem(s.permissoes)}</Badge>
              </p>
              {grelha
                ? grelha(`${g.rotulo} › ${s.rotulo}`, s.blocos)
                : s.blocos.map((b) => <Bloco key={b.categoria} bloco={b} comTitulo={s.blocos.length > 1} linha={linha} />)}
            </div>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/** A árvore com pesquisa. Sem pesquisa os módulos estão fechados; com pesquisa abrem todos os que têm resultados. */
export function ArvorePermissoes({ permissoes, concedida, extra, edicao }: ArvorePermissoesProps) {
  const { t } = useTranslation();
  const idPesquisa = useId();
  const [texto, setTexto] = useState("");
  const [abertos, setAbertos] = useState<string[]>([]);
  const consulta = normalizar(texto);
  const filtradas = useMemo(
    () => (consulta ? permissoes.filter((p) => normalizar(`${p.nome} ${p.codigo}`).includes(consulta)) : permissoes),
    [permissoes, consulta],
  );
  const grupos = useMemo(() => agruparPorMenu(filtradas), [filtradas]);
  const n = (lista: Permissao[]) => lista.filter((p) => concedida(p.codigo)).length;
  const linha = (p: Permissao) => <LinhaPermissao key={p.codigo} permissao={p} concedida={concedida(p.codigo)} extra={extra?.(p)} />;
  const grelha = extra && !edicao
    ? undefined
    : (titulo: string, blocos: BlocoCategoria[]) => <GrelhaRecursoAcao titulo={titulo} blocos={blocos} concedida={concedida} edicao={edicao} />;
  const acoes = (g: GrupoMenu) => (edicao && !edicao.desativada
    ? <AcoesModulo modulo={g.rotulo} aoMarcar={() => edicao.aoModulo(g.permissoes, true)} aoLimpar={() => edicao.aoModulo(g.permissoes, false)} />
    : undefined);
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label htmlFor={idPesquisa} className="text-sm text-muted-foreground">{t("usersProfiles.perms.search")}</label>
        <Input
          id={idPesquisa} type="search" value={texto} onChange={(e) => setTexto(e.target.value)}
          className={cn("h-11", FOCO)}
        />
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {t("usersProfiles.perms.total", { n: n(permissoes), total: permissoes.length })}
      </p>
      {grupos.length === 0 ? (
        <p role="status" className="text-sm text-muted-foreground">{t("usersProfiles.perms.noMatch", { q: texto.trim() })}</p>
      ) : (
        <Accordion
          type="multiple" className="w-full" value={consulta ? grupos.map((g) => g.rotulo) : abertos}
          onValueChange={(v) => { if (!consulta) setAbertos(v); }}
        >
          {grupos.map((g) => <ItemGrupo key={g.rotulo} grupo={g} concedidas={n} linha={linha} acoes={acoes(g)} grelha={grelha} />)}
        </Accordion>
      )}
    </div>
  );
}
