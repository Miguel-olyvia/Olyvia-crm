// A classificação numa só árvore (ofício › sub), partilhada por serviços, materiais e pacotes.
// Edita-se na linha: "+ ofício", "+ sub", renomear, subir/descer e retirar (com "Anular").
// Um só editor aberto de cada vez (o `editor` do Catálogo).
import { memo, useEffect, useRef, useState } from "react";
import { FolderTree, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOGO } from "../catalogo";
import type { Estado } from "../motor";
import { contarNo, juntarNo, moverNo, oficios, renomearNo, retirarNo, subs, type No } from "./catalogoModelo";
import { lerCatalogo, mudarCatalogo, porCatalogo, useCatalogo } from "./catalogoStore";
import { CAMPO, Retirar } from "./pecasCustos";
import { BotaoIcone, SubirDescer, type SecaoCat } from "./pecasCatalogo";

/** Campo de nome que grava com Enter (ou ao tocar em "Guardar") e fecha com Escape. */
function CampoNome({ rotulo, inicial = "", acao, onGravar, onFechar }: { rotulo: string; inicial?: string; acao: string; onGravar: (n: string) => string | null; onFechar: () => void }) {
  const [v, setV] = useState(inicial);
  const [erro, setErro] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const gravar = () => { const e = onGravar(v); setErro(e); };
  return (
    <span className="flex flex-wrap items-center gap-2">
      <input ref={ref} type="text" aria-label={rotulo} value={v} onChange={(e) => { setV(e.target.value); setErro(null); }}
        aria-invalid={!!erro} aria-describedby={erro ? "arv-erro" : undefined}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); gravar(); } else if (e.key === "Escape") onFechar(); }}
        className={cn(CAMPO, "w-64")} />
      <Button variant="outline" className="min-h-11 text-[15px]" onClick={gravar}>{acao}</Button>
      <Button variant="ghost" className="min-h-11 text-[15px]" onClick={onFechar}>Cancelar</Button>
      {erro && <span id="arv-erro" className="w-full text-[15px]">{erro}</span>}
    </span>
  );
}

// memo: só se redesenha quando o catálogo ou o editor aberto mudam
export const ClassificacaoV2 = memo(function ClassificacaoV2({ S, editor, setEditor, anunciar }: SecaoCat & { S: Estado }) {
  const K = useCatalogo();
  const sids = [...new Set([...Object.keys(S.svc), ...CATALOGO.map((c) => c.id)])];
  const A = K.arvore;
  const contas = (id: string) => {
    const n = contarNo(K, id, sids), p: string[] = [];
    if (n.svc) p.push(`${n.svc} ${n.svc === 1 ? "serviço" : "serviços"}`);
    if (n.mat) p.push(`${n.mat} ${n.mat === 1 ? "material" : "materiais"}`);
    if (n.pac) p.push(`${n.pac} ${n.pac === 1 ? "pacote" : "pacotes"}`);
    return p.join(" · ") || "vazio";
  };
  const juntar = (n: string, pai: string | null): string | null => {
    const r = juntarNo(lerCatalogo().arvore, n, pai);
    if ("erro" in r) return r.erro;
    mudarCatalogo((k) => { k.arvore = r.A; });
    setEditor(null);
    anunciar(pai ? `Sub «${n.trim()}» juntado` : `Ofício «${n.trim()}» juntado`);
    return null;
  };
  const renomear = (no: No, n: string): string | null => {
    const r = renomearNo(lerCatalogo().arvore, no.id, n);
    if ("erro" in r) return r.erro;
    mudarCatalogo((k) => { k.arvore = r.A; });
    setEditor(null);
    anunciar(`«${no.n}» passa a «${n.trim()}»`);
    return null;
  };
  const mover = (no: No, d: -1 | 1) => {
    mudarCatalogo((k) => { k.arvore = moverNo(k.arvore, no.id, d); });
    anunciar(`«${no.n}» ${d < 0 ? "subiu" : "desceu"}`);
  };
  const retirar = (no: No) => {
    const antes = lerCatalogo();
    mudarCatalogo((k) => retirarNo(k, no.id));
    setEditor(null);
    anunciar(no.pai ? `Sub «${no.n}» retirado: o que lá estava fica no ofício` : `Ofício «${no.n}» retirado: o que lá estava fica sem classificação`, () => porCatalogo(antes));
  };

  // as ações (renomear, subir, descer, + sub, retirar) aparecem só no nó escolhido
  const linha = (no: No, irmaos: No[]) => {
    const i = irmaos.findIndex((x) => x.id === no.id), ed = `arv:ren:${no.id}`;
    const escolhido = editor === `arv:${no.id}` || editor === ed || editor === `arv:sub:${no.id}`;
    return (
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
        {editor === ed ? (
          <CampoNome rotulo={`Novo nome de ${no.n}`} inicial={no.n} acao="Guardar" onGravar={(n) => renomear(no, n)} onFechar={() => setEditor(`arv:${no.id}`)} />
        ) : (
          <button type="button" aria-expanded={escolhido} aria-label={`${no.n}, ${contas(no.id)}`} onClick={() => setEditor(escolhido ? null : `arv:${no.id}`)}
            className={cn("min-h-11 rounded-lg px-1 text-left text-[15px] hover:underline", no.pai == null && "font-medium")}>
            {no.n}<span className="ml-2 font-normal text-muted-foreground">{contas(no.id)}</span>
          </button>
        )}
        {escolhido && <span className="flex items-center">
          <BotaoIcone rotulo={`Renomear ${no.n}`} I={Pencil} onClick={() => setEditor(editor === ed ? `arv:${no.id}` : ed)} />
          <SubirDescer nome={no.n} primeiro={i === 0} ultimo={i === irmaos.length - 1} onMover={(d) => mover(no, d)} />
          {no.pai == null && <BotaoIcone rotulo={`Juntar sub a ${no.n}`} I={Plus} onClick={() => setEditor(editor === `arv:sub:${no.id}` ? `arv:${no.id}` : `arv:sub:${no.id}`)} />}
          <Retirar rotulo={`Retirar ${no.n}`} onClick={() => retirar(no)} />
        </span>}
      </div>
    );
  };

  const ofs = oficios(A);
  return (
    <section id="cat-classificacao" aria-labelledby="cl-t" className="scroll-mt-6">
      <h2 id="cl-t" className="flex items-center gap-2 text-2xl font-semibold tracking-tight"><FolderTree className="h-6 w-6 text-primary" aria-hidden="true" />Classificação</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">Uma só árvore, ofício › sub, para os serviços, os materiais e os pacotes. Toque num nome para o renomear, mover, juntar um sub ou retirar. Retirar um sub passa o que lá estava para o ofício.</p>
      <ul className="mt-3 divide-y divide-border border-y border-border" aria-label="Ofícios">
        {ofs.map((of) => {
          const ss = subs(A, of.id);
          return (
            <li key={of.id}>
              {linha(of, ofs)}
              {(ss.length > 0 || editor === `arv:sub:${of.id}`) && (
                <ul className="ml-6 border-l-2 border-border pl-4" aria-label={`Subs de ${of.n}`}>
                  {ss.map((s) => <li key={s.id}>{linha(s, ss)}</li>)}
                  {editor === `arv:sub:${of.id}` && (
                    <li className="py-2"><CampoNome rotulo={`Nome do sub de ${of.n}`} acao="Juntar sub" onGravar={(n) => juntar(n, of.id)} onFechar={() => setEditor(null)} /></li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {editor === "arv:of" ? (
        <div className="mt-3"><CampoNome rotulo="Nome do ofício" acao="Juntar ofício" onGravar={(n) => juntar(n, null)} onFechar={() => setEditor(null)} /></div>
      ) : (
        <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => setEditor("arv:of")}><Plus className="h-4 w-4" aria-hidden="true" />Novo ofício</Button>
      )}
    </section>
  );
});
