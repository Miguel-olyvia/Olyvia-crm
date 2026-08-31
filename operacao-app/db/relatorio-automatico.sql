-- ============================================================
--  Operações — o relatório vai ao cliente sozinho
-- ============================================================
--  Correr DEPOIS de: schema.sql, permissoes.sql, rpcs.sql, notificacoes.sql.
--
--  Hoje, fechar uma ordem e mandar o relatório ao cliente são duas coisas, e a
--  segunda depende de alguém se lembrar. Passa a ser uma: quando a ordem é
--  **confirmada**, o email sai.
--
--  ⚠ CONFIRMADA, E NÃO FECHADA
--
--  "Fechada" é o técnico a dizer que acabou. "Confirmada" é o escritório a
--  dizer que está bem. Mandar ao cliente no primeiro momento seria mandar
--  trabalho por rever — e um email não se chama de volta.
--
--  ⚠ DESLIGADO À NASCENÇA
--
--  Escrever a um cliente é um ato para fora. Nenhuma organização começa com
--  isto ligado: alguém em Definições tem de o ligar de propósito.
--
--  Escreve fora de `ops_*`? **SIM** — uma linha em `scheduled_emails`, que é a
--  fila de saída que o CRM já tem e já processa (a edge function
--  `process-scheduled-emails`, chamada pelo pg_cron). É a segunda exceção do
--  módulo, depois de `notifications`, e pela mesma razão: escrever numa tabela
--  genérica feita para receber isto é diferente de alterar uma tabela de
--  negócio. Não se cria SMTP, não se manda email daqui, não se toca em mais
--  nada — põe-se uma carta no marco do correio que já existe.
-- ============================================================

BEGIN;

DO $requisitos$
BEGIN
  IF to_regclass('public.ops_ordem') IS NULL THEN
    RAISE EXCEPTION 'Falta db/schema.sql. Corre-o primeiro.';
  END IF;
  IF to_regclass('public.ops_evento') IS NULL THEN
    RAISE EXCEPTION 'Falta db/schema.sql — o gatilho vive em ops_evento.';
  END IF;
END
$requisitos$;


-- ============================================================
-- 1. As definições da organização
-- ============================================================
-- Uma tabela minúscula de chave/valor, por organização. Existe porque isto é
-- a primeira coisa do módulo que uma empresa tem de poder ligar e desligar, e
-- porque virão mais.
--
-- As chaves são fechadas por CHECK de propósito: um saco aberto de texto livre
-- é como se perde a noção do que a aplicação lê, e passado um ano ninguém sabe
-- que definições existem.

CREATE TABLE IF NOT EXISTS public.ops_definicao (
  organization_id uuid NOT NULL,
  chave           text NOT NULL
                    CHECK (chave IN ('relatorio_automatico')),
  valor           text NOT NULL,
  atualizada_em   timestamptz NOT NULL DEFAULT now(),
  atualizada_por  uuid,                          -- → anew_users.id
  PRIMARY KEY (organization_id, chave)
);

COMMENT ON TABLE public.ops_definicao IS
  'Interruptores por organização. Chaves fechadas por CHECK, de propósito.';

ALTER TABLE public.ops_definicao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ops_definicao_ler ON public.ops_definicao;
CREATE POLICY ops_definicao_ler ON public.ops_definicao
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_visible_org_ids((SELECT auth.uid()))));

-- Sem política de escrita: só a RPC abaixo escreve, e ela é SECURITY DEFINER.
GRANT SELECT ON public.ops_definicao TO authenticated;
REVOKE ALL ON public.ops_definicao FROM anon;


-- ============================================================
-- 2. Ler uma definição
-- ============================================================
-- Devolve o valor por omissão quando ninguém mexeu. O 'nao' do relatório
-- automático está aqui, e é o que garante que uma organização que instale isto
-- não começa a mandar emails sem ninguém ter decidido nada.

CREATE OR REPLACE FUNCTION public.ops_definicao_de(_org_id uuid, _chave text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT valor FROM public.ops_definicao
      WHERE organization_id = _org_id AND chave = _chave),
    CASE _chave WHEN 'relatorio_automatico' THEN 'nao' ELSE NULL END
  );
$$;

REVOKE ALL ON FUNCTION public.ops_definicao_de(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ops_definicao_de(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.rpc_ops_definir(
  p_org_id uuid,
  p_chave  text,
  p_valor  text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_funcao text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_org_id NOT IN (SELECT public.get_user_visible_org_ids(auth.uid())) THEN
    RAISE EXCEPTION 'Organização fora do teu alcance.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT funcao INTO v_funcao
    FROM public.ops_utilizador_perfil
   WHERE utilizador_id = v_user AND organization_id = p_org_id;

  -- Ligar o envio ao cliente é uma decisão da casa, não de quem executa.
  IF COALESCE(v_funcao, '') NOT IN ('admin', 'gestor') THEN
    RAISE EXCEPTION 'Só quem gere é que muda definições.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_chave = 'relatorio_automatico' AND p_valor NOT IN ('sim', 'nao') THEN
    RAISE EXCEPTION 'O relatório automático só pode ser "sim" ou "nao".';
  END IF;

  INSERT INTO public.ops_definicao (organization_id, chave, valor, atualizada_por)
  VALUES (p_org_id, p_chave, p_valor, v_user)
  ON CONFLICT (organization_id, chave) DO UPDATE
    SET valor = EXCLUDED.valor,
        atualizada_em = now(),
        atualizada_por = EXCLUDED.atualizada_por;

  RETURN jsonb_build_object('ok', true, 'chave', p_chave, 'valor', p_valor);
END
$$;

REVOKE ALL ON FUNCTION public.rpc_ops_definir(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_definir(uuid, text, text) TO authenticated;


-- ============================================================
-- 3. O relatório, em HTML
-- ============================================================
-- Escrito aqui e não na aplicação porque o envio é automático: no momento em
-- que a ordem é confirmada, não há browser nenhum aberto para desenhar nada.
--
-- É deliberadamente simples. Um email tem de se ler no telemóvel, num cliente
-- de correio que ignora metade do CSS que se lhe der — por isso vai tudo em
-- estilo por atributo, sem folha de estilos e sem imagens externas.
--
-- **Não leva fotografias nem assinatura em imagem.** O bucket é privado, e um
-- link assinado expira; mandar um link morto é pior do que não mandar nada.
-- Diz-se que existem e quem as quiser pede-as.

-- Um nome de cliente com um `<` parte o email de quem o recebe, e um título
-- com aspas não é bem-vindo dentro de um atributo. Escapa-se sempre.
CREATE OR REPLACE FUNCTION public.ops_escapar_html(_t text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT replace(replace(replace(replace(replace(
           COALESCE(_t, ''),
           '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

-- 2.4 bar guarda-se como 2.400 num numeric(12,3), e ninguém diz "dois vírgula
-- quatrocentos bar". Tiram-se os zeros que a coluna impôs, e a vírgula é a
-- portuguesa — este texto vai para um cliente, não para um registo técnico.
CREATE OR REPLACE FUNCTION public.ops_numero_legivel(_n numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN _n IS NULL THEN NULL
              ELSE replace(trim_scale(_n)::text, '.', ',') END;
$$;

CREATE OR REPLACE FUNCTION public.ops_linha_info(_rotulo text, _valor text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT '<tr><td style="padding:2px 16px 2px 0;color:#64748b;vertical-align:top">'
      || public.ops_escapar_html(_rotulo)
      || '</td><td style="padding:2px 0">'
      || public.ops_escapar_html(COALESCE(nullif(btrim(_valor), ''), '—'))
      || '</td></tr>';
$$;


CREATE OR REPLACE FUNCTION public.ops_relatorio_html(_ordem_id uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o        record;
  v_cliente  text;
  v_local    text;
  v_linhas   text := '';
  v_as_nome  text;
  v_as_qual  text;
  v_as_em    timestamptz;
  v_nfoto    integer;
  r          record;
BEGIN
  SELECT o.*, l.nome AS local_nome, l.morada AS local_morada
    INTO v_o
    FROM public.ops_ordem o
    LEFT JOIN public.ops_local l ON l.id = o.local_id
   WHERE o.id = _ordem_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT COALESCE(nullif(btrim(e.display_name), ''), 'Cliente')
    INTO v_cliente
    FROM public.anew_clients cl
    JOIN public.anew_entities e ON e.id = cl.entity_id
   WHERE cl.id = v_o.cliente_id;

  v_local := COALESCE(
    nullif(btrim(concat_ws(' — ', v_o.local_nome, v_o.local_morada)), ''),
    '—'
  );

  FOR r IN
    SELECT t.nome, t.estado, t.unidade, t.valor_num, t.valor_texto, t.observacoes
      FROM public.ops_ordem_tarefa t
     WHERE t.ordem_id = _ordem_id
     ORDER BY t.posicao, t.nome
  LOOP
    v_linhas := v_linhas
      || '<tr>'
      || '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">'
      || ops_escapar_html(r.nome)
      || CASE WHEN nullif(btrim(COALESCE(r.observacoes, '')), '') IS NULL THEN ''
              ELSE '<br><span style="color:#64748b;font-size:12px">'
                   || ops_escapar_html(r.observacoes) || '</span>' END
      || '</td>'
      || '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap">'
      || ops_escapar_html(COALESCE(
           nullif(btrim(concat_ws(' ', ops_numero_legivel(r.valor_num), r.unidade)), ''),
           r.valor_texto,
           ''))
      || '</td>'
      || '<td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;white-space:nowrap;'
      || CASE r.estado
           WHEN 'nao_conforme' THEN 'color:#b45309;font-weight:600'
           WHEN 'feita' THEN 'color:#047857'
           ELSE 'color:#64748b' END
      || '">'
      || CASE r.estado
           WHEN 'feita' THEN 'Conforme'
           WHEN 'nao_conforme' THEN 'Não conforme'
           WHEN 'nao_aplicavel' THEN 'Não aplicável'
           ELSE 'Por fazer' END
      || '</td></tr>';
  END LOOP;

  -- `db/assinaturas.sql` pode não estar instalado. Sem ele, o relatório sai
  -- na mesma — só sem a linha de quem recebeu.
  IF to_regclass('public.ops_assinatura') IS NOT NULL THEN
    EXECUTE 'SELECT nome, qualidade, assinada_em FROM public.ops_assinatura WHERE ordem_id = $1'
      INTO v_as_nome, v_as_qual, v_as_em USING _ordem_id;
  END IF;

  SELECT count(*) INTO v_nfoto
    FROM public.ops_anexo a
   WHERE a.ordem_id = _ordem_id;

  RETURN
    '<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;'
    || 'color:#0f172a;max-width:640px;margin:0 auto;padding:8px">'
    || '<p style="font-size:12px;color:#64748b;margin:0 0 2px;font-family:monospace">'
    || ops_escapar_html(v_o.codigo) || '</p>'
    || '<h1 style="font-size:19px;margin:0 0 16px;line-height:1.3">'
    || ops_escapar_html(v_o.titulo) || '</h1>'

    || '<table style="border-collapse:collapse;font-size:14px;margin:0 0 20px">'
    || ops_linha_info('Cliente', v_cliente)
    || ops_linha_info('Onde', v_local)
    || ops_linha_info('Concluída em',
         to_char(COALESCE(v_o.fechada_em, v_o.confirmada_em), 'DD/MM/YYYY "às" HH24:MI'))
    || '</table>'

    || CASE WHEN v_linhas = '' THEN ''
       ELSE '<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;'
            || 'color:#64748b;margin:0 0 8px">O que foi feito</h2>'
            || '<table style="border-collapse:collapse;width:100%;font-size:14px;margin:0 0 20px">'
            || v_linhas || '</table>' END

    || CASE WHEN v_as_nome IS NULL THEN ''
       ELSE '<p style="font-size:14px;margin:0 0 20px;padding:10px 12px;background:#f8fafc;'
            || 'border-radius:8px">Recebido e aceite por <strong>'
            || ops_escapar_html(v_as_nome) || '</strong>'
            || CASE WHEN v_as_qual IS NULL THEN ''
                    ELSE ' (' || ops_escapar_html(v_as_qual) || ')' END
            || ', a ' || to_char(v_as_em, 'DD/MM/YYYY') || '.</p>' END

    || CASE WHEN COALESCE(v_nfoto, 0) = 0 THEN ''
       ELSE '<p style="font-size:13px;color:#64748b;margin:0 0 20px">Esta intervenção tem '
            || v_nfoto || CASE WHEN v_nfoto = 1 THEN ' ficheiro anexo' ELSE ' ficheiros anexos' END
            || '. Peça-nos e enviamos.</p>' END

    || '<p style="font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;'
    || 'margin:0">Este email foi enviado automaticamente ao concluir-se a intervenção. '
    || 'Para qualquer questão, responda a esta mensagem.</p>'
    || '</div>';
END
$$;



-- ============================================================
-- 4. Pôr a carta no marco
-- ============================================================
-- Nunca levanta exceção. Uma ordem confirma-se mesmo que o email não possa
-- sair — o trabalho é o trabalho, o email é acessório. É a mesma regra do
-- `ops_notificar`, e pela mesma razão.

CREATE OR REPLACE FUNCTION public.ops_agendar_relatorio(_ordem_id uuid, _autor_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_o     record;
  v_email text;
  v_html  text;
  v_autor uuid;
BEGIN
  IF to_regclass('public.scheduled_emails') IS NULL THEN RETURN false; END IF;

  SELECT id, organization_id, cliente_id, codigo, titulo
    INTO v_o
    FROM public.ops_ordem
   WHERE id = _ordem_id;

  IF NOT FOUND THEN RETURN false; END IF;

  -- Desligado à nascença. Ninguém escreve a um cliente por engano.
  IF public.ops_definicao_de(v_o.organization_id, 'relatorio_automatico') <> 'sim' THEN
    RETURN false;
  END IF;

  SELECT m.email INTO v_email
    FROM public.anew_clients cl
    JOIN public.anew_entity_emails m ON m.entity_id = cl.entity_id
   WHERE cl.id = v_o.cliente_id
   ORDER BY m.is_primary DESC NULLS LAST, m.created_at
   LIMIT 1;

  -- Sem email na ficha não há a quem escrever. Não é erro: é uma ficha por
  -- preencher, e quem a preencher passa a receber os relatórios seguintes.
  IF nullif(btrim(COALESCE(v_email, '')), '') IS NULL THEN RETURN false; END IF;

  -- Reabrir e voltar a confirmar não manda o relatório outra vez. Sem isto, um
  -- cliente recebia o mesmo email duas vezes por causa de uma correção interna.
  IF EXISTS (
    SELECT 1 FROM public.scheduled_emails
     WHERE entity_type = 'ops_ordem' AND entity_id = _ordem_id
       AND status IN ('pending', 'sent')
  ) THEN
    RETURN false;
  END IF;

  v_html := public.ops_relatorio_html(_ordem_id);
  IF v_html IS NULL THEN RETURN false; END IF;

  -- `scheduled_emails.user_id` serve para descobrir o SMTP de saída, e o
  -- resolvedor do CRM aceita tanto o id de autenticação como o de negócio.
  SELECT COALESCE(u.auth_user_id, u.id) INTO v_autor
    FROM public.anew_users u
   WHERE u.id = _autor_id;

  -- Sem autor não se sabe por que SMTP havia de sair. Acontece se a ordem for
  -- confirmada por um processo e não por uma pessoa.
  IF v_autor IS NULL THEN RETURN false; END IF;

  INSERT INTO public.scheduled_emails
    (user_id, organization_id, entity_type, entity_id,
     to_email, subject, body_html, scheduled_for, status)
  VALUES
    (v_autor, v_o.organization_id, 'ops_ordem', _ordem_id,
     btrim(v_email),
     v_o.codigo || ' — ' || v_o.titulo,
     v_html,
     now(), 'pending');

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Relatório não agendado para %: %', _ordem_id, SQLERRM;
  RETURN false;
END
$$;

REVOKE ALL ON FUNCTION public.ops_agendar_relatorio(uuid, uuid) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 5. O gatilho
-- ============================================================
-- Em `ops_evento`, e não dentro de `rpc_ops_transitar_ordem`.
--
-- Assim não se reescreve a RPC grande — que é onde vivem as regras de estado e
-- onde uma alteração distraída custa caro. Cada transição já grava um evento;
-- o evento 'confirmar' é o sinal, e não pode faltar nem chegar duas vezes.

CREATE OR REPLACE FUNCTION public.ops_ao_confirmar_ordem()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.entidade = 'ordem' AND NEW.tipo = 'confirmar' THEN
    PERFORM public.ops_agendar_relatorio(NEW.entidade_id, NEW.autor_id);
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS ops_evento_relatorio ON public.ops_evento;
CREATE TRIGGER ops_evento_relatorio
  AFTER INSERT ON public.ops_evento
  FOR EACH ROW
  EXECUTE FUNCTION public.ops_ao_confirmar_ordem();


-- ============================================================
-- 6. Verificação
-- ============================================================

DO $verificar$
DECLARE
  v_falta text[] := ARRAY[]::text[];
  v_f     text;
BEGIN
  FOREACH v_f IN ARRAY ARRAY[
    'public.ops_definicao_de(uuid,text)',
    'public.rpc_ops_definir(uuid,text,text)',
    'public.ops_relatorio_html(uuid)',
    'public.ops_agendar_relatorio(uuid,uuid)',
    'public.ops_linha_info(text,text)',
    'public.ops_escapar_html(text)',
    'public.ops_numero_legivel(numeric)',
    'public.ops_ao_confirmar_ordem()'
  ] LOOP
    IF to_regprocedure(v_f) IS NULL THEN v_falta := v_falta || v_f; END IF;
  END LOOP;

  IF array_length(v_falta, 1) > 0 THEN
    RAISE EXCEPTION 'Não ficaram criadas: %', array_to_string(v_falta, ', ');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ops_evento_relatorio' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O gatilho ops_evento_relatorio não ficou criado.';
  END IF;

  RAISE NOTICE 'Operações: o relatório pode ir ao cliente sozinho.';
  RAISE NOTICE 'Fica DESLIGADO até alguém o ligar em Definições › Automático.';
END
$verificar$;

COMMIT;
