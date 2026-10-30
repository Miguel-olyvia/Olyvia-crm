// A conversa do cliente com a equipa, dentro do negócio (portal, 30/10/2026): o mesmo painel das Operações («Conversa com o cliente»), com
// as mensagens da base. Lê ao abrir, de 10 em 10 segundos e ao voltar ao separador; o cliente escreve e a equipa responde nas Operações.
// As mensagens da equipa ficam lidas quando o cliente as vê. Só dados e funções da base (portal_neg_mensagens_*): nunca a tabela.
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle } from "lucide-react";
import { Conversa } from "@/emylia/ConversaObra";
import { mensagemDaLinha, type LinhaMensagem } from "@/emylia/real/conversaReal";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RespostaRpc = { data: unknown; error: { message: string } | null };
const rpc = (fn: string, args: Record<string, unknown>): PromiseLike<RespostaRpc> =>
  (supabase as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<RespostaRpc> }).rpc(fn, args);

export const CHAVE_MENSAGENS_PORTAL = "portal-negocio-mensagens";
export const CHAVE_NAO_LIDAS_PORTAL = "portal-negocio-nao-lidas";
const ATUALIZAR_CADA_MS = 10_000;

export function ConversaDoNegocio({ negocioId }: { negocioId: string }) {
  const cliente = useQueryClient();
  const consulta = useQuery({
    queryKey: [CHAVE_MENSAGENS_PORTAL, negocioId],
    queryFn: async (): Promise<LinhaMensagem[]> => {
      const { data, error } = await rpc("portal_neg_mensagens_ler", { p_negocio_id: negocioId });
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? (data as LinhaMensagem[]) : [];
    },
    refetchInterval: ATUALIZAR_CADA_MS,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const linhas = consulta.data ?? [];

  const enviar = useMutation({
    mutationFn: async (texto: string): Promise<LinhaMensagem> => {
      const { data, error } = await rpc("portal_neg_mensagem_enviar", { p_negocio_id: negocioId, p_texto: texto });
      if (error) throw new Error(error.message);
      if (!data || typeof data !== "object") throw new Error("Resposta inesperada do servidor: a mensagem pode ter seguido, confirme na conversa.");
      return data as LinhaMensagem;
    },
    onSuccess: async (nova) => {
      // Uma leitura a meio não pode apagar a mensagem acabada de enviar, nem duplicá-la: cancela-se, junta-se (sem repetir o mesmo id) e relê-se.
      await cliente.cancelQueries({ queryKey: [CHAVE_MENSAGENS_PORTAL, negocioId] });
      cliente.setQueryData<LinhaMensagem[]>([CHAVE_MENSAGENS_PORTAL, negocioId], (antes) => {
        const lista = antes ?? [];
        return lista.some((l) => l.id === nova.id) ? lista : [...lista, nova];
      });
      void cliente.invalidateQueries({ queryKey: [CHAVE_MENSAGENS_PORTAL, negocioId] });
    },
  });

  // Quando o cliente vê mensagens da equipa por ler, ficam lidas (e o contador da lista desce).
  const porLer = linhas.some((l) => l.de === "empresa" && !l.lida);
  useEffect(() => {
    if (!porLer) return;
    let cancelado = false;
    void Promise.resolve(rpc("portal_neg_mensagens_marcar_lidas", { p_negocio_id: negocioId })).then(({ error }) => {
      if (cancelado || error) return;
      cliente.setQueryData<LinhaMensagem[]>([CHAVE_MENSAGENS_PORTAL, negocioId], (antes) => (antes ?? []).map((l) => (l.de === "empresa" ? { ...l, lida: true } : l)));
      void cliente.invalidateQueries({ queryKey: [CHAVE_NAO_LIDAS_PORTAL] });
    });
    return () => { cancelado = true; };
  }, [porLer, negocioId, cliente]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><MessageCircle className="h-4 w-4" aria-hidden="true" />Conversa com a equipa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {consulta.isLoading ? (
          <p role="status" className="text-sm text-muted-foreground">A carregar a conversa…</p>
        ) : consulta.isError && !consulta.data ? (
          <p role="alert" className="text-[15px] text-destructive">Não foi possível ler a conversa. Tente de novo daqui a pouco.</p>
        ) : (
          <Conversa
            msgs={linhas.map(mensagemDaLinha)} eu="cliente" enviar={(t) => enviar.mutateAsync(t).then(() => true, () => false)}
            vazio="Ainda sem mensagens. Escreva à equipa: respondemos por aqui."
          />
        )}
        {consulta.isError && consulta.data && <p role="status" className="text-sm text-muted-foreground">Não foi possível atualizar a conversa; a tentar de novo…</p>}
        {enviar.isError && <p role="alert" className="text-[15px] text-destructive">{enviar.error instanceof Error ? enviar.error.message : "Não foi possível enviar a mensagem."}</p>}
      </CardContent>
    </Card>
  );
}
