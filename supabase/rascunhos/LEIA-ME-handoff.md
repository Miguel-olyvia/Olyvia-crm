# Handoff — Olyvia CRM de RH — atualizado a 26 de Outubro de 2026 (15h)

**Este ficheiro é autossuficiente.** O `vault` (documentação fora do GitHub) **não viaja** para o outro PC; só este ficheiro e o **git**. Tudo o que é código, migrations por aplicar e testes SQL está num ramo do git (ver §1). O que só existia no `vault` está resumido aqui (§9). Para quem pegar nisto sem contexto: diz **o que estamos a fazer, onde está cada coisa e o que falta**. Datas e números são de 26/10; o que não foi reverificado diz-se.

---

## 1. Retomar noutro PC — fazer isto primeiro

**Pré-requisitos:** Git com o alias SSH `github-olyvia` (repos `git@github-olyvia:Miguel-olyvia/Olyvia-crm.git` e `git@github-olyvia:Miguel-olyvia/Olyvia2.0.git`), Node 24, `npm i`, **Supabase CLI** (≥ 2.116) com `supabase login` numa conta que vê os projetos **RH `uetjghdkwbywbftedtth`** e **Olyvia 2.0 `dconylgnqyywjdetytvv`**. **Sem Docker** (a regra do utilizador: nunca arrancar base local nem Docker; há pouca RAM).

**Passos:**
1. `git fetch origin` e criar um **worktree** do ramo WIP (nunca trabalhar na pasta principal do repo: está ligada à base **principal/Mudelar**): `git worktree add <pasta> -b wip/rh-pessoas-fase8 origin/wip/rh-pessoas-fase8`. Dentro desse worktree: `supabase link --project-ref uetjghdkwbywbftedtth`. **Confirmar** que `supabase/.temp/project-ref` diz `uetjgh…` antes de qualquer comando à base.
2. Confirmar o estado da base: `supabase migration list --linked` → a última aplicada deve ser **`20261231200000`** e **nada pendente**. Se houver mais, alguém aplicou depois deste handoff.
3. Ler o §4 (fila) e o §3 (decisões por tomar). **As migrations 300000 e 400000 estão em `supabase/rascunhos/` do ramo WIP, NÃO em `supabase/migrations/`** (a CLI só lê `migrations/`; é de propósito: um `db push` aplicaria tudo o que lá estiver).
4. A CLI deste PC pode não ter o `CLAUDE.md` do workspace com as regras do utilizador: as essenciais estão no §8.

**Ramos (repo `Olyvia-crm`), ambos enviados:**
- `feature/rh-pessoas` — HEAD `94123e74`. É o que o Vercel de teste (`olyvia-crm-env-testarh-bmgest.vercel.app`, protegido por login Vercel) publica. **Estável**: tem tudo até «Nova lead» com negócio.
- **`wip/rh-pessoas-fase8`** — filho do anterior; o trabalho das fases 7 e 8 (60 ficheiros) **mais** `supabase/rascunhos/` (2 migrations por aplicar e 3 testes SQL) e uma cópia deste handoff em `supabase/rascunhos/LEIA-ME-handoff.md`. **Por testar em conjunto e por aplicar.** Quando a fila do §4 estiver feita, fundir em `feature/rh-pessoas`. **Nada vai para o `main`** e a Mudelar nunca é afetada.
- Olyvia 2.0 é **outro repo** (§6), tudo já em `master`.

---

## 2. A frente principal: CRM de RH (Pessoas, Pipeline, formulário)

**Base e org.** Base **RH** `uetjghdkwbywbftedtth`; só existe a org **nike** (`b6ffce4f-f630-4933-833a-008649757a33`). Escritas de teste só aí. A base principal (`tzbfgw…`) e a Mudelar **nunca** se tocam nem se consultam.

**O modelo decidido pelo utilizador**
- **Entidade única** (`anew_entities`; lead = `client_since` vazio). **Negócio desde o início:** cada lead é uma pessoa **com** um negócio (título = nome da pessoa); o Pipeline só mostra negócios. É como a Olyvia 2.0 faz (lido em `motor.ts`: `novoDeal` com `fase: 0`, «Por contactar»); lá, falhar o contacto é «marcar como perdido».
- **Formulário online:** a submissão **entra sempre** e vai para a fila; pessoa nova nasce com negócio; pessoa conhecida fica na fila (ligar, criar negócio, ignorar). Sem 409 «já existe», sem devolver o id da pessoa (código feito na fase 8, **por provar**).
- **«Nova lead»** cria pessoa **e** negócio (feito, enviado) e abre a ficha em `?open=<pessoa>&negocio=<negócio>`. A `neg_criar_negocio` é idempotente no `p_id` (`ON CONFLICT`).
- **Chamadas, visitas e levantamentos ligam-se à pessoa e ao negócio** (colunas `entity_id` e `negocio_id` em `entity_interactions`, `schedule_items`, `levantamentos`, com FK). Auditado no código a 26/10: todos os caminhos do Pipeline real gravam `negocio_id`; alterar/cancelar/dar resultado a uma visita mantém a ligação. O levantamento é **um por negócio** (a base recusa um segundo, NG013).
- **Ficha:** a página de **Pessoas** abre a ficha **completa** num painel lateral (`FichaReal` sem `comGuia`); o **Pipeline** abre o **ecrã guiado** dentro da página (`comGuia`). «Por contactar» usa o guia de sempre («Registar a chamada»); **Contactado** (5 passos: Chamada, Qualificação, Morada da obra, Preparar a visita, Marcar a visita) e **Visita** (Visitas com «Marcar outra visita» + uma secção por levantamento configurável + «Fechar levantamento») usam o **assistente** (`src/components/pessoas/assistente/`). A fase do negócio no ecrã deriva do que tem ligado (levantamento > visita marcada > chamada > nada), a mesma regra da coluna do quadro.
- **Fora, por decisão:** necessidades (serviços e produtos), fotografias, o diálogo «Mais sobre a pessoa» no Pipeline.

**Aplicado na base RH (lido na base a 26/10).** Migrations até `20261231200000`: entidade única, RPCs e RGPD, formulário só entidade, permissões de fornecedores, **`20261231100000`** (Qualificação por negócio, `pedido_cliente`, `morada_origem`, `organization_kind`/Condomínio, `neg_guardar_qualificacao`, `neg_guardar_contacto_pessoa`, questionário semeado na nike: **8 secções, 36 perguntas, 109 opções**) e **`20261231200000`** (negócio desde o início: `fn_form_criar_entidade` devolve `negocio_id`, `rpc_resolve_form_submission` reescrita com `p_confirmar_negocio_aberto`, `neg_resumo_quadro` só com negócios, `neg_guardar_origem_pessoa`, CHECK da resolução com 6 valores). **A nike tem 3 negócios abertos** (criados em teste: Miguel tester, Inês Lourenço, Sérgio Matos) e **0 submissões**. As outras «pessoas» da lista (Paulo, Diogo, Marta…) são fichas de utilizadores de teste, **não** leads. A RH já tem **76 Edge Functions publicadas, versões antigas** (ex.: `create-lead` v161, `book-slot` v197).

**NÃO aplicado — rascunhos em `supabase/rascunhos/` (ramo WIP):**
- `RASCUNHO-20261231300000_nif_e_dono_da_pessoa.sql`: RPC `neg_guardar_nif_pessoa` (hash e cifra vêm do `nif-write-proxy`, que tem as chaves) e gatilho que atribui a pessoa ao dono do negócio. Corrigido na fase 8 (só atribui com âmbito `edit` e `leads.assign` se o responsável não for quem escreve; nunca falha ao criar o negócio; NG031 genérico fora do âmbito).
- `RASCUNHO-20261231400000_etapa_pela_fase_do_negocio.sql`: a **etapa da pessoa** (lista de Pessoas) passa a ser a fase do **primeiro negócio aberto** (nada ligado = Por contactar; chamada = Contactada; visita = Com visita; levantamento/orçamento = Negócio) e `neg_ficha_pessoa` devolve `nif_ultimos3`. É caminho quente da lista: **medir** na nike (só há 3 negócios). `authenticated` não lê `nif_hash`, por isso `tem_nif` usa o helper `fn_neg_pessoa_tem_nif`.
- Testes SQL revertidos (escritos, **nunca corridos**): `TESTE-teste-nif-e-dono.sql`, `TESTE-teste-etapa.sql`, `TESTE-teste-negocio-inicio.sql`. **O `supabase db query --file` pode não correr tudo numa só transação**: não os correr sem confirmar, ou a migration aplica-se a meio. Tudo o que se aplicou até hoje foi com guardas e conferência atómicas, sem esse teste. `TESTE-teste-etapa.sql` tem um erro conhecido (H1): usa `anew_users.id` como `sub` do JWT; tem de ser `auth_user_id`.

**Código das fases 7 e 8 (commit `e3a818f1`, só no ramo WIP).** NIF sempre visível no cartão «Cliente» («Por preencher» se vazio) e grupo «Quem pede» (tipo de cliente + NIF) no passo Chamada; `nif-write-proxy` com a RPC nova e redação do NIF; `create-lead` sem 409 e `insert-lead` sem `entity_id`; fila a ler o conflito de reserva (`_meta.dedup.conflito`); `book-slot` com RETRY e `captureError`; «Fechar levantamento» honesto («Nada novo para guardar»); chamada sem negócio aberto avisa; **limpeza do Pipeline** (sai «Sem orçamento escolhido», «Valor», «Comercial», «Fecha no contrato», «Fechar agora»; «Perder negócio» → «Marcar como perdido»); etapa e «Próximo passo» na lista de Pessoas (o frontend só mostra: a etapa vem da migration 400000); `vercel.json` com **geolocalização aberta só no bloco da app** (`geolocation=(self)` + `nominatim.openstreetmap.org` no `connect-src`; faz funcionar «Estou no local»; só afeta este ramo); `vitest.config.ts` com 2 aliases (`npm:zod` e o URL `esm.sh` do supabase-js) para testar `create-lead` e `insert-lead`.

**Nada disto foi visto no browser.** Só testes (jsdom) e leituras da base. O que o utilizador viu e reportou: o assistente antigo (corrigido), «registar a chamada» a saltar para «Negócio · Orçamento» (corrigido em `4b5b7985`: `FichaInterior` chamava sempre `negocio.esquecer()`; teste vermelho→verde), e que o Pipeline devia ter negócio (corrigido por `94123e74` e pela migration 200000).

---

## 3. Decisões do utilizador

**Tomadas (26/10)**

| # | Assunto | Decisão |
|---|---|---|
| 1 | «Estou no local» | **Abrir** (feito no WIP) |
| 2 | NIF em «Quem pede» | **Sim**, e **sempre visível** no cartão («Por preencher» se vazio) |
| 3 | Condomínio volta a Empresa? | **Não**; fica o que foi escolhido |
| 4 | Apagar pessoa limpa pedido/respostas? | **Não** (é soft delete) |
| 5 | Formulário online | **Aceita sempre**, entra na fila; sem avisos de duplicado |
| 6 | Atribuir a pessoa ao atribuir o negócio | **Sim** (migration 300000) |
| 7 | «Visita fica feita sozinha» | **Manual** |
| 8 | Funções do formulário na RH | **Publicar tudo** |
| 9 | Apagar a admissão de teste do Rafael (Olyvia 2.0, org Olyvia Demo) | **Não** |
| — | Pipeline vs pessoa | Fica **negócio desde o início**; «Marcar como perdido» |
| — | Etapa na lista de Pessoas | Pela fase do **primeiro** negócio |
| — | Morada da obra | O utilizador disse «sim» a gravar **logo no passo** — mas a base **não deixa** (ver abaixo) |

**POR TOMAR (bloqueiam trabalho)**
- **(a) Morada da obra no passo.** `neg_guardar_levantamento` não deixa **alterar** um levantamento já ligado ao negócio (devolve `mudou:false` sem escrever; um trigger «congela-o»). Gravar a morada cedo seria um **no-op silencioso**, e ligar o levantamento cedo faz o negócio passar a **Levantamento** (desmonta o assistente de Contacto). Opções: **(i)** migration que deixe alterar o levantamento enquanto o negócio está aberto; **(ii)** manter a morada em rascunho (sessionStorage) até «Fechar levantamento» — é o que está hoje; **(iii)** *recomendada*: guardar a morada **no próprio negócio** (colunas novas em `negocios` + RPC) e copiá-la para o levantamento ao fechar (o utilizador disse que a morada da obra é do negócio). Migration e código entram juntos.
- **(b) Ganho do negócio no Pipeline.** Tirou-se o «Fechar agora». O ganho é **automático** (contrato assinado)? Se não for, um negócio «pronto a ganhar» fica preso.

**Riscos conhecidos aceites:** `SKIP LOCKED` do gatilho pode perder uma atribuição sem retentativa; `authenticated` mantém `GRANT UPDATE` por coluna em `nif_hash`/`nif_encrypted`/`nif_last3` (contorna a RPC → migration própria para revogar); o NIF continua a ser um oráculo de existência (NG031 distingue «gravado» de «recusado»; ~10^8 NIFs; **o proxy não tem limite de tentativas** → recomendado limite por utilizador e registo de segurança sem o NIF); a RPC está concedida a `authenticated` (chamada direta grava hash arbitrário).

**Por responder do trabalho de RH/recrutamento (de 24/10):** custo anual do RH ÷12 ou ÷14? Salário da oferta de recrutamento: próprio ou do cargo? Primeiro pagamento validado dispara o arranque da obra? Valores por omissão do recrutamento (aprovação para abrir vagas; conservação 6 meses sem consentimento e 2 anos com; triagem cega desligada; candidaturas espontâneas aceites; perguntas eliminatórias só assinalam)?

---

## 4. Fila, por ordem (o que falta)

1. **Decidir (a) e (b)** do §3. Depois corrigir: `TESTE-teste-etapa.sql` (H1 + casos M1/M2: ramo verdadeiro de `fn_neg_pessoa_tem_nif`; `created_at` vs `id` no desempate); 3 MEDIUM da interface (limpar o alerta «Abra primeiro o negócio.» quando o negócio abre; região `status` sempre montada para «Nada novo para guardar»; ligar o erro do NIF ao campo por `aria-describedby`); `redactNif` a redigir também a forma sem separadores; o `proxy` a não calcular `p_nif_tokens` para esta RPC; o teste antigo `nif-write-proxy/index.test.ts` («NIF em branco após trim ⇒ 400») contradiz o handler novo (Deno nunca correu).
2. **Bateria de testes** (um conjunto de cada vez, `npx vitest run <pasta> --maxWorkers=2`; **confirmar que não há outro vitest a correr**): `src/components/pessoas-lista`, `src/components/pessoas`, `src/components/pessoas-processo`, `src/components/negocio-metas`, `src/translations`, `src/pages`, `src/hooks/pessoas`, `supabase/functions`. Última medida (em `feature/rh-pessoas`): 592, 3280, 138, 922, 190, e 771 verdes. **5 testes falham desde antes** (não são do trabalho): `useContactosPessoas` e `useNomesResponsaveis` («noutra organização»), `AusenciasOrganizacao.ano`, `ObraV2Equipamentos`, `OperacoesV2` — provado num checkout limpo. **Nunca `tsc`, `eslint` nem `vite build`** (regra do utilizador).
3. **Chaves de servidor na RH:** `NIF_HMAC_KEY` e `NIF_ENC_KEY` **não existem** (só `APP_BASE_URL`, `PORTAL_OTP_PEPPER` e os `SUPABASE_*`). Criar com 32 bytes aleatórios em base64, **diferentes entre si**, definidos pela CLI (`supabase secrets set … --project-ref uetjghdkwbywbftedtth`) sem mostrar nem guardar o valor; `supabase secrets list` mostra só digestos. Sem `NIF_HMAC_KEY`, `create-lead` e `insert-lead` respondem 503 a todos (de propósito, falha em fechado).
4. **Aplicar as migrations 300000 e 400000**: `migration list --linked` (nada pendente), copiar de `supabase/rascunhos/` para `supabase/migrations/`, listar de novo (**exatamente essas**), `supabase.cmd db push --linked --yes` **do worktree ligado à RH**, verificar na base (assinaturas únicas, ACL, CHECK, gatilho), comitar. Medir `neg_resumo_pessoas` na nike.
5. **Publicar as Edge Functions do formulário na RH** (autorizado a 26/10): as alteradas neste ramo (`create-lead`, `insert-lead`, `update-lead`, `book-slot`, `nif-write-proxy` e as que dependam das `_shared` alteradas). `supabase.cmd functions deploy <nome> --project-ref uetjghdkwbywbftedtth --use-api` (**sem Docker**); depois `supabase functions list` para ver a versão nova.
6. **Fundir** o WIP em `feature/rh-pessoas`, enviar e **ver ao vivo na nike** (nada foi visto): «Nova lead» → cartão em «Por contactar» → registar chamada → fica em «Contactado» → assistente → visita → levantamento; lista de Pessoas com a etapa certa; formulário online (com a chave criada); fila; NIF.
7. Atualizar o registo de trabalho (formato RESOLVIDO / POR FAZER / POR DECIDIR) e dar o aviso de conclusão, se o outro PC tiver `task-done.ps1`.

---

## 5. Mapa do código (CRM de RH)

- **Assistente de passos:** `src/components/pessoas/assistente/` — `AssistenteDoGuia.tsx` (coluna de passos, «Passo N de M», rodapé), `ContactoDoGuia.tsx` + `PassosContacto.tsx` (5 passos), `VisitaDoGuia.tsx` + `PassosVisita.tsx`, `GrupoQuemPede.tsx` + `quemPedeFormulario.ts` (tipo de cliente + NIF), `modeloAssistente.ts` (passos, «faltam X»), `useAssistente.ts`, `useRascunhoAssistente.ts` + `rascunhoAssistente.ts` (rascunho em sessionStorage por negócio).
- **Guia e ficha:** `src/components/pessoas/` — `GuiaDoNegocio.tsx`, `GuiaDaPessoa.tsx`, `GuiaDoPasso.tsx` (3 colunas: passos | passo | cliente), `GuiaPecas.tsx` (barra de fases, cartão do cliente), `guiaDados.ts` (`clienteDoGuia`), `processo/abordagemDoNegocio.ts` (fase derivada), `FichaInterior.tsx`, `DetalheNegocioFicha.tsx`, `FormChamada.tsx`, `MarcarVisitaReal.tsx`.
- **Páginas e quadro:** `src/components/pessoas-lista/` — `FichaReal.tsx` (prop `comGuia`: Pipeline = guia na página; sem ela = painel lateral completo), `PipelineReal.tsx`, `PessoasReal.tsx`, `QuadroReal.tsx`, `usePessoaAberta.ts` (`?open=&negocio=`). Nova lead: `src/components/pessoas-leads/NovaLeadReal.tsx` e `src/hooks/pessoas/novaLead/` (`gravarNovaLead.ts`, `criarNegocioNovaLead.ts`, `atualizarPessoaExistente.ts`, `useNovaLead.ts`).
- **Dados:** `src/hooks/pessoas/` — `adaptarCartaoQuadro.ts` (só negócios), `useAcoesFichaReal.ts` (chamada/visita com `p_negocio_id`), `useGuardarQualificacao.ts`, `useGuardarNifPessoa.ts`, `useGuardarContactoPessoa.ts`, `adaptarFichaPessoa.ts`, `chamarNeg.ts` (chamada às RPCs `neg_*`). Fila de submissões: `src/pages/PendingFormSubmissions.tsx`. Traduções: `src/translations/pessoas*.ts`.
- **Edge Functions (formulário):** `supabase/functions/` — `create-lead`, `insert-lead`, `update-lead`, `book-slot` (+ `pessoa.ts`), `nif-write-proxy` (lista fechada `ALLOWED_RPCS`), `_shared/formCaptacao.ts`, `_shared/captacaoPublica.ts` (limites, HMAC da impressão digital, honeypot).
- **Base:** RPCs `neg_*` (contrato do frontend: **migração e código entram juntos**), `neg_ficha_pessoa`, `neg_resumo_pessoas`, `neg_resumo_quadro`, `neg_criar_negocio` (11 parâmetros), `neg_guardar_levantamento`, `neg_guardar_visita`, `neg_registar_contacto`.

---

## 6. Olyvia 2.0 (repo `Miguel-olyvia/Olyvia2.0`, branch `master`, base `dconylgnqyywjdetytvv`)

Outro projeto, **não** o CRM de RH (é o protótipo ligado a uma base; deploy `olyvia2.vercel.app`, com `version.json` público). Em `master`, de hoje: `fbaea79`, `09f371b`, `cf2f45f` (reenvio do convite de admissão: deixou de dar `transicao_invalida`, mostra o motivo, erro traduzido), `4ae0a30` (a `admissao-rh` usa a **organização que o RH tem aberta** e não a 1.ª adesão da conta: a conta `olyvia2` tem 3 organizações, a 1.ª é «Olyvia Demo» sem SMTP; o SMTP está na «Mudelar») e `523c315` (o reenvio segue para o email escrito no diálogo). **`admissao-rh` publicada na versão 3** (`supabase functions deploy admissao-rh --project-ref dconylgnqyywjdetytvv --use-api`). Confirmado pelo utilizador: o reenvio funciona. Por saber: as outras funções (`portal-colaborador`, `criar-utilizador`) podem ter o mesmo defeito da 1.ª adesão; o teste `fonteRealRh.test.ts` pode precisar de ajuste; o email do convite do Rafael tinha uma letra trocada (`bmalr` em vez de `bmlar`); a admissão antiga do Rafael na «Olyvia Demo» fica (decisão 9).

---

## 7. Regras e armadilhas (o `CLAUDE.md` do workspace tem tudo; isto é o que mais custou)

- **`db push` aplica TUDO o que estiver pendente.** Listar antes (`migration list --linked`); nunca deixar rascunhos na pasta das migrations. Nunca SQL avulso de escrita ao remoto; nunca `migration repair`; nunca `supabase start`/`db reset`/`db diff`/Docker.
- **Os comandos à base correm sempre a partir do worktree do ramo, nunca da pasta principal** (a principal está ligada à base de produção). Confirmar `supabase/.temp/project-ref` antes da 1.ª consulta. Consultas só `SELECT` de catálogo e contagens, sem ler dados pessoais.
- Mudelar: nunca tocar. Escritas de teste só na nike. Credenciais coladas no chat nunca vão para ficheiros; `supabase secrets list` mostra digestos, nunca valores.
- **Ficheiros CRLF:** Edit/Write ou Python binário (`python -I`); nunca `sed -i`. Num `Edit` barrado pelo GateGuard pode ficar uma sequência **a meio**: repetir o 1.º e confirmar por `grep`.
- Um `vitest` de cada vez; **confirmar que não há outro a correr** (workflows em paralelo dão falhas falsas). Nunca `git stash`. Comitar só os ficheiros do trabalho (há agentes a escrever no mesmo worktree). Nunca `git push` para `main`.
- Bash com heredoc/aspas falha («unexpected EOF»): usar PowerShell, ou escrever o script com Write e correr com `python -I`.
- Publicar o frontend **antes** da migration deixa o Pipeline vazio (o quadro só lê negócios). O endereço de teste do CRM está protegido pelo Vercel: não se vê a versão por fora.
- Trabalho em equipa de agentes (Workflow, segundo plano, agentes ECC por especialidade, revisão independente, modelo escolhido por camada); quem executa não se avalia a si próprio. O utilizador tem pouco uso por janela de 5 horas: **dizer o custo antes de lançar workflows grandes**.
- Quando o utilizador pede «tirar X», tira-se em todo o lado do Pipeline e diz-se o que saiu. Quando diz «faz como o protótipo» ou «como a página de Leads», é **ordem**, não opção.

## 8. Como o utilizador trabalha (para o próximo agente)

- Português informal, curto e direto; fica irritado com explicações longas, com suposições e com âmbito alargado. Quer **números medidos** e que **não se afirme o que não foi verificado** (diz-se «não vi no browser»). Responde às decisões **por número**; se não percebe, diz «não percebi»: explicar em simples e não decidir por ele.
- Pede «pergunta tudo» quando há dúvidas. Não gosta de ver apagado o que funcionava («substituis, não apagas»). Verifica o que lhe digo contra o ecrã: **confirmar antes de afirmar** (já aconteceu dar-lhe diagnósticos errados por não ver a versão publicada).
- Consulta capturas do protótipo (Olyvia 2.0) como critério: ver o código do protótipo antes de decidir (clone só de leitura: `git clone git@github-olyvia:Miguel-olyvia/Olyvia2.0.git`; `src/pages/prototipo-negocios/`: `motor.ts`, `PaginaNegocio.tsx`, `NegocioSimples.tsx`, `campos.ts`, `Visitas.tsx`).

---

## 9. Outras frentes (resumo de 24/10; vivem só no `vault` do PC antigo; **não reverificadas**)

1. **HTML de arquitetura da nova base, v2 por módulos** (`olyvia_arquitetura_nova_base_v2.html`): só a **lógica** de como cada coisa funciona e se liga; 9 módulos, 50 abas; nada de «hoje», «ainda não», código nem tabelas técnicas. Gera-se com `build_html_v2.py` a partir de `logica/final2_<modulo>.json`. Faltavam do menu do protótipo: Hoje e Definições (o utilizador **não** quer as listas Leads e Clientes).
2. **Estrutura da nova base** (`vault\ficheiros\crm\nova-base\ajustes\`, só para ver, **não são migrations**): parte da base atual e diz o que se ajusta; duas revisões deram 25 achados de base de dados (1 CRITICAL, 7 HIGH, 14 MEDIUM) e 15 de segurança (6 HIGH, 9 MEDIUM); a correção ficou a meio. Regra do utilizador: reaproveitar o que existe, tabela nova só com justificação escrita. Convenções: `organization_id` em todas as tabelas; RLS a testar ver/criar/editar/eliminar em separado; FKs declaradas; estados em CHECK; dados de RH fechados por coluna; vistas sem `SELECT *` e com `security_invoker`.
3. **Protótipo** (`/prototipo/negocios`): o erro do RH («Algo correu mal») era um `MemoryRouter` dentro do `BrowserRouter` (corrigido em `RhPagina.tsx`, commit `9924fd68` em `feat/negocios-prototipo`; reproduzido só em teste). Cópia do protótipo em `C:\my-crm-dream-main\prototipo-copia\` (1113 ficheiros, sem git).
4. **Olyvia 2.0 fase 1 da base (23/10):** 3 migrations aplicadas por `db query` (`formularios_campanhas`, `agenda_visitas`, `comunicacoes`), 33 tabelas, **por comitar e sem registo de migrations**; por fechar: confirmar os 3 HIGH de segurança, medir o modo mês, e decidir quem marca uma visita como feita. Rodar a chave `service_role` da base nova (foi colada no chat).
5. **Outras coisas por tratar:** worktree `negocios-bd` (ramo `feat/negocios-bd`) com 5 migrations antigas apagadas e 11 por comitar — **ver antes de qualquer `db push`**; migration `20261118030000` «POR APLICAR» com reversão ao lado (`20261118040000`); 15 ficheiros por comitar em `feat/negocios-prototipo` (intocáveis: «não descartes nada»); o registo de trabalho do utilizador (`vault\registo-trabalho.md`) tem o relatório de **26 de Outubro** feito, e os de 21 e 22 por fazer; `task-done.ps1` está bloqueado pela política do PowerShell (não contornar).
