// 26/11: «Outras medidas do modelo de catálogo» na vista da família: as famílias cujos produtos têm o mesmo modelo de catálogo (uma por medida). Mudar de medida muda de
// família e de endereço, por isso cada medida é uma LIGAÇÃO (<a href>) e não um botão: abre-se noutro separador, o «voltar» do browser funciona e a desta família leva
// aria-current="page". A cor e a textura escolhidas vão no endereço (parametros), por isso mantêm-se; se não existirem na medida nova o ecrã aplica a regra de passar ao
// produto mais próximo e avisa. Com mais de LIMITE_PESQUISA medidas há pesquisa («3 de 42 medidas») e grupos pela primeira medida.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";
import { caminhoFamilia } from "../catalogoRotas";
import { ESTADO_MUDOU_DE_MEDIDA, type OutraMedida } from "./escolhaVariacao";
import { SCROLL_FUNDO } from "./SeletoresVariacao";

const LIMITE_PESQUISA = 6;
const LIGACAO = cn("inline-flex min-h-11 min-w-11 items-center rounded-lg border border-foreground/50 bg-card px-3 text-[15px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card", SCROLL_FUNDO);

const ATUAL = "border-primary bg-muted font-semibold";

const sem = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const textoDe = (o: OutraMedida) => o.medida ?? o.nome;
const numerosDe = (s: string): number[] => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(",", ".")));

/** Pelo número e não pelo texto (70×70, 70×100, 80×120, 90×210); sem números, pelo texto. */
function porMedida(a: OutraMedida, b: OutraMedida): number {
  const x = numerosDe(textoDe(a)), y = numerosDe(textoDe(b));
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? -1) - (y[i] ?? -1);
    if (d !== 0) return d;
  }
  return textoDe(a).localeCompare(textoDe(b), "pt") || a.id.localeCompare(b.id);
}

export interface OutrasMedidasProps {
  outras: readonly OutraMedida[]; parametros: URLSearchParams;
  /** O nome do modelo de catálogo (CACH); diz-se sempre «modelo de catálogo» e nunca «modelo» sozinho. */
  modelo: string | null;
}

export function OutrasMedidas({ outras, parametros, modelo }: OutrasMedidasProps) {
  const { t } = useTranslation();
  const [pergunta, setPergunta] = useState("");
  const ordenadas = useMemo(() => [...outras].sort(porMedida), [outras]);
  const comPesquisa = ordenadas.length > LIMITE_PESQUISA;
  const q = sem(pergunta.trim());
  const visiveis = useMemo(() => (q ? ordenadas.filter((o) => sem(`${textoDe(o)} ${o.nome}`).includes(q)) : ordenadas), [ordenadas, q]);
  const grupos = useMemo(() => {
    if (!comPesquisa) return [{ chave: "", itens: visiveis }];
    const m = new Map<string, OutraMedida[]>();
    for (const o of visiveis) { const k = String(numerosDe(textoDe(o))[0] ?? ""); m.set(k, [...(m.get(k) ?? []), o]); }
    return [...m].map(([chave, itens]) => ({ chave, itens }));
  }, [comPesquisa, visiveis]);
  if (outras.length < 2) return null;

  const resto = parametros.toString();
  const ligacao = (o: OutraMedida) => (
    <li key={o.id}>
      <Link to={`${caminhoFamilia(o.id)}${resto ? `?${resto}` : ""}`} state={ESTADO_MUDOU_DE_MEDIDA} aria-current={o.atual ? "page" : undefined} className={cn(LIGACAO, o.atual && ATUAL)}>
        {textoDe(o)}{o.atual ? ` (${t("catFamiliaVer.medida.atual")})` : ""}
      </Link>
    </li>
  );
  return (
    <section aria-labelledby="outras-medidas-titulo" className="grid gap-2">
      <h2 id="outras-medidas-titulo" className="text-[15px] font-semibold text-foreground">
        {modelo ? t("catFamiliaVer.medida.outras", { modelo }) : t("catFamiliaVer.medida.outrasSemNome")}
      </h2>
      {comPesquisa && (
        <>
          <input type="search" value={pergunta} onChange={(e) => setPergunta(e.target.value)} aria-label={t("catFamiliaVer.medida.procurar")} placeholder={t("catFamiliaVer.medida.procurar")}
            className={cn("min-h-11 rounded-lg border border-foreground/50 bg-card px-3 text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary", SCROLL_FUNDO)} />
          <p role="status" className="text-[15px] text-muted-foreground">{q ? t("catFamiliaVer.medida.contagem", { n: visiveis.length, total: ordenadas.length }) : ""}</p>
        </>
      )}
      {visiveis.length === 0 && <p className="text-[15px] text-muted-foreground">{t("catFamiliaVer.medida.nenhuma", { q: pergunta.trim() })}</p>}
      {grupos.map((g) => g.chave
        ? (
          <div key={g.chave} role="group" aria-label={t("catFamiliaVer.medida.grupo", { inicio: g.chave })} className="grid gap-1">
            <p aria-hidden="true" className="text-[15px] text-muted-foreground">{t("catFamiliaVer.medida.grupo", { inicio: g.chave })}</p>
            <ul className="flex flex-wrap gap-2">{g.itens.map(ligacao)}</ul>
          </div>
        )
        : <ul key="todas" className="flex flex-wrap gap-2">{g.itens.map(ligacao)}</ul>)}
    </section>
  );
}
