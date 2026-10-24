import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FOCO, PISTA_DESATIVADO } from "@/components/negocio-metas/estilos";
import { criarSeccao, LIMITES, type SeccaoEd } from "@/hooks/pessoas/workflow/questionario";
import { adicionarSeccao, itensApagados, validar, type CampoProblema, type ItemApagado } from "@/hooks/pessoas/workflow/questionarioEdicao";
import { chaveErroLeitura, chaveErroQuestionario, detalheDaBase, ehConflitoDeVersao } from "@/hooks/pessoas/workflow/errosQuestionario";
import type { QuestionarioHook } from "@/hooks/pessoas/workflow/useQuestionarioLevantamento";
import type { RascunhoHook } from "@/hooks/pessoas/workflow/useRascunhoQuestionario";
import { useTranslation } from "@/hooks/useTranslation";
import { LevantamentoSeccao } from "./LevantamentoSeccao";
import { BotaoTexto, W, type ContextoEditor } from "./LevantamentoPecas";

type Aviso = "guardado" | "semAlteracoes";

// Um leitor de ecrã não reanuncia um texto igual ao anterior («Pergunta adicionada» duas vezes seguidas): alterna-se um carácter invisível.
const INVISIVEL = "\u200B";

// O id do campo onde está cada problema (ver os `id` em LevantamentoSeccao, LevantamentoPergunta e LevantamentoOpcoes).
const SUFIXO_CAMPO: Record<CampoProblema, string | null> = {
  titulo: "titulo", texto: "texto", bloco: "bloco", opcoes: "add-opcao", opcao: "opcao", min: "min", casas: "casas",
  unidade: "unidade", textoMax: "textomax", condicao: "condicao", geral: null,
};

/** A pergunta a abrir para mostrar um problema: a própria, ou a dona da opção. */
const perguntaDe = (seccoes: readonly SeccaoEd[], k: string) =>
  seccoes.flatMap((s) => s.perguntas).find((p) => p.k === k || p.opcoes.some((o) => o.k === k));

/**
 * O separador «Levantamento»: o questionário da organização (secções, perguntas, opções e condições), editado num rascunho (que vive no
 * diálogo) e gravado de uma vez por «Guardar», que envia a versão lida. Antes de enviar valida os limites da base e mostra o que falta.
 * Se alguém gravou entretanto (NG021) relê o questionário, avisa e mantém o que se escreveu. Enquanto grava, o botão fica `aria-disabled`
 * (continua focável) e os campos bloqueados; um duplo clique dá um só pedido. Resultados e erros vão para regiões que o leitor de ecrã anuncia.
 */
export function LevantamentoSeparador({ questionario, rascunho }: { questionario: QuestionarioHook; rascunho: RascunhoHook }) {
  const { t } = useTranslation();
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [erro, setErro] = useState<unknown>(null);
  // Depois de um NG021: o que a outra pessoa apagou e o rascunho ainda tem (pode ser nada). null = sem conflito.
  const [conflito, setConflito] = useState<ItemApagado[] | null>(null);
  const [recarregouMal, setRecarregouMal] = useState(false);
  const [validando, setValidando] = useState(false);
  const [anuncio, setAnuncioBruto] = useState({ texto: "", n: 0 });
  const [ocupado, setOcupado] = useState(false);
  const [pedidoFoco, setPedidoFoco] = useState<string | null>(null);
  // O estado só muda no render seguinte: a referência é o que trava o segundo clique.
  const emCurso = useRef(false);
  const dados = questionario.dados;
  const desativado = ocupado || questionario.aGuardar;
  const { seccoes, alterar } = rascunho;
  const setAnuncio = useCallback((texto: string) => setAnuncioBruto((a) => ({ texto, n: a.n + 1 })), []);

  const problemas = useMemo(() => (validando ? validar(seccoes) : []), [validando, seccoes]);
  const marcados = useMemo(() => new Set(problemas.map((p) => `${p.k}:${p.campo}`)), [problemas]);

  // O foco passa para o elemento pedido depois de o ecrã mudar (um item novo, ou o botão que acabou de mudar de sítio).
  useEffect(() => {
    if (!pedidoFoco) return;
    document.getElementById(pedidoFoco)?.focus();
    // Pede-se uma vez: se o elemento não existir, não fica à espera para roubar o foco mais tarde.
    setPedidoFoco(null);
  }, [pedidoFoco]);

  const mudar = useCallback<ContextoEditor["mudar"]>((f, opcoes) => {
    if (desativado) return;
    alterar(f);
    setAviso(null);
    setErro(null);
    setRecarregouMal(false);
    if (opcoes?.anuncio) setAnuncio(opcoes.anuncio);
    if (opcoes?.foco) setPedidoFoco(opcoes.foco);
  }, [desativado, alterar, setAnuncio]);
  // (Sem `Set.delete`: a guarda de escritas do Workflow procura `.delete(` e não distingue um Set de uma tabela.)
  const alternar = useCallback((k: string) => setAbertas((a) => new Set(a.has(k) ? [...a].filter((x) => x !== k) : [...a, k])), []);
  const abrir = useCallback((k: string) => setAbertas((a) => new Set(a).add(k)), []);

  if (!dados) {
    if (questionario.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t(`${W}lev.loading`)}</p>;
    const chave = chaveErroLeitura(questionario.erro);
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
        <div className="space-y-1">
          <p>{t(`${W}lev.loadError`)}</p>
          {chave && <p className="text-muted-foreground">{t(chave)}</p>}
        </div>
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={() => void questionario.recarregar()}>{t(`${W}lev.retry`)}</Button>
      </div>
    );
  }

  const ctx: ContextoEditor = { desativado, seccoes, abertas, alternar, abrir, mudar, invalido: (k, campo) => marcados.has(`${k}:${campo}`) };

  const guardar = async () => {
    if (emCurso.current) return;
    const faltas = validar(seccoes);
    if (faltas.length > 0) {
      setValidando(true);
      // Só a contagem se anuncia, uma vez por clique: a lista (que se recalcula a cada tecla) fica à vista, sem ser uma região viva.
      setAnuncio(t(`${W}lev.problems.count`, { n: faltas.length }));
      setAviso(null);
      setErro(null);
      setAbertas((a) => {
        const n = new Set(a);
        for (const f of faltas) {
          const p = perguntaDe(seccoes, f.k);
          if (p) n.add(p.k);
        }
        return n;
      });
      const primeira = faltas.find((f) => SUFIXO_CAMPO[f.campo]);
      if (primeira) setPedidoFoco(`lev-${primeira.k}-${SUFIXO_CAMPO[primeira.campo]}`);
      return;
    }
    emCurso.current = true;
    setOcupado(true);
    setAviso(null);
    setErro(null);
    setRecarregouMal(false);
    try {
      const resultado = await questionario.guardar(rascunho.versao, seccoes);
      rascunho.descartar();
      setAbertas(new Set());
      setValidando(false);
      setConflito(null);
      setRecarregouMal(!resultado.recarregou);
      setAviso(resultado.mudou ? "guardado" : "semAlteracoes");
    } catch (e) {
      if (ehConflitoDeVersao(e)) {
        // Alguém guardou entretanto: relê-se o questionário e o rascunho passa para a versão nova, sem perder o que se escreveu.
        const novo = await questionario.recarregar();
        if (novo) {
          rascunho.rebasear(novo.versao);
          // Só há o que apagar do ecrã se há rascunho: sem ele o ecrã passa a mostrar o que a base tem, e a lista seria falsa.
          setConflito(rascunho.temRascunho ? itensApagados(seccoes, novo) : []);
        } else {
          setErro(e);
        }
      } else {
        setErro(e);
      }
    } finally {
      emCurso.current = false;
      setOcupado(false);
    }
  };

  const descartar = () => {
    rascunho.descartar();
    setAbertas(new Set());
    setConflito(null);
    setValidando(false);
    setAnuncio(t(`${W}lev.discarded`));
  };

  const aGuardar = desativado;
  const mensagem = aGuardar ? t(`${W}lev.saving`) : aviso === "guardado" ? t(`${W}lev.saved`) : aviso === "semAlteracoes" ? t(`${W}lev.unchanged`) : "";
  const detalhe = detalheDaBase(erro);
  const cheio = seccoes.length >= LIMITES.seccoes;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t(`${W}lev.intro`)}</p>
      <div className="space-y-3">
        {seccoes.map((s, i) => (
          <LevantamentoSeccao key={s.k} seccao={s} indice={i} total={seccoes.length} ctx={ctx} />
        ))}
      </div>
      <BotaoTexto
        id="lev-add-seccao" icone={Plus} inativo={desativado || cheio}
        aoClicar={() => {
          const nova = criarSeccao();
          mudar((s) => adicionarSeccao(s, nova), { foco: `lev-${nova.k}-titulo`, anuncio: t(`${W}lev.section.added`) });
        }}
      >
        {t(`${W}lev.section.add`)}
      </BotaoTexto>
      {cheio && <p className="text-xs text-muted-foreground">{t(`${W}lev.section.full`, { max: LIMITES.seccoes })}</p>}

      {problemas.length > 0 && (
        <div role="group" aria-labelledby="lev-problemas-titulo" className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <p id="lev-problemas-titulo" className="font-medium">{t(`${W}lev.problems.title`)}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {problemas.map((p, i) => (
              <li key={`${p.k}-${p.codigo}-${i}`}>{t(`${W}lev.problem.${p.codigo}`, { onde: p.onde || t(`${W}lev.unnamed`), max: LIMITES.seccoes })}</li>
            ))}
          </ul>
        </div>
      )}
      {conflito && (
        <div role="alert" className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">{t(`${W}lev.conflict.title`)}</p>
          <p>{t(`${W}lev.conflict.body`)}</p>
          {conflito.length > 0 && (
            <div className="space-y-1">
              <p>{t(`${W}lev.conflict.gone.title`)}</p>
              <ul className="list-disc space-y-0.5 pl-5">
                {conflito.map((item, i) => {
                  const nome = item.nome || t(`${W}lev.unnamed`);
                  const chave = item.tipo === "seccao" ? "section" : item.tipo === "pergunta" ? "question" : "option";
                  return <li key={`${item.tipo}-${i}`}>{t(`${W}lev.conflict.gone.${chave}`, { nome, pergunta: item.pergunta || t(`${W}lev.unnamed`) })}</li>;
                })}
              </ul>
            </div>
          )}
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={descartar}>{t(`${W}lev.conflict.discard`)}</Button>
        </div>
      )}
      {recarregouMal && (
        <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{t(`${W}lev.reloadFailed`)}</div>
      )}
      {erro !== null && (
        <div role="alert" className="space-y-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm">
          <p className="font-medium">{t(`${W}lev.error.title`)}</p>
          <p>{t(chaveErroQuestionario(erro))}</p>
          {detalhe && <p className="text-muted-foreground">{detalhe}</p>}
        </div>
      )}
      <p role="status" aria-live="polite" className="min-h-5 text-sm text-muted-foreground">{mensagem}</p>
      <p role="log" aria-live="polite" className="sr-only">{anuncio.texto}{anuncio.n % 2 === 0 ? "" : INVISIVEL}</p>
      <Button
        type="button" className={cn("min-h-11", FOCO, PISTA_DESATIVADO)} aria-busy={aGuardar || undefined} aria-disabled={aGuardar || undefined}
        onClick={() => void guardar()}
      >
        {aGuardar ? t(`${W}lev.saving`) : t(`${W}lev.save`)}
      </Button>
    </div>
  );
}
