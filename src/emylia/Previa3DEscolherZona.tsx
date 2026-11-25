// 25/11: o painel «Zona: Frente» da pré-visualização 3D: a zona escolhida (clicando numa parte da peça, ou pelo botão da zona no painel «Zonas», que é a via de teclado e de leitor de ecrã),
// o atributo que a pinta HOJE (por omissão ou por ligação) e «Pintar com: …»: um dos atributos do produto, «Pelo nome (como por omissão)» ou «Nenhum». Escolher actualiza o RASCUNHO das
// ligações (o 3D acompanha logo, como no painel «Ligações») e «Guardar neste produto» grava-as. Sem configuração 3D (`ligacoes` ausente) só mostra o que pinta a zona. Sem three: só o ecrã.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { AmostraOpcao } from "./AmostraOpcao";
import { erroDasLigacoes, type Ligacao } from "./config3dDados";
import { aplicarEscolhaNaZona, escolhaAtualDaZona, type ContextoEscolha, type EscolhaDaZona } from "./escolherZona";
import type { LeituraDoProduto } from "./planta3d/acabamentoCor3d";
import { rotuloDaZona, type ZonaGlb, type ZonaVisual } from "./planta3d/zonasGlb";

const NOTA = "text-[15px] text-muted-foreground";
const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
const DESLIGADO = "cursor-not-allowed opacity-50 hover:bg-card";
const OPCAO = "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-input bg-card px-3 py-2 text-[15px] transition-colors hover:bg-muted has-[:checked]:border-primary has-[:checked]:bg-muted has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary/25";

/** Como se diz o que pinta a zona hoje: o atributo e de onde vem («por omissão» pelo nome, «por ligação» escolhida), ou que nenhum a pinta. */
function textoDoQuePinta(zona: ZonaVisual | undefined, escolha: EscolhaDaZona | null, nomeDoAtributo: (id: string) => string | undefined): string {
  if (escolha?.tipo === "nenhum") return "nenhum atributo (a zona fica na cor do modelo)";
  const nome = zona?.atributo || (escolha?.tipo === "atributo" ? nomeDoAtributo(escolha.id) : undefined);
  if (!nome) return "nenhum atributo de cor (a zona fica na cor do modelo)";
  return `${nome} (${escolha?.tipo === "atributo" ? "por ligação" : "por omissão"})`;
}

export interface LigacoesEditaveis {
  valor: readonly Ligacao[];
  /** O rascunho difere do que está guardado: só então se pode guardar. */
  alterado: boolean;
  podeEditar: boolean;
  aoMudar: (l: Ligacao[]) => void;
  /** Devolve o erro em texto, ou null se correu bem. */
  gravar: () => Promise<string | null>;
}

export interface PropsEscolherZona {
  zona: ZonaGlb;
  /** O que pinta a zona hoje (a aparência da pré-visualização); ausente: nenhum atributo. */
  pintadaPor: ZonaVisual | undefined;
  /** Os atributos do produto que dão cor ou foto (os que se podem escolher). */
  atributos: readonly LeituraDoProduto[];
  /** As ligações em vigor; ausente quando não há configuração 3D (então só se vê). */
  ligacoes?: LigacoesEditaveis;
  /** As zonas que um atributo pinta hoje: para ligá-lo a outra zona sem tirar o que ele já pinta. */
  pintaHoje: (atributo: string) => readonly ZonaGlb[];
  /** Os atributos que pintam uma zona só pelo nome (ver escolherZona.ts): a ligação escolhida manda sobre eles. */
  pelaNome?: ContextoEscolha["pelaNome"];
  /** A zona foi escolhida clicando no 3D: o foco passa ao título do painel (quem a escolhe pelo botão do painel «Zonas» fica onde estava). */
  focarAoAbrir?: boolean;
  /** Fecha (botão X ou Escape): quem abriu devolve o foco ao sítio de onde veio. */
  aoFechar: () => void;
}

// O estado do painel (mensagem, anúncio, escolha em curso) é DESTA zona: quem o usa leva `key={zona}` para ele não passar à zona seguinte.
export function PainelEscolherZona({ zona, pintadaPor, atributos, ligacoes, pintaHoje, pelaNome, focarAoAbrir = false, aoFechar }: PropsEscolherZona) {
  const id = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (focarAoAbrir) titulo.current?.focus(); }, [focarAoAbrir]);
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const [anuncio, setAnuncio] = useState("");
  const nomeDe = (a: string) => atributos.find((x) => x.id === a)?.nome;
  const ids = atributos.map((a) => a.id);
  const atual = ligacoes ? escolhaAtualDaZona(ligacoes.valor, zona, ids, pintadaPor?.atributo, nomeDe) : null;
  const rotulo = rotuloDaZona(zona);
  const editavel = !!ligacoes?.podeEditar;
  const invalida = ligacoes ? erroDasLigacoes(ligacoes.valor) : null;
  const podeGuardar = !!ligacoes && ligacoes.alterado && !invalida && !ocupado;

  const escolher = (e: EscolhaDaZona, depois: string) => {
    if (!ligacoes) return;
    setMsg(null);
    const nova = aplicarEscolhaNaZona(ligacoes.valor, zona, e, { atributosDaCor: ids, pintaHoje, pelaNome });
    if (JSON.stringify(nova) === JSON.stringify(ligacoes.valor)) return; // nada mudou (ex.: «Nenhum» sem atributos de cor): não se anuncia
    ligacoes.aoMudar(nova);
    setAnuncio(`${rotulo}: ${depois}`);
  };
  const aoTeclar = (e: KeyboardEvent<HTMLElement>) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); aoFechar(); } };
  // a ligação gravada é a um atributo que o produto já não tem: o rádio dele não existe, e sem este nenhum ficava marcado
  const foraDoProduto = atual?.tipo === "atributo" && !ids.includes(atual.id);
  const guardar = async () => {
    if (!ligacoes || !podeGuardar) return;
    setOcupado(true); setMsg(null);
    try { const erro = await ligacoes.gravar(); setMsg(erro ? { erro: true, texto: erro } : { erro: false, texto: "Ligações guardadas neste produto." }); } finally { setOcupado(false); }
  };
  const marcado = (e: EscolhaDaZona): boolean => !!atual && atual.tipo === e.tipo && (e.tipo !== "atributo" || (atual.tipo === "atributo" && atual.id === e.id));

  return (
    <section aria-labelledby={`${id}-t`} onKeyDown={aoTeclar} className="grid gap-3 rounded-xl border border-primary/50 bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 id={`${id}-t`} ref={titulo} tabIndex={-1} className="text-[15px] font-semibold focus:outline-none">Zona: {rotulo}</h3>
        <button type="button" onClick={aoFechar} aria-label={`Deixar de escolher a zona ${rotulo}`} title="Fechar" className={cn(BOTAO, "min-w-11 px-0")}><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <p className="text-[15px]">
        Pinta-a hoje: {textoDoQuePinta(pintadaPor, atual, nomeDe)}{pintadaPor?.acabamento ? ` · Superfície: ${pintadaPor.acabamento}` : ""}
      </p>

      {!ligacoes && <p className={NOTA}>Só para ver: a escolha do atributo faz-se na ficha de um produto da base.</p>}
      {ligacoes && !editavel && <p className={NOTA}>Para escolher o que pinta esta zona precisa da permissão de editar produtos.</p>}
      {editavel && atributos.length === 0 && <p className={NOTA}>Este produto não tem nenhum atributo de cor ou foto para escolher.</p>}
      {editavel && (
        <fieldset className="grid min-w-0 gap-2 border-0 p-0">
          <legend className="mb-1 text-[15px] font-medium">Pintar com:</legend>
          <label className={OPCAO}>
            <input type="radio" name={`${id}-r`} checked={marcado({ tipo: "nome" })} onChange={() => escolher({ tipo: "nome" }, "pelo nome")} className="h-5 w-5 shrink-0 accent-primary" />
            <span>Pelo nome (como por omissão)</span>
          </label>
          {foraDoProduto && (
            <label className={OPCAO}>
              <input type="radio" name={`${id}-r`} checked readOnly className="h-5 w-5 shrink-0 accent-primary" />
              <span>Ligação a um atributo que o produto já não tem</span>
            </label>
          )}
          {atributos.map((a) => (
            <label key={a.id} className={OPCAO}>
              <input type="radio" name={`${id}-r`} checked={marcado({ tipo: "atributo", id: a.id })} onChange={() => escolher({ tipo: "atributo", id: a.id }, a.nome)} className="h-5 w-5 shrink-0 accent-primary" />
              <AmostraOpcao foto={a.opcao.foto} hex={a.opcao.hex} nome={a.opcao.nome} />
              <span><strong className="font-medium">{a.nome}</strong>{" "}<span className="text-muted-foreground">{a.opcao.nome}</span></span>
            </label>
          ))}
          <label className={OPCAO}>
            <input type="radio" name={`${id}-r`} checked={marcado({ tipo: "nenhum" })} onChange={() => escolher({ tipo: "nenhum" }, "nenhum")} className="h-5 w-5 shrink-0 accent-primary" />
            <span>Nenhum (não pintar esta zona)</span>
          </label>
        </fieldset>
      )}

      {editavel && (
        <div className="flex flex-wrap items-center gap-3">
          {/* aria-disabled (e não disabled): um botão desactivado perde o foco do teclado ao ser carregado */}
          <button type="button" aria-disabled={!podeGuardar} onClick={() => void guardar()} className={cn(BOTAO, !podeGuardar && DESLIGADO)}>Guardar neste produto</button>
          {!ligacoes!.alterado && !ocupado && <span className={NOTA}>Sem alterações para guardar.</span>}
        </div>
      )}
      {invalida && <p role="alert" className="text-[15px] text-red-700 dark:text-red-400">{invalida}</p>}
      <p aria-live="polite" className="sr-only">{anuncio}</p>
      <p aria-live="polite" className={NOTA}>{msg && !msg.erro ? msg.texto : ""}</p>
      {msg?.erro && <p role="alert" className="text-[15px] text-red-700 dark:text-red-400">{msg.texto}</p>}
    </section>
  );
}
