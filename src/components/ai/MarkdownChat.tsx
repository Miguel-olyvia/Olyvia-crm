// 26/11 (Rúben, depois de ver o chat a responder pela base de conhecimento com «###» e «**» à mostra): as respostas da Olyvia no chat
// vêm em markdown. Aqui desenham-se os títulos, negritos, itálicos, código, listas (numeradas e com pontos), a linha de separação e as
// ligações internas (que abrem a página na app). Sem innerHTML: o texto vem da IA e nunca é tratado como HTML.
import { Fragment, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";

type Bloco =
  | { k: "titulo"; nivel: number; texto: string }
  | { k: "lista"; ordenada: boolean; itens: string[] }
  | { k: "linha" }
  | { k: "paragrafo"; linhas: string[] };

/** Partes o texto em blocos (títulos, listas, separadores, parágrafos). */
export function blocosMarkdown(texto: string): Bloco[] {
  const out: Bloco[] = [];
  let par: string[] = [];
  let lista: { ordenada: boolean; itens: string[] } | null = null;
  const fecharPar = () => { if (par.length) { out.push({ k: "paragrafo", linhas: par }); par = []; } };
  const fecharLista = () => { if (lista) { out.push({ k: "lista", ...lista }); lista = null; } };
  for (const bruta of texto.replace(/\r/g, "").split("\n")) {
    const l = bruta.trimEnd();
    const t = l.trim();
    if (!t) { fecharPar(); fecharLista(); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) { fecharPar(); fecharLista(); out.push({ k: "titulo", nivel: h[1].length, texto: h[2].replace(/\s*#+\s*$/, "") }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { fecharPar(); fecharLista(); out.push({ k: "linha" }); continue; }
    const ul = /^[-*•]\s+(.*)$/.exec(t), ol = /^\d+[.)]\s+(.*)$/.exec(t);
    if (ul || ol) {
      fecharPar();
      const ordenada = !!ol;
      if (!lista || lista.ordenada !== ordenada) { fecharLista(); lista = { ordenada, itens: [] }; }
      lista.itens.push((ul ?? ol)![1]);
      continue;
    }
    // uma linha a seguir a um item, com espaços à frente, continua esse item
    if (lista && /^\s{2,}/.test(bruta)) { lista.itens[lista.itens.length - 1] += ` ${t}`; continue; }
    fecharLista();
    par.push(t);
  }
  fecharPar(); fecharLista();
  return out;
}

/** O texto de uma linha com negrito, itálico, código e ligações. */
export function emLinha(texto: string, aoLink: (caminho: string) => void, chave = ""): ReactNode[] {
  const out: ReactNode[] = [];
  // ligações [rótulo](caminho), **negrito**, `código`, *itálico* ou _itálico_
  const rx = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*\s][^*]*?)\*|(?<![\p{L}\p{N}])_([^_]+)_(?![\p{L}\p{N}])/gu;
  let ultimo = 0, m: RegExpExecArray | null, n = 0;
  while ((m = rx.exec(texto))) {
    if (m.index > ultimo) out.push(texto.slice(ultimo, m.index));
    const k = `${chave}-${n++}`;
    if (m[1] != null) {
      const caminho = m[2];
      out.push(caminho.startsWith("/")
        ? <button key={k} type="button" onClick={() => aoLink(caminho)} className="inline-flex items-center gap-1 text-primary underline hover:text-primary/80">{m[1]}<ExternalLink className="h-3 w-3" aria-hidden="true" /></button>
        : <Fragment key={k}>{m[1]}</Fragment>);
    } else if (m[3] != null) out.push(<strong key={k} className="font-semibold">{emLinha(m[3], aoLink, k)}</strong>);
    else if (m[4] != null) out.push(<code key={k} className="rounded bg-background/70 px-1 py-0.5 text-[0.85em]">{m[4]}</code>);
    else out.push(<em key={k}>{emLinha(m[5] ?? m[6], aoLink, k)}</em>);
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) out.push(texto.slice(ultimo));
  return out;
}

/** Uma resposta da Olyvia em markdown, desenhada. */
export function MarkdownChat({ texto, aoLink }: { texto: string; aoLink: (caminho: string) => void }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocosMarkdown(texto).map((b, i) => {
        if (b.k === "titulo") return <p key={i} role="heading" aria-level={Math.min(6, b.nivel + 2)} className={b.nivel <= 2 ? "text-[15px] font-semibold" : "font-semibold"}>{emLinha(b.texto, aoLink, `t${i}`)}</p>;
        if (b.k === "linha") return <hr key={i} className="border-border" />;
        if (b.k === "lista") {
          const L = b.ordenada ? "ol" : "ul";
          return <L key={i} className={b.ordenada ? "list-decimal space-y-1 pl-5" : "list-disc space-y-1 pl-5"}>{b.itens.map((x, j) => <li key={j}>{emLinha(x, aoLink, `l${i}-${j}`)}</li>)}</L>;
        }
        return <p key={i}>{b.linhas.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{emLinha(l, aoLink, `p${i}-${j}`)}</Fragment>)}</p>;
      })}
    </div>
  );
}
