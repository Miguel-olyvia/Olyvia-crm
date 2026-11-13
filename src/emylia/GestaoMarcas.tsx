// 13/11: o separador «Marcas» da gestão do Catálogo: criar, renomear, site, ativar/desativar. Só com products.edit (sem ela, leitura). As marcas
// partilhadas (de todas as organizações) só se leem. Quem decide é a base (cat_* de 20270117700000, categoriasMarcasGestao.ts): aqui só se
// mostra o que ela devolve e relê-se depois de cada gravação, também em falha. «Como no outro» (Brands da aplicação): nome, site, ativa/inativa.
import { useMemo, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAMPO, NOTA } from "./pecasForm";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { estadoMarca, guardarMarca, lerMarcasGestao, type MarcaGestao } from "./categoriasMarcasGestao";
import { semAcentos } from "./ComboPesquisa";
import { BOTAO_ICONE, BOTAO_TEXTO, CARTAO, ConfirmarMudanca, EstadoLeitura, FormNome, Razao, Selo, produtos, protegido, useGestaoLista } from "./gestaoPecas";

type Aberto = { t: "nova" } | { t: "editar"; id: string };
/** O que espera confirmação: mudar o nome de uma marca que produtos usam (ou de uso desconhecido). */
interface Pendente { marca: MarcaGestao; nome: string; site: string | null }

export function GestaoMarcas({ real, anunciar }: { real: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const { org, podeEditar } = real;
  const g = useGestaoLista(real, lerMarcasGestao, anunciar, "Não tem permissão para ver as marcas.");
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [pend, setPend] = useState<Pendente | null>(null);
  const [q, setQ] = useState("");
  const lista = g.lista;
  const vistas = useMemo(() => {
    const t = semAcentos(q.trim());
    return (lista ?? []).filter((m) => !t || semAcentos(m.nome).includes(t));
  }, [lista, q]);
  const abrir = (a: Aberto) => { setAberto(a); g.setErro(null); setPend(null); };
  const fechar = (focar?: string) => { setAberto(null); g.setErro(null); setPend(null); if (focar) g.setFoco(focar); };

  const criar = (nome: string, site: string) =>
    void g.correr(() => guardarMarca(org, { id: null, nome, website: site || null }), `Marca «${nome}» criada.`, "novo").then((ok) => { if (ok) fechar("novo-marca"); });
  const gravar = (m: MarcaGestao, nome: string, site: string | null) =>
    g.correr(() => guardarMarca(org, { id: m.id, nome, website: site }), `Marca «${nome}» guardada.`, `ed:${m.id}`).then((ok) => { if (ok) fechar(`ed-${m.id}`); });
  /** Só mudar o nome de uma marca usada por produtos pede confirmação (o texto da marca muda em todos); o site, não. */
  const pedirGravar = (m: MarcaGestao, nome: string, siteEscrito: string) => {
    const site = siteEscrito === (m.website ?? "") ? null : siteEscrito; // null = a base não mexe; «» = limpa
    if (nome === m.nome || m.usados === 0) { void gravar(m, nome, site); return; }
    g.setErro(null); setPend({ marca: m, nome, site });
  };
  const confirmar = () => { if (pend) void gravar(pend.marca, pend.nome, pend.site); };
  const voltarConfirmar = () => { if (!pend) return; g.setFoco(`gn-${pend.marca.id}`); setPend(null); };
  const ativar = (m: MarcaGestao) =>
    void g.correr(() => estadoMarca(org, m.id, !m.ativo), `Marca «${m.nome}» ${m.ativo ? "desativada" : "reativada"}.`, `est:${m.id}`).then(() => g.setFoco(`act-${m.id}`));

  return (
    <div className="grid gap-5">
      <p className={NOTA}>As marcas são as mesmas para toda a organização. Desativar esconde-a dos produtos novos; os que já a têm mantêm-na.</p>
      {lista && !podeEditar && <p role="note" className={cn(NOTA, "rounded-xl bg-muted/50 p-3")}>Só de leitura: para mudar as marcas precisa da permissão de editar produtos.</p>}
      <EstadoLeitura o={g} lido={!!lista} nomes="as marcas" />
      {lista && (
        <>
          {podeEditar && (
            <div className="grid gap-3">
              <div>
                <button id="novo-marca" type="button" aria-expanded={aberto?.t === "nova"} onClick={() => abrir({ t: "nova" })} className={BOTAO_TEXTO}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Nova marca
                </button>
              </div>
              {aberto?.t === "nova" && (
                <FormNome rotuloNome="Nome da marca" inicial="" botao="Criar marca" comSite aGravar={g.aGravar} erro={g.msg("novo")} idGuardar="gc-novo" onEnviar={criar} onCancelar={() => fechar("novo-marca")} />
              )}
            </div>
          )}
          {!lista.length && <p className={NOTA}>Ainda não há marcas.</p>}
          {lista.length > 0 && (
            <section aria-label="Marcas" className={CARTAO}>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <input type="search" aria-label="Procurar marca" placeholder="Procurar marca" value={q} onChange={(e) => setQ(e.target.value)} className={cn(CAMPO, "pl-9")} />
              </div>
              {/* a região de estado está sempre montada: quem pesquisa ouve quantas marcas ficam */}
              <p role="status" className="sr-only">{!q.trim() ? "" : vistas.length === 0 ? "Nenhuma marca encontrada" : vistas.length === 1 ? "1 marca" : `${vistas.length} marcas`}</p>
              {vistas.length > 0 ? (
                <ul className="mt-3 grid gap-2">
                  {vistas.map((m) => (
                    <Marca key={m.id} m={m} podeEditar={podeEditar} aGravar={g.aGravar} aberto={aberto} pend={pend} msg={g.msg}
                      abrir={abrir} fechar={fechar} onPedirGravar={pedirGravar} onConfirmar={confirmar} onVoltarConfirmar={voltarConfirmar} onAtivar={ativar} />
                  ))}
                </ul>
              ) : <p className={cn(NOTA, "mt-3")}>Nenhuma marca encontrada.</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}

interface MarcaProps {
  m: MarcaGestao; podeEditar: boolean; aGravar: boolean; aberto: Aberto | null; pend: Pendente | null; msg: (onde: string) => string | null;
  abrir: (a: Aberto) => void; fechar: (focar?: string) => void; onPedirGravar: (m: MarcaGestao, nome: string, site: string) => void;
  onConfirmar: () => void; onVoltarConfirmar: () => void; onAtivar: (m: MarcaGestao) => void;
}
function Marca({ m, podeEditar, aGravar, aberto, pend, msg, abrir, fechar, onPedirGravar, onConfirmar, onVoltarConfirmar, onAtivar }: MarcaProps) {
  const edita = podeEditar && !m.global;
  const aEditar = edita && aberto?.t === "editar" && aberto.id === m.id;
  const p = pend?.marca.id === m.id ? pend : null;
  const n = m.usados;
  const siteOk = !!m.website && /^https?:\/\//i.test(m.website);
  return (
    <li className="rounded-xl bg-muted/50 p-2 pl-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("min-w-0 break-words text-[15px] font-medium", !m.ativo && "text-muted-foreground")}>{m.nome}{!m.ativo && " (desativada)"}</span>
        {m.global && <Selo>Partilhada</Selo>}
        {m.website && (siteOk
          ? <a href={m.website} target="_blank" rel="noopener noreferrer" className="inline-block min-h-6 min-w-0 break-all text-sm leading-6 text-primary underline-offset-4 hover:underline">{m.website}{" "}<span className="sr-only">(abre noutro separador)</span></a>
          : <span className="min-w-0 break-all text-sm text-muted-foreground">{m.website}</span>)}
        {n != null && <span className="text-sm text-muted-foreground">{produtos(n)}</span>}
        {edita && (
          <span className="ml-auto flex flex-wrap items-center gap-1">
            <button id={`ed-${m.id}`} type="button" aria-label={`Editar ${m.nome}`} aria-expanded={aEditar} className={BOTAO_ICONE} {...protegido(aGravar ? "A guardar…" : null, `rz-ed-${m.id}`, () => abrir({ t: "editar", id: m.id }))}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <button id={`act-${m.id}`} type="button" aria-label={`${m.ativo ? "Desativar" : "Reativar"} ${m.nome}`} className={cn(BOTAO_TEXTO, "border-transparent")} {...protegido(aGravar ? "A guardar…" : null, `rz-ed-${m.id}`, () => onAtivar(m))}>
              {m.ativo ? "Desativar" : "Reativar"}
            </button>
            <Razao id={`rz-ed-${m.id}`}>{aGravar ? "A guardar…" : null}</Razao>
          </span>
        )}
      </div>
      {msg(`est:${m.id}`) && <p className="mt-2 text-[15px] text-destructive" role="alert">{msg(`est:${m.id}`)}</p>}
      {aEditar && (
        <div className="mt-3 grid gap-3">
          <FormNome rotuloNome="Nome da marca" inicial={m.nome} siteInicial={m.website ?? ""} comSite botao="Guardar marca" aGravar={aGravar} bloqueado={!!p} erro={p ? null : msg(`ed:${m.id}`)} idGuardar={`gn-${m.id}`}
            onEnviar={(nome, site) => onPedirGravar(m, nome, site)} onCancelar={() => fechar(`ed-${m.id}`)} />
          {p && (
            <ConfirmarMudanca titulo={`Mudar o nome de «${m.nome}» para «${p.nome}»?`} aGravar={aGravar} erro={msg(`ed:${m.id}`)} onConfirmar={onConfirmar} onVoltar={onVoltarConfirmar}
              texto={n == null ? "Esta marca pode estar a ser usada por produtos: o novo nome aparece em todos." : `Esta marca é usada por ${produtos(n)}: o novo nome aparece em ${n === 1 ? "esse produto" : `esses ${n} produtos`}.`} />
          )}
        </div>
      )}
    </li>
  );
}
