// Os 13 diálogos da Frota (objeto DLG do protótipo) em shadcn Dialog, com os mesmos campos, textos e validações (as do
// protótipo, reutilizadas de dados/). Gravar valida (erros por campo, foco no primeiro inválido) e corre a ação numa
// cópia da base de exemplo. As listas são <select> nativos (NativeSelect): nada de Popover/Command dentro do Dialog.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, FileSpreadsheet, History, Info, Paperclip, TriangleAlert, UserRoundSearch, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useFrotaCtx, type DadosDlg, type LigacaoAviso, type TipoDlg } from "./contexto";
import { linkCalendario } from "./dados/acoesApp";
import { Placa, Selo, SeloEstado, Tabela } from "./pecas";
import { nomeObra } from "./dados/exemplo";
import {
  CENTROS, ESTADOS, FICHEIRO_EXTRATO, HOJE, LINHAS_EXTRATO, OFICINAS, POSTOS, TIPOS_CUSTO, VENC, atribEm, cartaOk, centroObra, fData, fEur, fKm, fNum,
  gravarAbastecer, gravarAtribuir, gravarConcluir, gravarDespesa, gravarDevolver, gravarEstado, gravarIdentificar, gravarImportar, gravarKm, gravarManut,
  gravarNova, gravarOcorrencia, gravarRenovar, iniAbastecer, iniAtribuir, iniConcluir, iniDespesa, iniDevolver, iniEstado, iniIdentificar, iniKm, iniManut,
  iniNova, iniOcorrencia, iniRenovar, pessoa, prazoMulta, quemConduzia, validarAbastecer, validarAtribuir, validarConcluir, validarDespesa, validarDevolver,
  validarEstado, validarIdentificar, validarImportar, validarKm, validarManut, validarNova, validarOcorrencia, validarRenovar, verificarLinha, viatura,
  type ChaveVenc, type Erros, type Frota, type Vals,
} from "./dados";

interface Def {
  titulo: string; ok: string; largo?: boolean;
  ini: (F: Frota, d: DadosDlg) => Vals;
  validar: (F: Frota, x: Vals) => Erros;
  gravar: (F: Frota, x: Vals) => string;
}
const DEFS: Record<TipoDlg, Def> = {
  atribuir: { titulo: "Atribuir viatura", ok: "Atribuir", ini: (F, d) => iniAtribuir(F, d), validar: validarAtribuir, gravar: gravarAtribuir },
  devolver: { titulo: "Devolver viatura", ok: "Registar devolução", ini: (F, d) => iniDevolver(F, d.a ?? ""), validar: validarDevolver, gravar: gravarDevolver },
  km: { titulo: "Registar km", ok: "Registar", ini: (_F, d) => iniKm(d.v ?? ""), validar: validarKm, gravar: gravarKm },
  abastecer: { titulo: "Registar abastecimento", ok: "Registar", ini: (F, d) => iniAbastecer(F, d.v), validar: validarAbastecer, gravar: gravarAbastecer },
  despesa: { titulo: "Registar despesa", ok: "Registar", ini: (_F, d) => iniDespesa(d.v), validar: validarDespesa, gravar: gravarDespesa },
  importar: { titulo: "Importar extrato do cartão frota", ok: `Importar ${LINHAS_EXTRATO.length} linhas`, largo: true, ini: () => ({}), validar: (F) => validarImportar(F), gravar: (F) => gravarImportar(F) },
  manut: { titulo: "Agendar manutenção", ok: "Agendar", ini: (_F, d) => iniManut(d.v), validar: validarManut, gravar: gravarManut },
  concluir: { titulo: "Concluir intervenção", ok: "Concluir", ini: (F, d) => iniConcluir(F, d.m ?? ""), validar: validarConcluir, gravar: gravarConcluir },
  estado: { titulo: "Mudar estado da viatura", ok: "Mudar estado", ini: (F, d) => iniEstado(F, d.v ?? ""), validar: validarEstado, gravar: gravarEstado },
  ocorrencia: { titulo: "Registar ocorrência", ok: "Registar", ini: (_F, d) => iniOcorrencia(d.v), validar: validarOcorrencia, gravar: gravarOcorrencia },
  identificar: { titulo: "Identificar condutor", ok: "Identificar e notificar", ini: (F, d) => iniIdentificar(F, d.o ?? ""), validar: validarIdentificar, gravar: gravarIdentificar },
  renovar: { titulo: "Renovar documento", ok: "Guardar", ini: (F, d) => iniRenovar(F, d.v ?? "", (d.k ?? "seguro") as ChaveVenc), validar: validarRenovar, gravar: gravarRenovar },
  // a viatura nova grava-se à parte (gravarNova recebe o armazém, que na app real ainda não existe)
  nova: { titulo: "Nova viatura", ok: "Criar viatura", largo: true, ini: () => iniNova(), validar: validarNova, gravar: () => "" },
};
/** Onde se vê o efeito de cada ação (a ligação do aviso de sucesso). */
function ligacaoDepois(tipo: TipoDlg, x: Vals): LigacaoAviso | undefined {
  switch (tipo) {
    case "atribuir": return { rotulo: "Ver no calendário", para: linkCalendario(x.ini) };
    case "manut": return { rotulo: "Ver no calendário", para: linkCalendario(x.data) };
    case "devolver": return { rotulo: "Ver o histórico das atribuições", para: "/frota/atribuicoes?vista=hist" };
    case "abastecer": case "despesa": case "importar": return { rotulo: "Ver nos custos", para: "/frota/custos" };
    case "concluir": return { rotulo: "Ver na Manutenção", para: "/frota/manutencao" };
    case "ocorrencia": case "identificar": return { rotulo: "Ver nas Ocorrências", para: "/frota/ocorrencias" };
    case "renovar": return { rotulo: "Ver nos Documentos", para: "/frota/documentos" };
    case "estado": case "km": return { rotulo: "Ver nas Viaturas", para: "/frota/viaturas" };
    default: return undefined;
  }
}

/** As chaves de erro que não são campos do formulário (vão para o aviso do diálogo). */
const GERAIS = ["a", "m", "o", "extrato"];

/** Uma caixa de aviso dentro do diálogo, com ícone (nunca só cor). */
function Alerta({ tom, icone: I, children }: { tom: "ok" | "bad" | "warn" | "info"; icone: LucideIcon; children: ReactNode }) {
  const cls = { ok: "border-success/40 bg-success/10", bad: "border-destructive/40 bg-destructive/10", warn: "border-warning/50 bg-warning/15", info: "border-info/40 bg-info/10" }[tom];
  const ic = { ok: "text-green-700 dark:text-success", bad: "text-destructive", warn: "text-amber-700 dark:text-warning", info: "text-sky-700 dark:text-info" }[tom];
  return <div className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-sm", cls)}><I className={cn("mt-0.5 h-4 w-4 shrink-0", ic)} aria-hidden="true" /><span>{children}</span></div>;
}
const Nota = ({ icone: I = Info, children }: { icone?: LucideIcon; children: ReactNode }) => (
  <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><I className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{children}</p>
);

/** O rótulo, o controlo, a ajuda e o erro de um campo (aria-invalid + aria-describedby). */
function Campo({ rotulo, erro, ajuda, largo, children }: { rotulo: string; erro?: string; ajuda?: string; largo?: boolean; children: (p: { id: string; "aria-invalid"?: boolean; "aria-describedby"?: string }) => ReactNode }) {
  const id = useId(), idAjuda = `${id}-ajuda`, idErro = `${id}-erro`;
  const desc = [erro ? idErro : null, ajuda ? idAjuda : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", largo && "sm:col-span-2")}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children({ id, "aria-invalid": erro ? true : undefined, "aria-describedby": desc })}
      {erro ? <p id={idErro} role="alert" className="text-sm font-medium text-destructive">{erro}</p> : null}
      {ajuda ? <p id={idAjuda} className="text-xs text-muted-foreground">{ajuda}</p> : null}
    </div>
  );
}

const opcoes = (l: readonly string[]) => l.map((t) => ({ value: t, label: t }));

export function DialogoFrota({ tipo, dados, aoFechar, aoCriar }: { tipo: TipoDlg; dados: DadosDlg; aoFechar: () => void; aoCriar?: (vid: string) => void }) {
  const { F, agir, podeAgir, semPermissao } = useFrotaCtx();
  const def = DEFS[tipo];
  const [x, setX] = useState<Vals>(() => def.ini(F, dados));
  const [e, setE] = useState<Erros>({});
  const [erroGeral, setErroGeral] = useState("");
  const [focar, setFocar] = useState(0);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focar) caixa.current?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
  }, [focar]);
  const muda = (k: string) => (v: string): void => {
    setX((o) => {
      const n = { ...o, [k]: v };
      // ao escolher a viatura na atribuição, os km da entrega passam a ser os dela
      if (tipo === "atribuir" && k === "vid") { const w = viatura(F, v); if (w) n.km = String(w.km); }
      return n;
    });
    setErroGeral("");
  };
  const submeter = (): void => {
    if (!podeAgir) { setErroGeral(semPermissao); return; }
    const erros = def.validar(F, x);
    setE(erros);
    // nenhuma recusa fica em silêncio: além do erro no campo, o resumo junto aos botões diz o que falta
    const chaves = Object.keys(erros);
    const geral = chaves.find((k) => GERAIS.includes(k));
    if (geral) setErroGeral(erros[geral]);
    else if (chaves.length) setErroGeral(`Não foi gravado: ${erros[chaves[0]]}`);
    if (chaves.length) { setFocar((n) => n + 1); return; }
    if (tipo === "nova") {
      // na app real não se cria armazém: a viatura fica marcada como armazém móvel e o armazém nasce com as tabelas
      const r = agir((G) => gravarNova(G, x, null), `Viatura ${x.mat.trim().toUpperCase()} criada (exemplo).`, { rotulo: "Ver nas Viaturas", para: "/frota/viaturas" });
      if (!r.ok) { setErroGeral(r.erro); return; }
      aoFechar();
      aoCriar?.(r.valor);
      return;
    }
    const r = agir((G) => def.gravar(G, x), (msg) => msg, ligacaoDepois(tipo, x));
    if (r.ok) aoFechar(); else setErroGeral(r.erro);
  };
  return (
    <Dialog open onOpenChange={(a) => { if (!a) aoFechar(); }}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", def.largo ? "sm:max-w-3xl" : "sm:max-w-xl")}>
        <form noValidate onSubmit={(ev) => { ev.preventDefault(); submeter(); }} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{def.titulo}</DialogTitle>
            <DialogDescription>Dados de exemplo: fica guardado só neste navegador, sem tocar na base de dados.</DialogDescription>
          </DialogHeader>
          <div ref={caixa} className="space-y-3">
            <Corpo tipo={tipo} x={x} e={e} muda={muda} />
            {erroGeral ? <div role="alert"><Alerta tom="bad" icone={CircleAlert}>{erroGeral}</Alerta></div> : null}
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="outline" onClick={aoFechar}>Cancelar</Button>
            <Button type="submit" aria-disabled={!podeAgir || undefined} title={podeAgir ? undefined : semPermissao}>{def.ok}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Corpo({ tipo, x, e, muda }: { tipo: TipoDlg; x: Vals; e: Erros; muda: (k: string) => (v: string) => void }) {
  const { F, obras } = useFrotaCtx();
  const optsViaturas = () => F.viaturas.filter((v) => v.estado === "ativa").map((v) => ({ value: v.id, label: `${v.mat} · ${v.marca} ${v.modelo}` }));
  const optsAtivas = () => F.viaturas.filter((v) => v.estado !== "vendida" && v.estado !== "inativa").map((v) => ({ value: v.id, label: `${v.mat} · ${v.modelo}` }));
  const texto = (k: string, rotulo: string, o: { tipo?: string; ajuda?: string; largo?: boolean; attrs?: React.InputHTMLAttributes<HTMLInputElement> } = {}) => (
    <Campo rotulo={rotulo} erro={e[k]} ajuda={o.ajuda} largo={o.largo}>
      {(p) => <Input {...p} type={o.tipo ?? "text"} value={x[k] ?? ""} onChange={(ev) => muda(k)(ev.target.value)} {...o.attrs} />}
    </Campo>
  );
  const num = (k: string, rotulo: string, ajuda?: string, step?: string) => texto(k, rotulo, { tipo: "number", ajuda, attrs: { min: 0, step, inputMode: step ? "decimal" : "numeric" } });
  const data = (k: string, rotulo: string, ajuda?: string, tipoInput = "date") => texto(k, rotulo, { tipo: tipoInput, ajuda });
  const sel = (k: string, rotulo: string, ops: { value: string; label: string }[], o: { ajuda?: string; largo?: boolean; placeholder?: string } = {}) => (
    <Campo rotulo={rotulo} erro={e[k]} ajuda={o.ajuda} largo={o.largo}>
      {(p) => <NativeSelect {...p} value={x[k] ?? ""} onValueChange={muda(k)} options={o.placeholder !== undefined ? [{ value: "", label: o.placeholder }, ...ops] : ops} />}
    </Campo>
  );
  const area = (k: string, rotulo: string, ajuda?: string, placeholder?: string) => (
    <Campo rotulo={rotulo} erro={e[k]} ajuda={ajuda} largo>
      {(p) => <Textarea {...p} placeholder={placeholder} value={x[k] ?? ""} onChange={(ev) => muda(k)(ev.target.value)} />}
    </Campo>
  );
  const marcar = (k: string, rotulo: string) => {
    const id = `frota-chk-${k}`;
    return (
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={!!x[k]} onCheckedChange={(c) => muda(k)(c === true ? "on" : "")} />
        <Label htmlFor={id} className="font-normal">{rotulo}</Label>
      </div>
    );
  };
  const grelha = (children: ReactNode) => <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
  const v = viatura(F, x.vid ?? "");

  switch (tipo) {
    case "atribuir": {
      const p = pessoa(F, x.pid), aviso = v && p ? cartaOk(p, v, x.ini || HOJE) : null;
      const motivos = [{ value: "", label: "Sem motivo" }];
      for (const o of obras) {
        motivos.push({ value: nomeObra(o), label: nomeObra(o) });
        if (o.estado !== "concluída") for (const t of o.tarefas) motivos.push({ value: `Obra #${o.id} · ${t.nome}`, label: `Obra #${o.id} · ${t.nome}` });
      }
      motivos.push({ value: "Substituição temporária", label: "Substituição temporária" });
      return (
        <>
          {grelha(<>
            {sel("vid", "Viatura", optsViaturas(), { placeholder: "Escolher viatura" })}
            {sel("pid", "Condutor", F.pessoas.map((q) => ({ value: q.id, label: `${q.nome} · ${q.carta.length ? "carta " + q.carta.join("+") : "sem carta"}` })), { placeholder: "Escolher pessoa", ajuda: "Lista de Pessoas (RH)" })}
            {sel("tipo", "Tipo", [{ value: "permanente", label: "Permanente (viatura de serviço)" }, { value: "pontual", label: "Pontual (obra, ordem, reserva)" }])}
            {num("km", "Km na entrega", v ? `Última leitura: ${fKm(v.km)}` : undefined)}
            {data("ini", "Início")}
            {data("fim", "Fim", "Obrigatório nas pontuais")}
            {sel("nota", "Motivo, obra ou ordem", motivos, { largo: true, ajuda: "Obras de exemplo (as obras vivem em Operações)" })}
          </>)}
          {aviso ? <Alerta tom="bad" icone={CircleAlert}>{aviso}</Alerta>
            : p && v ? <Alerta tom="ok" icone={CircleCheck}>Carta de {p.nome} válida para a categoria {v.cat} até {fData(p.cartaVal)}.</Alerta> : null}
          <Nota>Com as tabelas, a viatura fica também reservada na Agenda, para não ser marcada noutro serviço.</Nota>
        </>
      );
    }
    case "devolver": {
      const a = F.atrib.find((z) => z.id === x.a), w = a ? viatura(F, a.vid) : undefined;
      if (!a || !w) return <p>Atribuição desconhecida.</p>;
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={w.mat} /> entregue a <b>{pessoa(F, a.pid)?.nome}</b> desde {fData(a.ini)}.</p>
          {grelha(<>{num("km", "Km na devolução", `Última leitura: ${fKm(w.km)}`)}{data("data", "Data")}</>)}
          {marcar("danos", "Tem danos novos (abre uma ocorrência de sinistro)")}
        </>
      );
    }
    case "km":
      if (!v) return <p>Viatura desconhecida.</p>;
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={v.mat} /> · última leitura <b>{fKm(v.km)}</b></p>
          {grelha(<>{num("km", "Km no conta-quilómetros")}{data("data", "Data")}</>)}
        </>
      );
    case "abastecer": {
      const el = v?.comb === "Elétrico";
      // as mesmas viaturas que mostram "Registar abastecimento" na ficha (também as que estão na oficina ou paradas)
      return grelha(<>
        {sel("vid", "Viatura", optsAtivas(), { placeholder: "Escolher viatura" })}
        {data("data", "Data")}
        {num("qtd", el ? "Energia (kWh)" : "Litros", undefined, "0.1")}
        {num("valor", "Valor com IVA (€)", undefined, "0.01")}
        {num("km", "Km no momento", v ? `Última leitura: ${fKm(v.km)}` : undefined)}
        {sel("fonte", "Pago com", opcoes(POSTOS))}
      </>);
    }
    case "despesa":
      return grelha(<>
        {sel("vid", "Viatura", optsAtivas(), { placeholder: "Escolher viatura" })}
        {sel("tipo", "Tipo", opcoes(TIPOS_CUSTO))}
        {data("data", "Data")}
        {num("valor", "Valor com IVA (€)", undefined, "0.01")}
        {sel("fonte", "Fornecedor", opcoes([...OFICINAS, "Via Verde", "Pagamento direto"]), { placeholder: "Escolher fornecedor", ajuda: "Fornecedores do Inventário (exemplo)" })}
        {sel("centro", "Centro de custo ou obra", [...opcoes(CENTROS), ...obras.map((o) => ({ value: centroObra(o.id), label: nomeObra(o) }))], { placeholder: "O da viatura" })}
        {area("nota", "Nota")}
      </>);
    case "importar":
      return (
        <>
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><b className="flex items-center gap-1.5"><FileSpreadsheet className="h-4 w-4" aria-hidden="true" />{FICHEIRO_EXTRATO}</b><span className="text-sm text-muted-foreground">{LINHAS_EXTRATO.length} linhas</span></div>
            <Tabela className="shadow-none">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Data</TableHead><TableHead>Matrícula</TableHead><TableHead>Posto</TableHead><TableHead className="text-right">Litros</TableHead>
                  <TableHead className="text-right">Valor</TableHead><TableHead className="text-right">Km</TableHead><TableHead>Verificação</TableHead>
                </TableRow></TableHeader>
                <TableBody>{LINHAS_EXTRATO.map((l) => { const prob = verificarLinha(F, l); return (
                  <TableRow key={l[1] + l[0]}>
                    <TableCell className="whitespace-nowrap">{fData(l[0])}</TableCell><TableCell className="font-mono">{l[1]}</TableCell><TableCell>{l[2]}</TableCell>
                    <TableCell className="text-right tabular-nums">{fNum(l[3], 1)}</TableCell><TableCell className="text-right tabular-nums">{fEur(l[4])}</TableCell><TableCell className="text-right tabular-nums">{fNum(l[5])}</TableCell>
                    <TableCell>{prob ? <Selo tom="warn">{prob}</Selo> : <Selo tom="ok">OK</Selo>}</TableCell>
                  </TableRow>); })}</TableBody>
              </Table>
            </Tabela>
          </div>
          <p className="text-sm text-muted-foreground">As linhas com aviso entram marcadas “Rever km” e não mexem nos km da viatura.</p>
          {validarImportar(F).extrato ? <Alerta tom="warn" icone={TriangleAlert}>Já importado: o {FICHEIRO_EXTRATO} já entrou nos custos.</Alerta> : null}
        </>
      );
    case "manut":
      return (
        <>
          {grelha(<>
            {sel("vid", "Viatura", optsAtivas(), { placeholder: "Escolher viatura" })}
            {sel("tipo", "Intervenção", opcoes(["Revisão", "Inspeção periódica (IPO)", "Pneus", "Travões", "Reparação", "Ar condicionado"]))}
            {data("data", "Data")}
            {sel("oficina", "Oficina", opcoes(OFICINAS), { ajuda: "Fornecedores do Inventário (exemplo)" })}
            {num("valor", "Valor estimado (€)", undefined, "0.01")}
          </>)}
          <Nota>A viatura fica bloqueada no dia marcado: aparece no calendário das Atribuições, na ficha e no Hoje. Fica registado no exemplo da Frota; a Agenda real só a mostrará quando houver tabelas.</Nota>
        </>
      );
    case "concluir": {
      const m = F.manut.find((z) => z.id === x.m), w = m ? viatura(F, m.vid) : undefined;
      if (!m || !w) return <p>Intervenção desconhecida.</p>;
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={w.mat} /> · {m.tipo} · {m.oficina}</p>
          {grelha(<>{num("km", "Km à saída")}{num("valor", "Valor final (€)", undefined, "0.01")}{data("data", "Data")}</>)}
          <p className="text-sm text-muted-foreground">O valor entra nos custos da viatura. {/Revis/.test(m.tipo) ? "A contagem da próxima revisão recomeça daqui." : /IPO/.test(m.tipo) ? "A validade da inspeção passa para daqui a um ano." : ""}</p>
        </>
      );
    }
    case "estado": {
      if (!v) return <p>Viatura desconhecida.</p>;
      const a = atribEm(F, v.id);
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={v.mat} /> · agora <SeloEstado v={v} /></p>
          {grelha(<>
            {sel("estado", "Novo estado", (Object.keys(ESTADOS) as (keyof typeof ESTADOS)[]).map((k) => ({ value: k, label: ESTADOS[k][1] })))}
            {area("motivo", "Motivo", "Fica no histórico da viatura.", "Ex.: avaria no motor, entregue na oficina")}
          </>)}
          {a ? <Alerta tom="warn" icone={TriangleAlert}>Se a viatura sair de “Ativa”, a atribuição a {pessoa(F, a.pid)?.nome} termina hoje e as reservas futuras ficam por reatribuir.</Alerta> : null}
        </>
      );
    }
    case "ocorrencia": {
      const sug = x.vid && x.quando ? quemConduzia(F, x.vid, x.quando) : undefined;
      return (
        <>
          {grelha(<>
            {sel("vid", "Viatura", optsAtivas(), { placeholder: "Escolher viatura" })}
            {sel("tipo", "Tipo", opcoes(["Avaria", "Sinistro", "Multa"]))}
            {data("quando", "Data e hora", undefined, "datetime-local")}
            {texto("local", "Local")}
            {num("valor", "Valor (€)", "Multas e franquias", "0.01")}
            {area("desc", "O que aconteceu")}
          </>)}
          {sug ? <Alerta tom="info" icone={UserRoundSearch}>Nessa data a viatura estava com <b>{sug.nome}</b>.</Alerta> : null}
        </>
      );
    }
    case "identificar": {
      const o = F.ocorr.find((z) => z.id === x.o), w = o ? viatura(F, o.vid) : undefined;
      if (!o || !w) return <p>Ocorrência desconhecida.</p>;
      const s = quemConduzia(F, o.vid, o.quando), a = atribEm(F, o.vid, o.quando.slice(0, 10));
      return (
        <>
          <dl className="grid gap-3 rounded-lg border bg-card p-3 text-sm sm:grid-cols-2">
            <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Viatura</dt><dd><Placa mat={w.mat} /></dd></div>
            <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Quando</dt><dd>{fData(o.quando.slice(0, 10))} às {o.quando.slice(11)}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Infração</dt><dd>{o.desc}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-muted-foreground">Prazo</dt><dd>{fData(prazoMulta(o))}</dd></div>
          </dl>
          {s && a ? <Alerta tom="info" icone={History}>Segundo as atribuições, a viatura estava com <b>{s.nome}</b> ({a.tipo === "pontual" ? "reserva " + (a.nota ?? "") : "atribuição permanente desde " + fData(a.ini)}).</Alerta>
            : <Alerta tom="warn" icone={TriangleAlert}>Não há atribuição nessa data. Escolhe o condutor à mão.</Alerta>}
          {grelha(sel("pid", "Condutor", F.pessoas.filter((p) => p.carta.length).map((p) => ({ value: p.id, label: p.nome })), { placeholder: "Escolher pessoa" }))}
          <p className="text-sm text-muted-foreground">Com as tabelas, o condutor recebe uma notificação com os dados da multa para assinar a identificação.</p>
        </>
      );
    }
    case "renovar": {
      if (!v) return <p>Viatura desconhecida.</p>;
      const k = x.k as ChaveVenc;
      return (
        <>
          <p className="flex flex-wrap items-center gap-1.5 text-sm"><Placa mat={v.mat} /> · {VENC[k]} válido até {fData(v.venc[k])}</p>
          {grelha(<>{data("data", "Nova validade")}{num("valor", "Valor pago (€)", "Opcional. Entra nos custos.", "0.01")}</>)}
          <Nota icone={Paperclip}>Com as tabelas, junta-se o comprovativo em PDF ou foto.</Nota>
        </>
      );
    }
    case "nova":
      return (
        <>
          {grelha(<>
            {texto("mat", "Matrícula", { attrs: { placeholder: "AA-00-AA", autoComplete: "off" } })}
            {texto("marca", "Marca")}
            {texto("modelo", "Modelo")}
            {sel("tipo", "Tipo", opcoes(["Furgão compacto", "Furgão", "Furgão grande", "Ligeiro de passageiros", "Pesado de mercadorias"]))}
            {sel("comb", "Combustível", opcoes(["Gasóleo", "Gasolina", "Híbrido", "Elétrico"]))}
            {sel("posse", "Posse", opcoes(["Própria", "Renting", "Leasing"]))}
            {num("ano", "Ano")}
            {num("km", "Km atuais")}
            {sel("cat", "Carta exigida", [{ value: "B", label: "Categoria B" }, { value: "C", label: "Categoria C" }])}
            {sel("centro", "Centro de custo", opcoes(CENTROS))}
            {data("seguro", "Seguro válido até")}
            {data("ipo", "Inspeção (IPO) até")}
            {data("iuc", "IUC até")}
          </>)}
          <div className="space-y-2">
            {marcar("armazem", "É um armazém móvel (stock na carrinha)")}
            {marcar("agenda", "É um recurso da Agenda (para reservas e conflitos)")}
          </div>
          <Nota>Exemplo: não se cria armazém no Inventário nem recurso na Agenda reais. Isso acontece quando a Frota tiver tabelas.</Nota>
        </>
      );
  }
}
