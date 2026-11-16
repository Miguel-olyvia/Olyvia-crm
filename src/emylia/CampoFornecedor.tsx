// 16/11: o campo «Fornecedor» ao criar um produto ou um consumível. Na página real (com `real`) é um ComboPesquisa dos fornecedores da organização
// (cat_ler_fornecedores; «Sem fornecedor» primeiro) e, só se a base diz pode_criar (suppliers.create), o último item «Novo fornecedor…» abre um
// mini-formulário (nome obrigatório, NIF e email opcionais). Um fornecedor novo NÃO se cria logo: fica pendente e cria-se ao gravar o produto
// (cat_ligar_fornecedor_produto), para não deixar fornecedores órfãos. Sem `real` (protótipo) mantém-se o campo de texto com sugestões.
import { useEffect, useId, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CAMPO, NOTA, Campo } from "./pecasForm";
import { ComboPesquisa, semAcentos, type ItemCombo } from "./ComboPesquisa";
import { useFoco } from "./ClassificacaoProduto";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { FORNECEDOR_VAZIO, lerFornecedoresCat, limparNif, validarNovoFornecedor, type FornecedoresCat, type FornecedorEscolhido } from "./fornecedoresCatalogo";

const NOVO = "__novo__";
const ERRO = "text-[15px] text-red-700 dark:text-red-400";
const DICA_NOVO = "É novo: cria-se quando o produto for gravado.";
const juntar = (t: string) => t.trim().replace(/\s+/g, " ");

type Leitura = { k: "a-ler" } | { k: "erro"; erro: string } | { k: "ok"; v: FornecedoresCat };

/** O mini-formulário do fornecedor novo: Nome, NIF e Email. Criar só o deixa pendente (não escreve na base). */
function NovoFornecedor({ inicial, aoCriar, aoCancelar }: { inicial: string; aoCriar: (o: { nome: string; nif: string; email: string }) => string | null; aoCancelar: () => void }) {
  const [nome, setNome] = useState(inicial), [nif, setNif] = useState(""), [email, setEmail] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const rz = useId();
  const razao = !nome.trim() ? "Escreva o nome do fornecedor." : null;
  const enviar = () => {
    const e = validarNovoFornecedor({ nome, nif, email }) ?? aoCriar({ nome: juntar(nome), nif, email });
    setErro(e);
  };
  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); enviar(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); aoCancelar(); }
  };
  return (
    <div role="group" aria-label="Novo fornecedor" className="grid gap-3 rounded-xl border border-border bg-card p-3 motion-safe:animate-in motion-safe:fade-in-0">
      <Campo rot="Nome do novo fornecedor">{(i) => <input id={i} value={nome} aria-invalid={!!erro} onChange={(e) => { setNome(e.target.value); setErro(null); }} onKeyDown={tecla} className={CAMPO} autoFocus />}</Campo>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rot="NIF (opcional)">{(i) => <input id={i} value={nif} inputMode="numeric" onChange={(e) => { setNif(e.target.value); setErro(null); }} onKeyDown={tecla} className={CAMPO} />}</Campo>
        <Campo rot="Email (opcional)">{(i) => <input id={i} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setErro(null); }} onKeyDown={tecla} className={CAMPO} />}</Campo>
      </div>
      {erro && <p className={ERRO} role="alert">{erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" aria-disabled={razao ? true : undefined} aria-describedby={razao ? rz : undefined} onClick={razao ? undefined : enviar}>Usar este fornecedor</Button>
        {razao && <span id={rz} className="sr-only">{razao}</span>}
        <Button type="button" variant="outline" className="min-h-11 text-[15px]" onClick={aoCancelar}>Cancelar</Button>
      </div>
      <p className={NOTA}>Só se cria quando gravar o produto.</p>
    </div>
  );
}

function CampoFornecedorReal({ real, valor, onChange }: { real: FichaProdutoReal; valor: FornecedorEscolhido; onChange: (v: FornecedorEscolhido) => void }) {
  const [leitura, setLeitura] = useState<Leitura>({ k: "a-ler" });
  const [tentativa, setTentativa] = useState(0);
  const [novo, setNovo] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const foco = useFoco();
  useEffect(() => {
    let vivo = true;
    setLeitura({ k: "a-ler" });
    void lerFornecedoresCat(real.org).then((r) => { if (vivo) setLeitura(r.ok ? { k: "ok", v: r.v } : { k: "erro", erro: r.erro }); });
    return () => { vivo = false; };
  }, [real.org, tentativa]);
  const dados = leitura.k === "ok" ? leitura.v : null;
  const itens = useMemo<ItemCombo[]>(() => (dados?.fornecedores ?? []).map((f) => ({ id: f.id, nome: f.nome, ...(f.ativo ? {} : { inativo: true }) })).sort((a, b) => a.nome.localeCompare(b.nome, "pt")), [dados]);
  const atual: ItemCombo | null = valor.novo ? { id: NOVO, nome: valor.nome } : valor.id ? itens.find((x) => x.id === valor.id) ?? { id: valor.id, nome: valor.nome } : null;
  const fechar = () => { setNovo(null); foco.devolver(); };
  /** Devolve a frase de erro, ou null se ficou escolhido (o novo pendente, ou o que já existia com esse nome ou NIF). */
  const criar = (o: { nome: string; nif: string; email: string }): string | null => {
    const nif = limparNif(o.nif).toLowerCase();
    const ja = (dados?.fornecedores ?? []).find((f) => semAcentos(juntar(f.nome)) === semAcentos(o.nome) || (!!nif && !!f.nif && limparNif(f.nif).toLowerCase() === nif));
    if (ja) {
      if (!ja.ativo) return `Já existe «${ja.nome}» e está desativado: reative-o em Compras.`;
      onChange({ id: ja.id, nome: ja.nome, novo: null });
      setAviso(`Já existe o fornecedor «${ja.nome}»: ficou escolhido esse.`);
      fechar();
      return null;
    }
    onChange({ id: null, nome: o.nome, novo: { nif: limparNif(o.nif), email: o.email.trim() } });
    setAviso("");
    fechar();
    return null;
  };
  return (
    <>
      <Campo rot="Fornecedor" dica={valor.novo ? DICA_NOVO : undefined}>{(id) => (
        <ComboPesquisa id={id} rotulo="Fornecedor" itens={itens} atual={atual} semValor="Sem fornecedor" desativado={leitura.k === "a-ler"}
          placeholder={leitura.k === "a-ler" ? "A carregar fornecedores…" : undefined} vazio="Nenhum fornecedor encontrado" registar={foco.registar}
          onEscolher={(i) => { setAviso(""); onChange(i.id ? { id: i.id, nome: i.nome, novo: null } : FORNECEDOR_VAZIO); }}
          onNova={dados?.podeCriar ? (t) => setNovo(t) : undefined} textoNova="Novo fornecedor…" />
      )}</Campo>
      {leitura.k === "a-ler" && <p role="status" className={`${NOTA} flex items-center gap-2`}><Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />A carregar fornecedores…</p>}
      {leitura.k === "erro" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className={ERRO} role="alert">{leitura.erro}</p>
          <Button type="button" variant="outline" className="min-h-11 text-[15px]" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</Button>
        </div>
      )}
      {dados && !dados.podeCriar && <p className={NOTA}>Sem permissão para criar fornecedores (suppliers.create): só pode escolher um que já existe.</p>}
      <p role="status" className={aviso ? NOTA : "sr-only"}>{aviso}</p>
      {novo !== null && <NovoFornecedor inicial={novo} aoCriar={criar} aoCancelar={fechar} />}
    </>
  );
}

/** O campo Fornecedor. `real`: a página real (fornecedores da base); sem ele, texto livre com sugestões (protótipo). */
export function CampoFornecedor({ real, valor, onChange, sugestoes, idLista }: {
  real?: FichaProdutoReal; valor: FornecedorEscolhido; onChange: (v: FornecedorEscolhido) => void; sugestoes: readonly string[]; idLista: string;
}) {
  if (real) return <CampoFornecedorReal real={real} valor={valor} onChange={onChange} />;
  return (
    <Campo rot="Fornecedor">{(id) => (
      <><input id={id} list={idLista} value={valor.nome} onChange={(e) => onChange({ id: null, nome: e.target.value, novo: null })} className={CAMPO} />
        <datalist id={idLista}>{sugestoes.map((x) => <option key={x} value={x} />)}</datalist></>
    )}</Campo>
  );
}

/** Do campo para o que vai no produto: o nome, e o fornecedor real (id) ou o novo por criar. */
export function fornecedorParaModelo(f: FornecedorEscolhido): { fornecedor: string; fornecedorId?: string; fornecedorNovo?: { nome: string; nif?: string; email?: string } } {
  if (f.id) return { fornecedor: f.nome, fornecedorId: f.id };
  if (f.novo) return { fornecedor: f.nome, fornecedorNovo: { nome: f.nome, ...(f.novo.nif ? { nif: f.novo.nif } : {}), ...(f.novo.email ? { email: f.novo.email } : {}) } };
  return { fornecedor: f.nome };
}
