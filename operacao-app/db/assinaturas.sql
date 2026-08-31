-- ============================================================
--  Operações — a assinatura do cliente, no telemóvel do técnico
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, rpcs.sql, anexos.sql.
--
--  Hoje o relatório leva uma linha para assinar à caneta. O papel perde-se,
--  molha-se, fica no carro. Uma assinatura recolhida no telemóvel fica com a
--  ordem para sempre, e sai no relatório.
--
--  ⚠ O QUE ISTO É, E O QUE NÃO É
--
--  Isto é o **equivalente digital da folha de obra assinada**: prova de que
--  uma pessoa esteve no local e aceitou o trabalho. Fica com o nome, a
--  qualidade em que assinou, o momento, e quem recolheu.
--
--  Isto **NÃO** é uma assinatura eletrónica qualificada. Não há certificado,
--  não há entidade certificadora, não há carimbo temporal de terceiro. Para
--  um contrato que precise disso, o CRM tem outro caminho — o de
--  `client_contract_signature_requests`, com token por email.
--
--  Essa distinção está escrita aqui e no ecrã, de propósito. Chamar-lhe
--  "validade legal" seria vender uma garantia que isto não dá.
--
--  Escreve fora de `ops_*`? NÃO. A imagem vai para o bucket `operacoes`, que
--  o `anexos.sql` já criou.
-- ============================================================

BEGIN;

DO $requisitos$
BEGIN
  IF to_regclass('public.ops_ordem') IS NULL THEN
    RAISE EXCEPTION 'Falta db/schema.sql. Corre-o primeiro.';
  END IF;
  IF to_regprocedure('public.ops_caminho_da_ordem(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Falta db/anexos.sql — é ele que define a convenção de caminhos.';
  END IF;
END
$requisitos$;


-- ============================================================
-- 1. A assinatura
-- ============================================================
-- Uma por ordem. Assinar outra vez substitui a anterior — e o histórico
-- guarda que houve substituição, com quem e quando.
--
-- `qualidade` é o que a pessoa é naquele momento: o cliente, o condómino, o
-- encarregado da obra, o porteiro que estava lá. Sem esse campo, uma
-- assinatura ilegível de alguém que passava não vale nada seis meses depois.

CREATE TABLE IF NOT EXISTS public.ops_assinatura (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL,
  ordem_id         uuid NOT NULL UNIQUE REFERENCES public.ops_ordem(id) ON DELETE CASCADE,

  nome             text NOT NULL,
  qualidade        text,
  -- Caminho no bucket `operacoes`, na mesma convenção dos anexos:
  -- {organization_id}/{ordem_id}/{ficheiro}
  caminho          text NOT NULL,

  -- Quem tinha o telemóvel na mão. Não é quem assinou — é quem recolheu.
  recolhida_por    uuid,                        -- → anew_users.id
  assinada_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_assinatura_ordem ON public.ops_assinatura (ordem_id);

ALTER TABLE public.ops_assinatura ENABLE ROW LEVEL SECURITY;

-- Uma política por comando. Uma `FOR ALL` com `USING` dá leitura sem se dar
-- por isso — foi assim que uma fuga de custos apareceu, apanhada por um teste.
DROP POLICY IF EXISTS ops_assinatura_ler ON public.ops_assinatura;
CREATE POLICY ops_assinatura_ler ON public.ops_assinatura
  FOR SELECT TO authenticated
  USING (public.ops_pode_ver_ordem(auth.uid(), ordem_id));

-- Escrita só pela RPC. A política nega tudo o resto: a RPC é SECURITY DEFINER
-- e não passa por aqui.
DROP POLICY IF EXISTS ops_assinatura_escrever ON public.ops_assinatura;
CREATE POLICY ops_assinatura_escrever ON public.ops_assinatura
  FOR INSERT TO authenticated
  WITH CHECK (false);


-- ============================================================
-- 2. Recolher a assinatura
-- ============================================================
-- Corre DEPOIS de a imagem subir ao storage, como nos anexos. Se isto
-- recusar, a app apaga o ficheiro que acabou de subir.
--
-- Quando se pode assinar: a ordem tem de estar **fechada**. Antes disso o
-- trabalho ainda não acabou, e uma assinatura a meio prova o quê? Depois de
-- confirmada pelo cliente também não se mexe.

CREATE OR REPLACE FUNCTION public.rpc_ops_assinar_ordem(
  p_ordem_id  uuid,
  p_caminho   text,
  p_nome      text,
  p_qualidade text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_user     uuid := public.current_business_user_id();
  v_o        record;
  v_funcao   text;
  v_esperado text;
  v_antes    text;
  v_nome     text := nullif(btrim(coalesce(p_nome, '')), '');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_o FROM public.ops_ordem WHERE id = p_ordem_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ordem não encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT (
    public.is_system_admin_user(v_uid)
    OR v_o.organization_id IN (SELECT public.get_user_visible_org_ids(v_uid))
  ) THEN
    RAISE EXCEPTION 'Sem acesso a esta ordem.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = v_o.organization_id AND ativo;

  IF v_funcao IS NULL AND NOT public.is_system_admin_user(v_uid) THEN
    RAISE EXCEPTION 'Sem função atribuída em Operações nesta organização.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Um técnico só recolhe a assinatura das ordens em que esteve. Foi ele que
  -- lá foi; quem não foi não tem o cliente à frente para assinar.
  IF v_funcao = 'tecnico'
     AND v_o.responsavel_id IS DISTINCT FROM v_user
     AND NOT EXISTS (SELECT 1 FROM public.ops_ordem_pessoa
                      WHERE ordem_id = p_ordem_id AND utilizador_id = v_user) THEN
    RAISE EXCEPTION 'Só quem esteve na ordem recolhe a assinatura.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_o.estado <> 'fechada' THEN
    RAISE EXCEPTION
      'A assinatura recolhe-se numa ordem fechada (esta está %). Fecha o trabalho primeiro.',
      replace(v_o.estado, '_', ' ');
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Falta o nome de quem assinou. Uma assinatura sem nome não prova nada.';
  END IF;

  -- O caminho tem de ser desta ordem. Sem esta verificação, alguém podia
  -- apontar a assinatura desta ordem para o ficheiro de outra.
  v_esperado := public.ops_caminho_da_ordem(p_ordem_id, '');
  IF p_caminho IS NULL OR position(v_esperado in p_caminho) <> 1 THEN
    RAISE EXCEPTION 'O caminho do ficheiro não corresponde a esta ordem.';
  END IF;

  SELECT caminho INTO v_antes FROM public.ops_assinatura WHERE ordem_id = p_ordem_id;

  INSERT INTO public.ops_assinatura
    (organization_id, ordem_id, nome, qualidade, caminho, recolhida_por)
  VALUES
    (v_o.organization_id, p_ordem_id, v_nome,
     nullif(btrim(coalesce(p_qualidade, '')), ''), p_caminho, v_user)
  ON CONFLICT (ordem_id) DO UPDATE
    SET nome = EXCLUDED.nome,
        qualidade = EXCLUDED.qualidade,
        caminho = EXCLUDED.caminho,
        recolhida_por = EXCLUDED.recolhida_por,
        assinada_em = now();

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (v_o.organization_id, 'ordem', p_ordem_id,
     CASE WHEN v_antes IS NULL THEN 'assinada' ELSE 'assinatura_substituida' END,
     'Assinada por ' || v_nome
       || COALESCE(' (' || nullif(btrim(coalesce(p_qualidade, '')), '') || ')', ''),
     v_user,
     CASE WHEN v_antes IS NULL THEN NULL ELSE jsonb_build_object('caminho', v_antes) END,
     jsonb_build_object('nome', v_nome, 'caminho', p_caminho));

  RETURN jsonb_build_object('ok', true, 'substituiu', v_antes IS NOT NULL);
END
$fn$;

REVOKE ALL ON FUNCTION public.rpc_ops_assinar_ordem(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_assinar_ordem(uuid, text, text, text)
  TO authenticated, service_role;


-- ============================================================
-- 3. Verificação
-- ============================================================

DO $verificar$
BEGIN
  IF to_regclass('public.ops_assinatura') IS NULL THEN
    RAISE EXCEPTION 'A tabela ops_assinatura não ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_tables
     WHERE schemaname = 'public' AND tablename = 'ops_assinatura' AND rowsecurity
  ) THEN
    RAISE EXCEPTION 'ops_assinatura ficou sem RLS.';
  END IF;

  RAISE NOTICE 'Operações: assinatura do cliente pronta.';
END
$verificar$;

COMMIT;
