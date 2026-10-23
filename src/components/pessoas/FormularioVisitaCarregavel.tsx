// Carrega à parte o formulário de uma visita ligado à base (Marcar e Alterar) e aguenta a falha do pacote (rede, deploy novo): o erro fica dentro
// do diálogo, traduzido, com «Tentar de novo», em vez de subir até ao limite de erros da aplicação e partir a ficha toda. Um `lazy` que falhou
// fica falhado para sempre, por isso tentar de novo cria um `lazy` novo.
import { Component, lazy, Suspense, useMemo, useState, type ComponentType, type JSX, type ReactNode } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";

const A = "pessoasPagina.real.visit.agenda.";

interface FalhaProps {
  children: ReactNode;
  aoTentar: () => void;
}

/** Contém o erro de carregar o pacote; a chave do componente muda a cada tentativa, e isso volta a montá-lo limpo. */
class LimiteDeCarga extends Component<FalhaProps, { falhou: boolean }> {
  state = { falhou: false };

  static getDerivedStateFromError(): { falhou: boolean } {
    return { falhou: true };
  }

  render(): ReactNode {
    return this.state.falhou ? <MensagemDeFalha aoTentar={this.props.aoTentar} /> : this.props.children;
  }
}

function MensagemDeFalha({ aoTentar }: { aoTentar: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-foreground">
      <span>{t(`${A}formLoadError`)}</span>
      <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoTentar}>{t(`${A}retry`)}</Button>
    </div>
  );
}

interface FormularioVisitaCarregavelProps<P extends object> {
  /** O `import()` do formulário; tem de ser uma função estável (de módulo), senão o formulário recarrega a cada render. */
  importar: () => Promise<{ default: ComponentType<P> }>;
  propriedades: NoInfer<P>;
}

export function FormularioVisitaCarregavel<P extends object>({ importar, propriedades }: FormularioVisitaCarregavelProps<P>) {
  const { t } = useTranslation();
  const [tentativa, setTentativa] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a tentativa é o que obriga a um `lazy` novo
  const Formulario = useMemo(() => lazy(importar), [importar, tentativa]);
  return (
    <LimiteDeCarga key={tentativa} aoTentar={() => setTentativa((n) => n + 1)}>
      <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">{t(`${A}loading`)}</p>}>
        <Formulario {...(propriedades as P & JSX.IntrinsicAttributes)} />
      </Suspense>
    </LimiteDeCarga>
  );
}
