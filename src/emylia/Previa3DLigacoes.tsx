// 25/11: o painel «Ligações» do 3D do produto: que atributo pinta que zona (frente, corpo, tampo…) e se «aplica» ou não. Sem ligações, cada zona é pintada pelo NOME do atributo
// («Cor da frente», «Cor do corpo», «Cor»); uma ligação explícita manda sobre o nome. «Aplicar: não» tira o atributo dessa zona. Controlado: o rascunho vive em quem o usa (o 3D mostra-o
// logo) e a gravação (por produto; a subcategoria e a categoria vêm depois) é de quem o usa (`gravar`, `herdar`: devolvem o erro em texto, ou null se correu bem). Sem three: só o ecrã.
import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { erroDasLigacoes, rotuloDaOrigemConfig, type Ligacao, type OrigemConfig, type ZonaLigacao } from "./config3dDados";
import type { LeituraDoProduto, LeituraPorOmissao } from "./planta3d/acabamentoCor3d";
import type { Eixos } from "./planta3d/eixosMedida";
import { sem } from "./planta3d/catalogo3d";
import { ZONAS, rotuloDaZona, type ZonaGlb } from "./planta3d/zonasGlb";

const NOTA = "text-[15px] text-muted-foreground";
const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-input bg-card px-4 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
const SELECT = "min-h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25";
const DESLIGADO = "cursor-not-allowed opacity-50 hover:bg-card";
const DESCONHECIDO = "Atributo desconhecido";
const SEM_ESTE = "o produto já não tem este atributo";

/** `fora`: o atributo tem uma ligação gravada mas o produto já não o tem (ou já não tem valor escolhido): só serve para a ver e remover, nunca para ligar de novo. */
export interface AtributoLigavel { id: string; nome: string; fora?: boolean }
export interface PropsLigacoes {
  /** As ligações em vigor no ecrã (o rascunho, ou as guardadas ou herdadas). */
  valor: readonly Ligacao[];
  /** O rascunho difere do que está guardado: só então se pode guardar. */
  alterado: boolean;
  /** De onde vêm as ligações guardadas, e se este produto tem as suas (só então se pode «voltar a herdar»). */
  origem: OrigemConfig; proprio: boolean;
  /** Os atributos de lista do produto que se podem ligar (a Medida não pinta nada). */
  atributos: readonly AtributoLigavel[];
  /** 25/11: os atributos QUE O PRODUTO TEM (com valor escolhido) com hex, foto ou aspeto, e o que o 3D faz com cada um por omissão (sem configuração): aplicado pelo nome, ou desligado. Ausente: a lista não se mostra; vazia: diz que o produto não tem nenhum. */
  omissoes?: readonly LeituraPorOmissao[];
  /** As zonas que o modelo tem. */
  zonas: readonly ZonaGlb[];
  /** Ligações da base a atributos que já não existem, e ligações inválidas que o leitor largou. */
  orfas: number; ignoradas: number;
  podeEditar: boolean;
  aoMudar: (l: Ligacao[]) => void;
  gravar: () => Promise<string | null>;
  herdar: () => Promise<string | null>;
}

/**
 * A configuração 3D que a pré-visualização recebe (só existe quando a base a devolveu: sem ela o painel «Medidas» é só para ver, como era). Os eixos: os guardados (ou herdados), de onde
 * vêm, se são deste produto, e como se gravam (null herda). As ligações: o que o painel «Ligações» precisa (sem `zonas` nem `podeEditar`, que a pré-visualização acrescenta).
 */
export interface Config3dPrevia {
  podeEditar: boolean;
  eixos: { guardados: Eixos | null; origem: OrigemConfig; proprio: boolean; gravar: (e: Eixos | null) => Promise<string | null> };
  ligacoes: Omit<PropsLigacoes, "zonas" | "podeEditar">;
  /** 25/11: os atributos QUE O PRODUTO TEM (com valor escolhido) que o 3D lê, com a opção escolhida: o que o painel «Zona» oferece em «Pintar com:». Ausente: nenhum. */
  atributosDoProduto?: readonly LeituraDoProduto[];
}

const rotuloDaZonaLigacao =(z: ZonaLigacao): string => (z === "tudo" ? "Tudo" : rotuloDaZona(z));

/**
 * A zona que «Ligar» propõe, pelo nome do atributo: puxador/tirador/pega → «Puxadores»; «… do corpo» → Corpo; «… da frente» → Frente; senão «Tudo». Só propõe uma zona que o modelo tem
 * (as `ofertadas`); sem ela fica «Tudo». Nunca a primeira zona do modelo à sorte (um Puxador na frente pintava as portas).
 */
function zonaProposta(nome: string, ofertadas: readonly ZonaLigacao[]): ZonaLigacao {
  const n = sem(nome);
  const tem = (z: ZonaLigacao): boolean => ofertadas.includes(z);
  if (/puxador|tirador|pega/.test(n)) return tem("puxadores") ? "puxadores" : "tudo";
  if (/\bcorpo\b/.test(n) && tem("corpo")) return "corpo";
  if (/\bfrente\b/.test(n) && tem("frente")) return "frente";
  return "tudo";
}
const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;

/** Um interruptor «Aplicar» (sim/não), com o estado também em texto. */
function Aplicar({ ligado, aoMudar }: { ligado: boolean; aoMudar: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={() => aoMudar(!ligado)} className={cn(BOTAO, "justify-start gap-2 px-3")}>
      <span aria-hidden="true" className={cn("relative inline-block h-5 w-9 shrink-0 rounded-full border border-input transition-colors", ligado ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 h-3.5 w-3.5 rounded-full bg-background shadow transition-all", ligado ? "left-[18px]" : "left-0.5")} />
      </span>
      Aplicar
      <span aria-hidden="true" className="text-muted-foreground">{ligado ? "sim" : "não"}</span>
    </button>
  );
}

/** O estado de um atributo no painel: o das ligações guardadas ou do rascunho, se as há; senão o que vale por omissão. */
function estadoDoAtributo(o: LeituraPorOmissao, valor: readonly Ligacao[]): string {
  const ls = valor.filter((l) => l.atributo === o.id);
  if (ls.length) return `ligado: ${ls.map((l) => `${rotuloDaZonaLigacao(l.zona)} ${l.aplicar ? "sim" : "não"}`).join(", ")}`;
  return o.aplicado ? `aplicado por omissão (${o.onde})` : "desligado por omissão";
}

export function Previa3DLigacoes({ valor, alterado, origem, proprio, atributos, omissoes, zonas, orfas, ignoradas, podeEditar, aoMudar, gravar, herdar }: PropsLigacoes) {
  const id = useId();
  const [ocupado, setOcupado] = useState(false);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  // o que «Ligar» e «Desligar» acabaram de fazer, para a região viva o anunciar (o botão não desaparece, mas o leitor de ecrã não vê a lista mudar)
  const [anuncio, setAnuncio] = useState("");
  const nomeDe = (a: string) => atributos.find((x) => x.id === a)?.nome ?? DESCONHECIDO;
  const foraDe = (a: string) => atributos.find((x) => x.id === a)?.fora === true;
  // o que se pode ligar de novo: só os atributos que o produto tem
  const ligaveis = atributos.filter((a) => !a.fora);
  // as zonas oferecidas: «Tudo», as do modelo e, para não as perder, as já usadas que o modelo não tem
  const usadas = new Set(valor.map((l) => l.zona));
  const zonasOfertadas: ZonaLigacao[] = ["tudo", ...ZONAS.filter((z) => zonas.includes(z) || usadas.has(z))];
  const rotuloOrigem = rotuloDaOrigemConfig(origem);
  const invalida = erroDasLigacoes(valor);
  const livre = (): Ligacao | null => {
    for (const a of ligaveis) for (const z of zonasOfertadas) if (!valor.some((l) => l.atributo === a.id && l.zona === z)) return { atributo: a.id, zona: z, aplicar: true };
    return null;
  };
  const mudar = (i: number, parte: Partial<Ligacao>) => { setMsg(null); aoMudar(valor.map((l, j) => (j === i ? { ...l, ...parte } : l))); };
  const correr = async (fazer: () => Promise<string | null>, ok: string) => {
    if (ocupado) return;
    setOcupado(true); setMsg(null);
    try { const erro = await fazer(); setMsg(erro ? { erro: true, texto: erro } : { erro: false, texto: ok }); } finally { setOcupado(false); }
  };
  const podeGuardar = alterado && !invalida && !ocupado;
  // porque é que «Guardar ligações» está desactivado: o aviso da ligação inválida, ou uma nota curta (sem alterações, a guardar)
  const idInvalida = `${id}-invalida`, idRazao = `${id}-razao`;
  const razaoGuardar = invalida ? null : ocupado ? "A guardar…" : !alterado ? "Sem alterações para guardar." : null;
  const descreveGuardar = podeGuardar ? undefined : invalida ? idInvalida : idRazao;

  return (
    <section aria-labelledby={`${id}-t`} className="grid gap-3 rounded-xl border border-border bg-card p-3">
      <h3 id={`${id}-t`} className="text-[15px] font-semibold">Ligações</h3>
      <p className={NOTA}>
        {rotuloOrigem ? `Ligações ${rotuloOrigem}. ` : "Sem ligações guardadas: cada zona é pintada pelo nome do atributo («Cor da frente» pinta a frente, «Cor do corpo» o corpo, «Cor» o resto). "}
        Uma ligação manda sobre o nome; «Aplicar: não» tira o atributo dessa zona.
      </p>

      {omissoes && omissoes.length === 0 && <p className={NOTA}>Este produto não tem nenhum atributo que pinte o 3D (cor, foto ou aspeto escolhidos): não há nada para ligar.</p>}
      {omissoes && omissoes.length > 0 && (
        <div className="grid gap-1">
          <h4 className="text-[15px] font-medium">Atributos que o 3D lê</h4>
          <ul className="grid gap-2 text-[15px]">
            {omissoes.map((o) => {
              const proprias = valor.filter((l) => l.atributo === o.id);
              // ligado (aplica) hoje: pelas ligações do atributo, se as há; senão pelo que vale por omissão
              const ativo = proprias.length ? proprias.some((l) => l.aplicar) : o.aplicado;
              const alternar = () => {
                setMsg(null);
                const resto = valor.filter((l) => l.atributo !== o.id);
                if (ativo) { aoMudar(o.aplicado ? [...resto, { atributo: o.id, zona: "tudo", aplicar: false }] : resto); setAnuncio(`${o.nome} desligado`); return; }
                const zona = zonaProposta(o.nome, zonasOfertadas);
                aoMudar([...resto, { atributo: o.id, zona, aplicar: true }]);
                setAnuncio(`${o.nome} ligado à zona ${rotuloDaZonaLigacao(zona)}`);
              };
              return (
                <li key={o.id} className="flex flex-wrap items-center gap-2">
                  <span><strong className="font-medium">{o.nome}</strong>: {estadoDoAtributo(o, valor)}</span>
                  {/* o MESMO botão muda de rótulo (Ligar ↔ Desligar) em vez de desaparecer: assim o foco do teclado fica nele, e a região viva anuncia o resultado */}
                  {podeEditar && <button type="button" aria-label={`${ativo ? "Desligar" : "Ligar"} ${o.nome}`} onClick={alternar} className={BOTAO}>{ativo ? "Desligar" : "Ligar"}</button>}
                </li>
              );
            })}
          </ul>
          <p aria-live="polite" className="sr-only">{anuncio}</p>
        </div>
      )}

      {!podeEditar ? (
        <>
          {valor.length > 0 && (
            <ul className="grid gap-1 text-[15px]">
              {valor.map((l, i) => <li key={i}>{nomeDe(l.atributo)} → {rotuloDaZonaLigacao(l.zona)}: {l.aplicar ? "aplica" : "não aplica"}{foraDe(l.atributo) ? ` (${SEM_ESTE})` : ""}</li>)}
            </ul>
          )}
          <p className={NOTA}>Para mudar as ligações precisa da permissão de editar produtos.</p>
        </>
      ) : (
        <>
          {atributos.length === 0 && !omissoes && <p className={NOTA}>Nenhum atributo deste produto tem cor, foto ou aspeto: não há atributos para ligar ao 3D.</p>}
          <div className="grid gap-3">
            {valor.map((l, i) => {
              const conhecido = atributos.some((a) => a.id === l.atributo);
              return (
                <div key={i} role="group" aria-label={`Ligação ${i + 1}`} className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                  <div className="grid gap-1">
                    <label htmlFor={`${id}-a${i}`} className="text-[15px] font-medium">Atributo</label>
                    <select id={`${id}-a${i}`} value={l.atributo} onChange={(e) => mudar(i, { atributo: e.target.value })} className={SELECT}>
                      {!conhecido && <option value={l.atributo}>{DESCONHECIDO}</option>}
                      {atributos.filter((a) => !a.fora || a.id === l.atributo).map((a) => <option key={a.id} value={a.id}>{a.fora ? `${a.nome} (${SEM_ESTE})` : a.nome}</option>)}
                    </select>
                    {foraDe(l.atributo) && <p className={NOTA}>O produto já não tem este atributo: remova a ligação.</p>}
                  </div>
                  <div className="grid gap-1">
                    <label htmlFor={`${id}-z${i}`} className="text-[15px] font-medium">Zona</label>
                    <select id={`${id}-z${i}`} value={l.zona} onChange={(e) => mudar(i, { zona: e.target.value as ZonaLigacao })} className={SELECT}>
                      {zonasOfertadas.map((z) => <option key={z} value={z}>{rotuloDaZonaLigacao(z)}</option>)}
                    </select>
                  </div>
                  <Aplicar ligado={l.aplicar} aoMudar={(v) => mudar(i, { aplicar: v })} />
                  <button type="button" aria-label={`Remover a ligação ${i + 1}`} title="Remover" onClick={() => { setMsg(null); aoMudar(valor.filter((_, j) => j !== i)); }} className={cn(BOTAO, "min-w-11 px-0")}>
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {ligaveis.length > 0 && (
              <button type="button" aria-disabled={!livre()} onClick={() => { const nova = livre(); if (nova) { setMsg(null); aoMudar([...valor, nova]); } }} className={cn(BOTAO, !livre() && DESLIGADO)}>
                <Plus className="h-4 w-4" aria-hidden="true" />Acrescentar ligação
              </button>
            )}
            {/* aria-disabled (e não disabled): um botão desactivado perde o foco do teclado ao ser carregado; assim o foco fica e o clique é só ignorado */}
            <button type="button" aria-disabled={!podeGuardar} aria-describedby={descreveGuardar} onClick={() => { if (podeGuardar) void correr(gravar, "Ligações guardadas."); }} className={cn(BOTAO, !podeGuardar && DESLIGADO)}>Guardar ligações</button>
            <button type="button" aria-disabled={!proprio || ocupado} onClick={() => { if (proprio && !ocupado) void correr(herdar, "As ligações voltaram a ser herdadas."); }} className={cn(BOTAO, (!proprio || ocupado) && DESLIGADO)}>Voltar a herdar as ligações</button>
          </div>
          {invalida && <p id={idInvalida} role="alert" className="text-[15px] text-red-700 dark:text-red-400">{invalida}</p>}
          {razaoGuardar && <p id={idRazao} className={NOTA}>{razaoGuardar}</p>}
        </>
      )}

      {orfas > 0 && <p role="status" className={NOTA}>{plural(orfas, "ligação a um atributo que já não existe foi ignorada", "ligações a atributos que já não existem foram ignoradas")}.</p>}
      {ignoradas > 0 && <p role="status" className={NOTA}>{plural(ignoradas, "ligação inválida foi ignorada", "ligações inválidas foram ignoradas")}.</p>}
      {/* região viva: o resultado de guardar ou de voltar a herdar; o erro como alerta */}
      <p aria-live="polite" className={NOTA}>{msg && !msg.erro ? msg.texto : ""}</p>
      {msg?.erro && <p role="alert" className="text-[15px] text-red-700 dark:text-red-400">{msg.texto}</p>}
    </section>
  );
}
