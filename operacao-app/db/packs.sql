-- ============================================================
--  Operações — packs de configuração, para o primeiro dia não ser em branco
-- ============================================================
--  Correr DEPOIS de: schema.sql, correcoes-modelo.sql, config.sql.
--
--  O problema: uma árvore de definições vazia acaba sempre em caixote. O
--  Infraspeak entrega tudo em branco, cada cliente constrói a sua taxonomia à
--  mão sem curadoria, e o resultado vê-se na instância real — categorias
--  chamadas "BM24 PISO", pastas comerciais dentro de "Manutenções", e um plano
--  preventivo chamado "PMP CORRETIVA".
--
--  Um pack entrega categorias, medições e checklists **já feitas e publicadas**,
--  para se poder abrir a primeira ordem no mesmo dia. Depois edita-se, apaga-se
--  o que não serve, e acrescenta-se o que falta.
--
--  Três regras que fazem isto ser seguro de correr:
--
--   1. **Nunca sobrepõe.** Uma categoria com o mesmo código, uma medição com o
--      mesmo nome, uma checklist com o mesmo código — passa à frente. Quem
--      editou o que já cá estava não perde a edição;
--   2. **É repetível.** Correr o mesmo pack duas vezes não duplica nada, e
--      devolve o que criou e o que saltou;
--   3. **Não apaga.** Não há desinstalar. Apagar configuração é uma decisão de
--      quem a montou, ecrã a ecrã, e não de um botão que leva tudo à frente.
--
--  Escreve fora de `ops_*`? NÃO.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. O conteúdo dos packs
-- ============================================================
-- Em JSON, e não em tabelas, de propósito: um pack é *código*, não dados do
-- cliente. Vive no repositório, muda com um commit, e não há um ecrã para o
-- editar — que seria a primeira coisa a virar caixote outra vez.
--
-- As medições de escolha trazem `corretiva: true` nas opções que assinalam um
-- problema. É essa caixa que, no Infraspeak, está desligada no extintor — e é
-- por isso que lá as não conformidades morrem no histórico.

CREATE OR REPLACE FUNCTION public.ops_pack_conteudo(_pack text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
AS $fn$
SELECT CASE _pack

WHEN 'manutencao' THEN '{
  "nome": "Manutenção de edifícios",
  "descricao": "Extintores, AVAC, elevadores e quadros elétricos. O que uma empresa de manutenção visita todos os meses.",
  "categorias": [
    {"codigo": "EXT", "nome": "Extintores"},
    {"codigo": "AVAC", "nome": "AVAC"},
    {"codigo": "ELEV", "nome": "Elevadores"},
    {"codigo": "QE", "nome": "Quadros elétricos"},
    {"codigo": "PORT", "nome": "Portões automáticos"},
    {"codigo": "ILUM", "nome": "Iluminação de emergência"}
  ],
  "medicoes": [
    {"nome": "Pressão do extintor", "tipo": "gama", "unidade": "bar", "min": 10, "max": 15, "categoria": "EXT"},
    {"nome": "Estado do selo", "tipo": "escolha", "categoria": "EXT", "opcoes": [
      {"nome": "Intacto"},
      {"nome": "Violado", "mau": true, "corretiva": true},
      {"nome": "Ilegível", "mau": true, "corretiva": true}
    ]},
    {"nome": "Validade do extintor", "tipo": "texto", "categoria": "EXT"},
    {"nome": "Temperatura de insuflação", "tipo": "gama", "unidade": "°C", "min": 16, "max": 24, "categoria": "AVAC"},
    {"nome": "Estado dos filtros", "tipo": "escolha", "categoria": "AVAC", "opcoes": [
      {"nome": "Limpos"},
      {"nome": "A precisar de limpeza"},
      {"nome": "Saturados", "mau": true, "corretiva": true}
    ]},
    {"nome": "Horas de funcionamento", "tipo": "acumulado", "unidade": "h", "categoria": "AVAC"},
    {"nome": "Nivelamento da cabina", "tipo": "gama", "unidade": "mm", "min": -10, "max": 10, "categoria": "ELEV"},
    {"nome": "Alarme da cabina", "tipo": "escolha", "categoria": "ELEV", "opcoes": [
      {"nome": "Toca"},
      {"nome": "Não toca", "mau": true, "corretiva": true}
    ]},
    {"nome": "Temperatura do quadro", "tipo": "gama", "unidade": "°C", "max": 45, "categoria": "QE"},
    {"nome": "Autonomia da luminária", "tipo": "gama", "unidade": "min", "min": 60, "categoria": "ILUM"}
  ],
  "checklists": [
    {"codigo": "CHK-EXT-TRI", "nome": "Inspeção trimestral de extintor", "tarefas": [
      {"nome": "Acesso desobstruído e sinalização visível", "tipo": "inspecao"},
      {"nome": "Manómetro na zona verde", "tipo": "inspecao", "medicoes": ["Pressão do extintor"]},
      {"nome": "Selo e cavilha", "tipo": "inspecao", "medicoes": ["Estado do selo"]},
      {"nome": "Data de validade e da última recarga", "tipo": "inspecao", "medicoes": ["Validade do extintor"]},
      {"nome": "Mangueira e difusor sem fissuras", "tipo": "inspecao"},
      {"nome": "Limpeza do aparelho", "tipo": "limpeza", "obrigatoria": false}
    ]},
    {"codigo": "CHK-AVAC-SEM", "nome": "Manutenção semestral de AVAC", "tarefas": [
      {"nome": "Estado dos filtros", "tipo": "inspecao", "medicoes": ["Estado dos filtros"]},
      {"nome": "Substituição de filtros", "tipo": "substituicao", "obrigatoria": false},
      {"nome": "Limpeza da unidade de condensação", "tipo": "limpeza"},
      {"nome": "Temperatura de insuflação", "tipo": "inspecao", "medicoes": ["Temperatura de insuflação"]},
      {"nome": "Contador de horas", "tipo": "inspecao", "medicoes": ["Horas de funcionamento"]},
      {"nome": "Verificação de fugas de refrigerante", "tipo": "inspecao"},
      {"nome": "Limpeza do tabuleiro de condensados", "tipo": "limpeza"}
    ]},
    {"codigo": "CHK-ELEV-MEN", "nome": "Inspeção mensal de elevador", "tarefas": [
      {"nome": "Portas abrem e fecham sem esforço", "tipo": "inspecao"},
      {"nome": "Nivelamento aos pisos", "tipo": "inspecao", "medicoes": ["Nivelamento da cabina"]},
      {"nome": "Alarme e intercomunicador", "tipo": "inspecao", "medicoes": ["Alarme da cabina"]},
      {"nome": "Iluminação da cabina e de emergência", "tipo": "inspecao"},
      {"nome": "Limpeza da casa das máquinas", "tipo": "limpeza"}
    ]},
    {"codigo": "CHK-QE-SEM", "nome": "Inspeção semestral de quadro elétrico", "tarefas": [
      {"nome": "Aperto de ligações", "tipo": "proacao"},
      {"nome": "Temperatura por termografia", "tipo": "inspecao", "medicoes": ["Temperatura do quadro"]},
      {"nome": "Teste de diferenciais", "tipo": "inspecao"},
      {"nome": "Identificação dos circuitos legível", "tipo": "inspecao"},
      {"nome": "Limpeza interior", "tipo": "limpeza"}
    ]},
    {"codigo": "CHK-ILUM-ANU", "nome": "Ensaio anual de iluminação de emergência", "tarefas": [
      {"nome": "Ensaio de autonomia", "tipo": "inspecao", "medicoes": ["Autonomia da luminária"]},
      {"nome": "Sinalização de saída visível", "tipo": "inspecao"},
      {"nome": "Substituição de baterias", "tipo": "substituicao", "obrigatoria": false}
    ]}
  ]
}'::jsonb

WHEN 'obras' THEN '{
  "nome": "Obras e remodelações",
  "descricao": "Vistoria antes, receção no fim. Para quem entra numa casa e tem de provar o estado em que a encontrou.",
  "categorias": [
    {"codigo": "CANA", "nome": "Canalização"},
    {"codigo": "ELET", "nome": "Eletricidade"},
    {"codigo": "CARP", "nome": "Carpintaria"},
    {"codigo": "PINT", "nome": "Pinturas"},
    {"codigo": "ALVE", "nome": "Alvenarias"}
  ],
  "medicoes": [
    {"nome": "Estado à chegada", "tipo": "escolha", "opcoes": [
      {"nome": "Sem danos"},
      {"nome": "Com danos pré-existentes", "mau": true}
    ]},
    {"nome": "Ensaio de estanquidade", "tipo": "escolha", "categoria": "CANA", "opcoes": [
      {"nome": "Sem fugas"},
      {"nome": "Com fuga", "mau": true, "corretiva": true}
    ]},
    {"nome": "Observações do cliente", "tipo": "texto"}
  ],
  "checklists": [
    {"codigo": "CHK-OBRA-INI", "nome": "Vistoria inicial", "tarefas": [
      {"nome": "Fotografar o estado à chegada", "tipo": "inspecao", "foto": true, "medicoes": ["Estado à chegada"]},
      {"nome": "Confirmar acessos e horários com o cliente", "tipo": "inspecao"},
      {"nome": "Proteger pavimentos e mobiliário", "tipo": "proacao"},
      {"nome": "Localizar cortes de água e eletricidade", "tipo": "inspecao"}
    ]},
    {"codigo": "CHK-OBRA-FIM", "nome": "Receção de obra", "tarefas": [
      {"nome": "Ensaios de estanquidade", "tipo": "inspecao", "medicoes": ["Ensaio de estanquidade"]},
      {"nome": "Remates e acabamentos", "tipo": "inspecao"},
      {"nome": "Limpeza final", "tipo": "limpeza"},
      {"nome": "Fotografar o resultado", "tipo": "inspecao", "foto": true},
      {"nome": "Entrega de chaves e manuais", "tipo": "inspecao"},
      {"nome": "Observações do cliente", "tipo": "inspecao", "obrigatoria": false, "medicoes": ["Observações do cliente"]}
    ]}
  ]
}'::jsonb

WHEN 'limpeza' THEN '{
  "nome": "Limpeza",
  "descricao": "Áreas comuns e instalações sanitárias, com o registo que um condomínio pede.",
  "categorias": [
    {"codigo": "AREA", "nome": "Áreas comuns"},
    {"codigo": "WC", "nome": "Instalações sanitárias"},
    {"codigo": "EXTR", "nome": "Espaços exteriores"}
  ],
  "medicoes": [
    {"nome": "Nível de consumíveis", "tipo": "escolha", "categoria": "WC", "opcoes": [
      {"nome": "Reposto"},
      {"nome": "Em falta", "mau": true, "corretiva": true}
    ]},
    {"nome": "Estado geral", "tipo": "escolha", "opcoes": [
      {"nome": "Bom"},
      {"nome": "Aceitável"},
      {"nome": "Mau", "mau": true, "corretiva": true}
    ]}
  ],
  "checklists": [
    {"codigo": "CHK-LIMP-DIA", "nome": "Limpeza diária de áreas comuns", "tarefas": [
      {"nome": "Aspirar e lavar pavimentos", "tipo": "limpeza"},
      {"nome": "Limpeza de vidros e espelhos", "tipo": "limpeza"},
      {"nome": "Despejo de papeleiras", "tipo": "limpeza"},
      {"nome": "Estado geral no fim", "tipo": "inspecao", "medicoes": ["Estado geral"]}
    ]},
    {"codigo": "CHK-LIMP-WC", "nome": "Limpeza de instalações sanitárias", "tarefas": [
      {"nome": "Desinfeção de sanitas e lavatórios", "tipo": "limpeza"},
      {"nome": "Lavagem de pavimentos e azulejos", "tipo": "limpeza"},
      {"nome": "Reposição de consumíveis", "tipo": "substituicao", "medicoes": ["Nível de consumíveis"]},
      {"nome": "Verificação de fugas e entupimentos", "tipo": "inspecao"}
    ]}
  ]
}'::jsonb

ELSE NULL END
$fn$;

GRANT EXECUTE ON FUNCTION public.ops_pack_conteudo(text) TO authenticated, service_role;


-- ============================================================
-- 2. A lista, para o ecrã poder oferecer
-- ============================================================

CREATE OR REPLACE FUNCTION public.rpc_ops_packs()
RETURNS TABLE (pack text, nome text, descricao text, categorias int, medicoes int, checklists int)
LANGUAGE sql STABLE
AS $fn$
SELECT p,
       c->>'nome',
       c->>'descricao',
       jsonb_array_length(c->'categorias'),
       jsonb_array_length(c->'medicoes'),
       jsonb_array_length(c->'checklists')
  FROM unnest(ARRAY['manutencao', 'obras', 'limpeza']) AS p,
       LATERAL public.ops_pack_conteudo(p) AS c
$fn$;

REVOKE ALL ON FUNCTION public.rpc_ops_packs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_packs() TO authenticated, service_role;


-- ============================================================
-- 3. Instalar
-- ============================================================
-- Devolve o que criou e o que saltou. O que saltou é a parte que interessa
-- quando se corre pela segunda vez: sem esse número, "instalado" não distingue
-- "criei tudo" de "já cá estava tudo".

CREATE OR REPLACE FUNCTION public.rpc_ops_instalar_pack(_org_id uuid, _pack text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_user   uuid := public.current_business_user_id();
  v_c      jsonb := public.ops_pack_conteudo(_pack);
  v_item   jsonb;
  v_tarefa jsonb;
  v_opcao  jsonb;
  v_med    text;

  v_cat_id  uuid;
  v_def_id  uuid;
  v_chk_id  uuid;
  v_tar_id  uuid;

  v_criadas  jsonb := jsonb_build_object('categorias', 0, 'medicoes', 0, 'checklists', 0);
  v_saltadas jsonb := jsonb_build_object('categorias', 0, 'medicoes', 0, 'checklists', 0);
  v_pos      integer;

BEGIN
  IF v_c IS NULL THEN
    RAISE EXCEPTION 'Não existe nenhum pack chamado "%".', _pack;
  END IF;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ops_utilizador_perfil up
     WHERE up.utilizador_id = v_user AND up.organization_id = _org_id AND up.ativo
       AND up.funcao IN ('admin', 'gestor')
  ) AND NOT public.is_system_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Só quem coordena instala um pack de configuração.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── Categorias ────────────────────────────────────────────────────────
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_c->'categorias') LOOP
    SELECT id INTO v_cat_id FROM public.ops_categoria_ativo
     WHERE organization_id = _org_id AND codigo = v_item->>'codigo';

    IF v_cat_id IS NULL THEN
      INSERT INTO public.ops_categoria_ativo (organization_id, codigo, nome)
      VALUES (_org_id, v_item->>'codigo', v_item->>'nome');
      v_criadas := jsonb_set(v_criadas, '{categorias}',
                             to_jsonb((v_criadas->>'categorias')::int + 1));
    ELSE
      v_saltadas := jsonb_set(v_saltadas, '{categorias}',
                              to_jsonb((v_saltadas->>'categorias')::int + 1));
    END IF;
  END LOOP;

  -- ── Medições ──────────────────────────────────────────────────────────
  -- Sem constraint única em (organização, nome): a verificação é explícita.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_c->'medicoes') LOOP
    SELECT id INTO v_def_id FROM public.ops_medicao_def
     WHERE organization_id = _org_id AND nome = v_item->>'nome';

    IF v_def_id IS NOT NULL THEN
      v_saltadas := jsonb_set(v_saltadas, '{medicoes}',
                              to_jsonb((v_saltadas->>'medicoes')::int + 1));
      CONTINUE;
    END IF;

    SELECT id INTO v_cat_id FROM public.ops_categoria_ativo
     WHERE organization_id = _org_id AND codigo = v_item->>'categoria';

    INSERT INTO public.ops_medicao_def
      (organization_id, categoria_ativo_id, nome, tipo, unidade, limite_min, limite_max)
    VALUES
      (_org_id, v_cat_id, v_item->>'nome', v_item->>'tipo', v_item->>'unidade',
       (v_item->>'min')::numeric, (v_item->>'max')::numeric)
    RETURNING id INTO v_def_id;

    v_pos := 0;
    FOR v_opcao IN SELECT * FROM jsonb_array_elements(COALESCE(v_item->'opcoes', '[]'::jsonb)) LOOP
      INSERT INTO public.ops_medicao_opcao
        (medicao_def_id, nome, posicao, e_nao_conforme, cria_corretiva)
      VALUES
        (v_def_id, v_opcao->>'nome', v_pos,
         COALESCE((v_opcao->>'mau')::boolean, false),
         COALESCE((v_opcao->>'corretiva')::boolean, false))
      ON CONFLICT (medicao_def_id, nome) DO NOTHING;
      v_pos := v_pos + 1;
    END LOOP;

    v_criadas := jsonb_set(v_criadas, '{medicoes}',
                           to_jsonb((v_criadas->>'medicoes')::int + 1));
  END LOOP;

  -- ── Checklists ────────────────────────────────────────────────────────
  -- Nascem publicadas. Um pack que chega em rascunho obriga a mais um passo
  -- antes de servir para alguma coisa, e o ponto é poder abrir a primeira
  -- ordem no mesmo dia. Editar depois cria a versão 2, como sempre.
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_c->'checklists') LOOP
    IF EXISTS (
      SELECT 1 FROM public.ops_checklist
       WHERE organization_id = _org_id AND codigo = v_item->>'codigo'
    ) THEN
      v_saltadas := jsonb_set(v_saltadas, '{checklists}',
                              to_jsonb((v_saltadas->>'checklists')::int + 1));
      CONTINUE;
    END IF;

    INSERT INTO public.ops_checklist
      (organization_id, codigo, nome, versao, estado, publicada_em)
    VALUES
      (_org_id, v_item->>'codigo', v_item->>'nome', 1, 'publicada', now())
    RETURNING id INTO v_chk_id;

    v_pos := 0;
    FOR v_tarefa IN SELECT * FROM jsonb_array_elements(v_item->'tarefas') LOOP
      INSERT INTO public.ops_checklist_tarefa
        (checklist_id, posicao, nome, tipo, obrigatoria, foto_obrigatoria)
      VALUES
        (v_chk_id, v_pos, v_tarefa->>'nome', COALESCE(v_tarefa->>'tipo', 'inspecao'),
         COALESCE((v_tarefa->>'obrigatoria')::boolean, true),
         COALESCE((v_tarefa->>'foto')::boolean, false))
      RETURNING id INTO v_tar_id;

      FOREACH v_med IN ARRAY
        COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_tarefa->'medicoes')),
          ARRAY[]::text[])
      LOOP
        SELECT id INTO v_def_id FROM public.ops_medicao_def
         WHERE organization_id = _org_id AND nome = v_med;

        IF v_def_id IS NOT NULL THEN
          INSERT INTO public.ops_checklist_tarefa_medicao (checklist_tarefa_id, medicao_def_id)
          VALUES (v_tar_id, v_def_id)
          ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;

      v_pos := v_pos + 1;
    END LOOP;

    v_criadas := jsonb_set(v_criadas, '{checklists}',
                           to_jsonb((v_criadas->>'checklists')::int + 1));
  END LOOP;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (_org_id, 'configuracao', _org_id, 'pack_instalado',
     'Pack "' || (v_c->>'nome') || '" instalado', v_user, NULL,
     jsonb_build_object('pack', _pack, 'criadas', v_criadas, 'saltadas', v_saltadas));

  RETURN jsonb_build_object(
    'ok', true, 'pack', _pack, 'nome', v_c->>'nome',
    'criadas', v_criadas, 'saltadas', v_saltadas
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.rpc_ops_instalar_pack(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_ops_instalar_pack(uuid, text) TO authenticated, service_role;

COMMIT;
