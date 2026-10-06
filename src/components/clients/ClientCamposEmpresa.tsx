import { useEffect, useState } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CamposDinamicos } from "@/components/campos/CamposDinamicos";
import { useCamposEmpresa } from "@/hooks/useCamposEmpresa";
import { gravarExtraCliente } from "@/lib/campos/api";
import {
  emFalta,
  gravadosParaFormulario,
  resumoExtra,
  validarValores,
  type ValoresExtra,
  type ValoresFormulario,
} from "@/lib/campos/definicoes";
import { captureFlowError } from "@/lib/observability/captureFlowError";

interface ClientCamposEmpresaProps {
  clientId: string;
  organizationId: string | null | undefined;
  /** "resumo" = só leitura numa linha; "editar" = formulário com Gravar próprio. */
  modo: "resumo" | "editar";
}

/**
 * Campos da empresa na ficha do cliente (cfg_campos, ficha "cliente"; valores
 * em anew_clients.custom_fields — 20261209100000). Só aparece se a empresa do
 * cliente tiver campos configurados. Grava à parte do "Guardar" da ficha, por
 * rpc_cliente_extra_gravar, que mantém o "vip" e o resto do jsonb.
 */
export const ClientCamposEmpresa = ({ clientId, organizationId, modo }: ClientCamposEmpresaProps) => {
  const { toast } = useToast();
  const { fichas, termos } = useCamposEmpresa(organizationId ?? null);
  const ficha = fichas.cliente;
  const temCampos = ficha.extra.length > 0;

  const [gravados, setGravados] = useState<ValoresExtra | null>(null);
  const [valores, setValores] = useState<ValoresFormulario>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    if (!temCampos) return;
    let vivo = true;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("anew_clients")
        .select("custom_fields")
        .eq("id", clientId)
        .maybeSingle();
      if (!vivo) return;
      if (error) {
        captureFlowError(error, "client-lifecycle");
        return;
      }
      const cf = (data?.custom_fields ?? {}) as ValoresExtra;
      setGravados(cf);
      setValores(gravadosParaFormulario(cf));
    })();
    return () => { vivo = false; };
  }, [clientId, temCampos]);

  if (!temCampos) return null;

  if (modo === "resumo") {
    const texto = resumoExtra(ficha.extra, gravados);
    if (!texto) return null;
    return (
      <p className="text-sm text-muted-foreground flex items-start gap-2" data-testid="cliente-campos-empresa-resumo">
        <SlidersHorizontal className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{texto}</span>
      </p>
    );
  }

  const faltam = emFalta(ficha.extra, validarValores(ficha.todos, valores).valores);

  const gravar = async () => {
    const r = validarValores(ficha.todos, valores);
    setErros(r.erros);
    if (Object.keys(r.erros).length > 0) {
      toast({ title: "Campos da empresa", description: Object.values(r.erros)[0], variant: "destructive" });
      return;
    }
    setAGravar(true);
    try {
      const novo = await gravarExtraCliente(clientId, r.valores);
      setGravados(novo);
      setValores(gravadosParaFormulario(novo));
      toast({ title: "Campos gravados" });
    } catch (err: any) {
      captureFlowError(err, "client-lifecycle");
      toast({ title: "Erro", description: err?.message || "Não foi possível gravar.", variant: "destructive" });
    } finally {
      setAGravar(false);
    }
  };

  return (
    <div className="pt-4 border-t space-y-3" data-testid="cliente-campos-empresa">
      <h4 className="text-sm font-medium flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4" />
        Campos da empresa — {termos.cliente.singular}
      </h4>
      <p className="text-xs text-muted-foreground">Gravam-se à parte, com o botão abaixo.</p>
      <CamposDinamicos
        campos={ficha.extra}
        valores={valores}
        onChange={setValores}
        erros={erros}
        idPrefix={`cliente_${clientId}_extra`}
        disabled={aGravar || gravados === null}
      />
      {faltam.length > 0 && (
        <p className="text-xs text-amber-600">Por preencher: {faltam.map((d) => d.rotulo).join(", ")}</p>
      )}
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={gravar} disabled={aGravar || gravados === null}>
          {aGravar && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Gravar campos
        </Button>
      </div>
    </div>
  );
};
