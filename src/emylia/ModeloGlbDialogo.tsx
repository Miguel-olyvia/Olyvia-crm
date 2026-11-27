// 27/11: o diálogo do GLB PRÓPRIO, o mesmo para uma categoria, uma subcategoria e um Modelo do Catálogo (a ordem do dono: «adicionar um modelo glb para 3D nas categorias, subcategorias
// ou modelos»). O ficheiro só dá a FORMA: as medidas, a cor e a textura vêm sempre do produto. Escolhe-se (botão ou arrastar e largar), valida-se logo (glbValidar.ts: erros e avisos
// ligados ao campo), vê-se em 3D só se se pedir (ModeloGlbPrevia.tsx) e carrega-se, substitui-se ou remove-se com uma confirmação que diz quantos produtos mudam. A gravação é de
// modeloGlbDados.ts (valida outra vez, carrega, liga e só depois apaga o ficheiro antigo). `aoTerminar` é da página: relê a lista e anuncia (mensagem) ou só relê (null, houve falha);
// o diálogo espera por ela antes de fechar, para o foco voltar a um botão que já esteja ativo. Foco preso (Radix), Esc fecha (ou volta atrás na confirmação), sem Esc a meio da gravação.
import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Box, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { NOTA } from "./pecasForm";
import { ConfirmarMudanca, Razao, protegido } from "./gestaoPecas";
import { guardarGlbProprio, lerBytes, removerGlbProprio, urlDoGlbProprio, type AlvoGlb } from "./modeloGlbDados";
import { chipGlb, fraseDoUso, milhares, tamanhoGlb, textoAlternativoGlb, type NivelGlb } from "./glbProprioTextos";
import { LIMITE_BYTES, analisarGlb, type AnaliseGlb } from "./planta3d/glbValidar";
import { ModeloGlbPrevia, type FontePrevia } from "./ModeloGlbPrevia";

export interface ModeloGlbDialogoProps {
  org: string;
  /** Onde o GLB se carrega: uma categoria, uma subcategoria ou um Modelo (a base trata as duas primeiras como a mesma tabela). */
  nivel: NivelGlb;
  id: string;
  /** O nome do nível, para os textos («Casa de banho», «SORTY»). */
  nome: string;
  /** O que já está guardado (do que a página leu): sem caminho, ainda não há GLB. */
  atual: { caminho: string | null; bytes: number | null };
  /** Quantos produtos usam este nível, quando a página o sabe (null ou em falta: as confirmações não dizem um número). */
  usados?: number | null;
  /** Depois de gravar (`mensagem`: o que se anuncia) ou de falhar (null): a página relê. O diálogo espera por ela. */
  aoTerminar: (mensagem: string | null) => Promise<void> | void;
  aoFechar: () => void;
}

/** `ok` guarda os bytes e uma chave só deste ficheiro: a pré-visualização lê-o da memória (e não por um endereço `blob:`, que a CSP da aplicação bloquearia). */
type Analise = { t: "a-validar" } | { t: "recusado"; erros: string[] } | { t: "ok"; r: AnaliseGlb; dados: ArrayBuffer; chave: string };
type Acao = "carregar" | "remover";

const TIPO: Record<NivelGlb, string> = { categoria: "Da categoria", subcategoria: "Da subcategoria", modelo: "Do modelo" };
const FALHA = "Não foi possível guardar o modelo 3D próprio.";
const ERRO_EXTENSAO = "O ficheiro tem de ser um ficheiro .glb (binário), não .gltf nem outro formato.";
const ERRO_LER = "Não foi possível ler o ficheiro.";
const BOTAO = "min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50";
const ERRO = "text-[15px] text-red-700 dark:text-red-400";

export function ModeloGlbDialogo({ org, nivel, id, nome, atual, usados, aoTerminar, aoFechar }: ModeloGlbDialogoProps) {
  const alvo: AlvoGlb = nivel === "modelo" ? "modelo" : "categoria";
  const base = useId();
  const ids = { ajuda: `${base}-ajuda`, erro: `${base}-erro`, avisos: `${base}-avisos`, razao: `${base}-razao`, painel: `${base}-painel`, texto3d: `${base}-texto3d` };
  const [ficheiro, setFicheiro] = useState<File | null>(null);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [arrastar, setArrastar] = useState(false);
  const [confirmar, setConfirmar] = useState<Acao | null>(null);
  const [focar, setFocar] = useState<Acao | null>(null);
  const [aGravar, setAGravar] = useState<Acao | null>(null);
  const [erroGravar, setErroGravar] = useState<string | null>(null);
  const [ver3d, setVer3d] = useState(false);
  const campo = useRef<HTMLInputElement>(null), botaoCarregar = useRef<HTMLButtonElement>(null), botaoRemover = useRef<HTMLButtonElement>(null);
  const validacao = useRef(0), contador = useRef(0), ocupado = useRef(false), vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const valido = analise?.t === "ok" && ficheiro ? { f: ficheiro, r: analise.r, dados: analise.dados, chave: analise.chave } : null;
  // depois de «Voltar» na confirmação, o foco regressa ao botão que a abriu
  useEffect(() => {
    if (!focar || confirmar) return;
    (focar === "carregar" ? botaoCarregar : botaoRemover).current?.focus();
    setFocar(null);
  }, [focar, confirmar]);

  const escolher = async (f: File | null) => {
    const minha = ++validacao.current;
    setConfirmar(null); setErroGravar(null); setFicheiro(f);
    if (!f) { setAnalise(null); return; }
    if (!/\.glb$/i.test(f.name)) { setAnalise({ t: "recusado", erros: [ERRO_EXTENSAO] }); return; }
    if (f.size > LIMITE_BYTES) { setAnalise({ t: "recusado", erros: [`O ficheiro tem ${tamanhoGlb(f.size)}: o limite é 5 MB. Reduza as texturas ou use compressão meshopt.`] }); return; }
    setAnalise({ t: "a-validar" });
    let r: AnaliseGlb | null = null, dados: ArrayBuffer | null = null;
    try { dados = await lerBytes(f); r = await analisarGlb(dados); } catch { r = null; }
    if (validacao.current !== minha || !vivo.current) return;
    setAnalise(!r || !dados ? { t: "recusado", erros: [ERRO_LER] } : r.ok ? { t: "ok", r, dados, chave: `glb-local:${base}:${++contador.current}` } : { t: "recusado", erros: r.erros.length > 0 ? r.erros : [ERRO_LER] });
  };
  const largar = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setArrastar(false); if (!aGravar) void escolher(e.dataTransfer?.files?.[0] ?? null); };
  const sobre = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); if (!aGravar) setArrastar(true); };

  const gravar = async (acao: Acao) => {
    if (ocupado.current) return;
    if (acao === "carregar" && !valido) return;
    ocupado.current = true; setAGravar(acao); setErroGravar(null);
    let mensagem: string | null = null;
    try {
      if (acao === "carregar" && valido) {
        const r = await guardarGlbProprio(org, alvo, id, valido.f);
        if (r.ok === false) setErroGravar(r.erro);
        else mensagem = `Modelo 3D próprio de «${nome}» ${atual.caminho ? "substituído" : "carregado"} (${tamanhoGlb(r.v.bytes)}).`;
      } else {
        const r = await removerGlbProprio(org, alvo, id);
        if (r.ok === false) setErroGravar(r.erro);
        else mensagem = `Modelo 3D próprio de «${nome}» removido: o 3D volta ao modelo escolhido ou ao automático.`;
      }
    } catch {
      setErroGravar(FALHA);
    }
    try { await aoTerminar(mensagem); } catch { /* a página relê na próxima vez */ }
    ocupado.current = false;
    if (!vivo.current) return;
    setAGravar(null);
    if (mensagem) aoFechar();
  };

  const erros = analise?.t === "recusado" ? analise.erros : [];
  const avisos = analise?.t === "ok" ? analise.r.avisos : [];
  const motivo = aGravar ? "A guardar…" : analise?.t === "a-validar" ? "A validar o ficheiro…" : analise?.t === "recusado" ? "Corrija o ficheiro: veja o erro acima." : !valido ? "Escolha um ficheiro .glb para carregar." : null;
  const estado = aGravar === "carregar" ? "A carregar o modelo 3D…" : aGravar === "remover" ? "A remover o modelo 3D…" : analise?.t === "a-validar" ? "A validar o ficheiro…"
    : valido ? `Ficheiro válido: ${milhares(valido.r.triangulos)} ${valido.r.triangulos === 1 ? "triângulo" : "triângulos"}, ${tamanhoGlb(valido.r.bytes)}.` : "";
  const descrito = [ids.ajuda, erros.length > 0 && ids.erro, avisos.length > 0 && ids.avisos].filter(Boolean).join(" ");
  const urlAtual = valido || analise ? null : urlDoGlbProprio(atual.caminho);
  const fonte3d: FontePrevia | null = valido ? { t: "local", chave: valido.chave, dados: valido.dados } : urlAtual ? { t: "url", url: urlAtual } : null;
  const texto3d = valido ? textoAlternativoGlb({ nome, triangulos: valido.r.triangulos, bytes: valido.r.bytes, materiais: valido.r.materiais }) : textoAlternativoGlb({ nome, bytes: atual.bytes });
  const verbo = atual.caminho ? "Substituir" : "Carregar";

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !aGravar) aoFechar(); }}>
      <DialogContent className="max-w-xl" closeLabel="Fechar"
        onOpenAutoFocus={(e) => { e.preventDefault(); campo.current?.focus(); }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (aGravar) { e.preventDefault(); return; } if (confirmar) { e.preventDefault(); setConfirmar(null); setFocar(confirmar); } }}>
        <DialogHeader>
          <DialogTitle>Modelo 3D próprio</DialogTitle>
          <DialogDescription>{TIPO[nivel]} «{nome}». O ficheiro só dá a forma: as medidas, a cor e a textura vêm sempre do produto.</DialogDescription>
        </DialogHeader>

        {atual.caminho && <p className={NOTA}>Modelo atual: <span className="font-medium text-foreground">{chipGlb(atual.caminho, atual.bytes)}</span></p>}

        <div data-testid="zona-glb" data-a-arrastar={String(arrastar)} onDragOver={sobre} onDragEnter={sobre} onDragLeave={() => setArrastar(false)} onDrop={largar}
          className={cn("grid gap-2 rounded-xl border border-dashed p-3 transition-colors", arrastar ? "border-primary bg-primary/5" : "border-foreground/40 bg-card")}>
          <label htmlFor={`${base}-ficheiro`} className="text-[15px] font-medium">Ficheiro GLB</label>
          <input ref={campo} id={`${base}-ficheiro`} type="file" accept=".glb,model/gltf-binary" aria-describedby={descrito} aria-invalid={erros.length > 0 ? true : undefined}
            onChange={(e) => { void escolher(e.target.files?.[0] ?? null); }}
            className="block w-full rounded-lg text-[15px] outline-none file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-lg file:border file:border-foreground/40 file:bg-card file:px-3.5 file:text-[15px] file:text-foreground hover:file:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background" />
          <p id={ids.ajuda} className={NOTA}>Escolha ou arraste para aqui um ficheiro .glb (autocontido, até 5 MB, sem compressão Draco). Orientação: Y para cima e a frente virada para +Z, a convenção do glTF.</p>
          {ficheiro && <p className={NOTA}>Ficheiro escolhido: <span className="font-medium text-foreground">{ficheiro.name}</span> ({tamanhoGlb(ficheiro.size)})</p>}
        </div>

        {erros.length > 0 && (
          <div id={ids.erro} role="alert" className={ERRO}>
            <ul className="grid gap-1">{erros.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
        {avisos.length > 0 && (
          <ul id={ids.avisos} className="grid gap-1 rounded-xl bg-muted/50 p-3 text-[15px]">{avisos.map((x) => <li key={x}>{x}</li>)}</ul>
        )}
        <p role="status" className={cn(NOTA, "flex items-center gap-2 empty:hidden")}>
          {aGravar || analise?.t === "a-validar" ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}{estado}
        </p>

        {(fonte3d || ver3d) && (
          <div className="grid gap-2">
            <button type="button" aria-expanded={ver3d} aria-controls={ids.painel} onClick={() => setVer3d((v) => !v)}
              className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted aria-expanded:border-primary aria-expanded:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background">
              <Box className="h-4 w-4 text-primary" aria-hidden="true" />Ver em 3D
            </button>
            <div id={ids.painel}>
              {ver3d && fonte3d && (
                <div role="region" aria-label="Pré-visualização do modelo 3D" aria-describedby={ids.texto3d} className="grid gap-2">
                  <ModeloGlbPrevia key={fonte3d.t === "local" ? fonte3d.chave : fonte3d.url} fonte={fonte3d} nome={nome} />
                  <p id={ids.texto3d} className={NOTA}>{texto3d}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {confirmar ? (
          <ConfirmarMudanca aGravar={!!aGravar} erro={erroGravar}
            titulo={confirmar === "remover" ? `Remover o modelo 3D próprio de «${nome}»?` : atual.caminho ? `Substituir o modelo 3D próprio de «${nome}»?` : `Carregar este modelo 3D em «${nome}»?`}
            texto={`${fraseDoUso(nivel, usados)} ${confirmar === "remover" ? "Depois de remover, o 3D volta ao modelo escolhido ou ao automático." : atual.caminho ? "O ficheiro anterior deixa de se usar." : "A forma passa a ser a do ficheiro."}`}
            onConfirmar={() => void gravar(confirmar)} onVoltar={() => { setConfirmar(null); setFocar(confirmar); setErroGravar(null); }} />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button ref={botaoCarregar} className={BOTAO} {...protegido(motivo, ids.razao, () => setConfirmar("carregar"))}>{verbo}</Button>
            <Razao id={ids.razao}>{motivo}</Razao>
            {atual.caminho && (
              <Button ref={botaoRemover} variant="outline" className={BOTAO} aria-label={`Remover o modelo 3D próprio de ${nome}`} {...protegido(aGravar ? "A guardar…" : null, ids.razao, () => setConfirmar("remover"))}>
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Remover…
              </Button>
            )}
            {erroGravar && <p role="alert" className={ERRO}>{erroGravar}</p>}
            <Button variant="ghost" className={cn(BOTAO, "ml-auto")} disabled={!!aGravar} onClick={aoFechar}>Fechar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
