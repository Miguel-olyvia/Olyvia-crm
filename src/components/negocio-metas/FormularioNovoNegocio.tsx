import { useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOCO } from "./estilos";
import { CamposContactoNegocio } from "./CamposContactoNegocio";
import type { DadosContactoNegocio } from "./negocioMetas";
import {
  COMERCIAIS_EXEMPLO, COMERCIAL_POR_OMISSAO, SERVICOS_SUGERIDOS, CONTACTO_VAZIO, reporContacto,
  validarNovoNegocio, type ChaveContacto, type DadosCriarNegocio, type ErroCampo, type ErrosNovoNegocio, type PessoaOpcao,
} from "./novoNegocio";

const N = "businessGoals.new.";
const ITEM = "min-h-11 cursor-pointer";

/** A mensagem de erro de um campo: ícone e texto (a cor nunca é o único sinal), ligada ao campo por aria-describedby. */
function ErroDoCampo({ id, erro, campo }: { id: string; erro: ErroCampo | undefined; campo: "person" | "service" }) {
  const { t } = useTranslation();
  if (!erro) return null;
  return (
    <p id={id} className="flex items-center gap-1.5 text-sm text-destructive">
      <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t(`${N}error.${campo}.${erro}`)}
    </p>
  );
}

/** Rótulo com "obrigatório" dito em texto (o asterisco é só para a vista). */
function Rotulo({ para, texto, obrigatorio }: { para: string; texto: string; obrigatorio?: boolean }) {
  const { t } = useTranslation();
  return (
    <Label htmlFor={para}>
      {texto}
      {obrigatorio && (
        <>
          <span aria-hidden="true"> *</span>
          <span className="sr-only"> ({t(`${N}required`)})</span>
        </>
      )}
    </Label>
  );
}

interface CamposProps {
  ids: Record<"pessoa" | "servico" | "comercial" | "erroPessoa" | "erroServico" | "dica" | "sugestoes", string>;
  erros: ErrosNovoNegocio;
}

interface CampoPessoaProps extends CamposProps {
  pessoas: readonly PessoaOpcao[];
  valor: string;
  campo: RefObject<HTMLButtonElement>;
  aoMudar: (id: string) => void;
}

function CampoPessoa({ ids, erros, pessoas, valor, campo, aoMudar }: CampoPessoaProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Rotulo para={ids.pessoa} texto={t(`${N}person`)} obrigatorio />
      <Select value={valor} onValueChange={aoMudar}>
        <SelectTrigger
          id={ids.pessoa} ref={campo} aria-required="true" aria-invalid={erros.pessoaId ? true : undefined}
          aria-describedby={erros.pessoaId ? ids.erroPessoa : undefined} className={cn("min-h-11", FOCO)}
        >
          <SelectValue placeholder={t(`${N}person.placeholder`)} />
        </SelectTrigger>
        <SelectContent>
          {pessoas.map((p) => <SelectItem key={p.id} value={p.id} className={ITEM}>{p.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <ErroDoCampo id={ids.erroPessoa} erro={erros.pessoaId} campo="person" />
    </div>
  );
}

interface CampoServicoProps extends CamposProps {
  valor: string;
  campo: RefObject<HTMLInputElement>;
  aoMudar: (texto: string) => void;
}

function CampoServico({ ids, erros, valor, campo, aoMudar }: CampoServicoProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Rotulo para={ids.servico} texto={t(`${N}service`)} obrigatorio />
      <Input
        id={ids.servico} ref={campo} value={valor} list={ids.sugestoes} autoComplete="off" aria-required="true"
        onChange={(e) => aoMudar(e.target.value)} aria-invalid={erros.servico ? true : undefined}
        aria-describedby={erros.servico ? `${ids.dica} ${ids.erroServico}` : ids.dica} className={cn("min-h-11", FOCO)}
      />
      <datalist id={ids.sugestoes}>
        {SERVICOS_SUGERIDOS.map((s) => <option key={s} value={s} />)}
      </datalist>
      <p id={ids.dica} className="text-sm text-muted-foreground">{t(`${N}service.hint`)}</p>
      <ErroDoCampo id={ids.erroServico} erro={erros.servico} campo="service" />
    </div>
  );
}

function CampoComercial({ id, valor, aoMudar }: { id: string; valor: string; aoMudar: (c: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <Rotulo para={id} texto={t(`${N}salesperson`)} />
      <Select value={valor} onValueChange={aoMudar}>
        <SelectTrigger id={id} className={cn("min-h-11", FOCO)}><SelectValue /></SelectTrigger>
        <SelectContent>
          {COMERCIAIS_EXEMPLO.map((c) => <SelectItem key={c} value={c} className={ITEM}>{c}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

/** O primeiro passo, só para ler: o negócio começa sempre em Orçamento. */
function PrimeiroPasso() {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <p className="text-sm font-medium text-foreground">{t(`${N}first`)}</p>
      <p className="text-sm text-muted-foreground">{t(`${N}first.text`)}</p>
    </div>
  );
}

interface FormularioProps {
  pessoas: readonly PessoaOpcao[];
  /** Recebe o foco quando o diálogo abre: o primeiro campo. */
  primeiroCampo: RefObject<HTMLButtonElement>;
  aoConfirmar: (dados: DadosCriarNegocio) => void;
}

/** O formulário curto de "Novo negócio": Pessoa e Serviço obrigatórios, Comercial e o primeiro passo (só leitura). */
export function FormularioNovoNegocio({ pessoas, primeiroCampo, aoConfirmar }: FormularioProps) {
  const { t } = useTranslation();
  const id = useId();
  const [pessoaId, setPessoaId] = useState("");
  const [servico, setServico] = useState("");
  const [comercial, setComercial] = useState(COMERCIAL_POR_OMISSAO);
  const [contacto, setContacto] = useState<DadosContactoNegocio>(CONTACTO_VAZIO);
  const [tocados, setTocados] = useState<ReadonlySet<ChaveContacto>>(new Set());
  const [erros, setErros] = useState<ErrosNovoNegocio>({});
  const campoServico = useRef<HTMLInputElement>(null);
  const ids = {
    pessoa: `${id}-pessoa`, servico: `${id}-servico`, comercial: `${id}-comercial`,
    erroPessoa: `${id}-erro-pessoa`, erroServico: `${id}-erro-servico`, dica: `${id}-dica`, sugestoes: `${id}-sugestoes`,
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    const pessoa = pessoas.find((p) => p.id === pessoaId);
    const encontrados = validarNovoNegocio({ pessoaId: pessoa ? pessoaId : "", servico, contacto });
    setErros(encontrados);
    if (encontrados.pessoaId) primeiroCampo.current?.focus();
    else if (encontrados.servico) campoServico.current?.focus();
    else if (encontrados.email || encontrados.nif || encontrados.nifEmpresa) {
      const primeiro = (["email", "nif", "nifEmpresa"] as const).find((c) => encontrados[c]);
      if (primeiro) document.getElementById(`${id}-${primeiro}`)?.focus();
    } else if (pessoa) aoConfirmar({ pessoa, servico, comercial, contacto });
  };

  const mudarPessoa = (novaId: string) => {
    setPessoaId(novaId);
    setContacto((atual) => reporContacto(atual, tocados, pessoas.find((p) => p.id === novaId)));
    setErros((x) => ({ ...x, pessoaId: undefined, email: undefined, nif: undefined, nifEmpresa: undefined }));
  };

  const mudarContacto = (chave: ChaveContacto, valor: string) => {
    setTocados((antes) => new Set(antes).add(chave));
    setContacto((c) => ({ ...c, [chave]: valor }));
    setErros((x) => (chave === "email" || chave === "nif" || chave === "nifEmpresa" ? { ...x, [chave]: undefined } : x));
  };

  return (
    <form onSubmit={enviar} noValidate className="space-y-4">
      <CampoPessoa
        ids={ids} erros={erros} pessoas={pessoas} valor={pessoaId} campo={primeiroCampo}
        aoMudar={mudarPessoa}
      />
      <CampoServico
        ids={ids} erros={erros} valor={servico} campo={campoServico}
        aoMudar={(v) => { setServico(v); setErros((x) => ({ ...x, servico: undefined })); }}
      />
      <CampoComercial id={ids.comercial} valor={comercial} aoMudar={setComercial} />
      <CamposContactoNegocio idBase={id} valores={contacto} erros={erros} aoMudar={mudarContacto} />
      <PrimeiroPasso />
      <DialogFooter className="gap-2 sm:gap-0">
        <DialogClose asChild>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)}>{t(`${N}cancel`)}</Button>
        </DialogClose>
        <Button type="submit" className={cn("min-h-11", FOCO)}>{t(`${N}submit`)}</Button>
      </DialogFooter>
    </form>
  );
}
