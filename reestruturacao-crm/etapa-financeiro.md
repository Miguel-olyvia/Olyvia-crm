# Etapa Financeiro: faturas registadas, pagamentos validados e a obra que nasce do 1.º pagamento

> **Estado:** pronta e verificada localmente, **por aplicar em produção**.
> Ramo: `worktree-agent-a3271d4b1ec373475` (13/10/2026), a juntar no `feat/lote2-financeiro-custos`.
> Vem das decisões de 13/10/2026 (`docs/melhorias-v2-2026-10-13/README.md`, secção 3a, pontos 2 e 3).

---

## O que muda para quem usa

### Financeiro (CRM, menu "Financeiro", `/financeiro`)

A Olyvia **não emite faturas** (em Portugal isso exige software certificado pela AT).
A fatura é emitida no PHC, no Moloni, no Eticadata ou noutro programa. Aqui **regista-se**.

- **Por faturar:** uma linha por tranche de cada contrato assinado.
  - O plano de pagamento sai do texto das condições de pagamento do contrato
    ("50% na adjudicação, 50% na conclusão" dá 2 tranches). Se as percentagens não somarem 100, fica uma tranche "Única 100%".
  - Os cêntimos que sobram vão para a última tranche (10.000,01 € dá 5.000,00 € + 5.000,01 €).
  - "Registar" abre o formulário na própria linha: número, data, valor (vem preenchido), programa, ATCUD e PDF.
  - O programa usado fica lembrado para a próxima vez.
  - Na 1.ª fatura do contrato, o plano fica gravado. Se alguém mudar depois o texto das condições, o plano não muda.
- **Por validar pagamento:** as faturas registadas à espera do dinheiro.
  - "Validar pagamento" pede a data e cria o recibo. A fatura fica paga.
  - "Anular" é para um registo feito por engano, com motivo. A tranche volta a "Por faturar".
  - Uma fatura paga não se anula: corrige-se com nota de crédito no programa de faturação.
- **O 1.º pagamento validado de um contrato** manda dois avisos para o sino, só uma vez:
  - "Criar obra: \<cliente\>" a quem tem `operations.orders.create`. Leva às Operações, com a Nova obra já aberta nesse contrato;
  - "Materiais da obra: \<cliente\>" a quem tem `purchase_orders.create`. Leva às Encomendas.

### Operações (`/operacao/obras`)

- No topo das Obras aparece **"N obras por criar"**: os contratos já pagos e ainda sem obra. Só aparece a quem planeia obras.
- "Criar obra" abre a Nova obra no separador Contrato, com o contrato escolhido.
- O link do sino (`/operacao/obras?criar=<contrato>`) faz o mesmo sozinho.
- A obra nasce **"planeada"**, que é o "plano por aprovar". O gestor revê as tarefas no passo "Serviços do contrato" e escolhe a data e o supervisor.
- Quando a obra nasce, o aviso "Criar obra" fica resolvido. O aviso dos materiais continua, porque é do Armazém.

### Permissões

Há três permissões novas, na categoria "Financeiro" do ecrã Funções:

| Permissão | O que deixa fazer |
|---|---|
| `finance.view` | Abrir o Financeiro |
| `finance.register` | Registar e anular faturas |
| `finance.validate` | Validar pagamentos |

- Cada organização que tem Administrador recebe uma função nova, **"Financeiro"**. Tem as três permissões, mais ver contratos e clientes.
- As três permissões também ficam dadas a System Admin, Super Admin, Administrador e às funções cujo nome começa por "Dire" (Direção, Diretor…).
- **A confirmar pelo Ruben:** se é mesmo esta a Direção.

---

## Como aplicar (Supabase, SQL Editor, por esta ordem)

1. `supabase/migrations/20261214100000_financeiro_faturas_recibos.sql`
   - O fim do ficheiro confere o resultado: se faltar alguma coisa, dá erro. Depois de corrigir, basta correr o ficheiro outra vez.
   - A mensagem final diz quantas funções "Financeiro" e quantas datas de corte ficaram criadas.
2. `operacao-app/db/financeiro-obra.sql`
   - Precisa do `obras.sql` e do `seguranca.sql` já aplicados (já estão em produção).
   - Sem o passo 1, instala na mesma, mas a lista de obras por criar fica vazia.

Os dois ficheiros podem correr mais do que uma vez sem erro e sem duplicar nada.

Não é preciso mexer em Edge Functions nem em buckets. O PDF segue o caminho de sempre: `documents-quarantine` → `validate-upload` → `documents`, na pasta `<org>/client_invoice/<contrato>/`.

### Depois de aplicar, ver no browser
- `/financeiro` com um contrato assinado nos últimos 30 dias: registar, validar e ver os dois avisos no sino;
- carregar no aviso "Criar obra": a app de Operações abre a Nova obra no contrato;
- abrir a obra: o aviso fica resolvido e o contrato sai da lista "obras por criar";
- no ecrã Funções, a categoria "Financeiro" com as três permissões.

---

## Riscos e limitações (ler antes de aplicar)

1. **Corte `faturar_desde`.**
   - Para os contratos antigos não aparecerem todos como "por faturar" (já foram faturados lá fora), cada organização fica com a data de aplicação menos 30 dias.
   - Um contrato assinado antes dessa data não aparece.
   - Para mudar a data de uma organização:
     `UPDATE public.client_finance_settings SET faturar_desde = '2026-09-01' WHERE organization_id = '<org>';`
   - Uma organização criada depois da migration não tem linha. Nesse caso mostra todos os contratos (é o que se quer numa organização nova).
2. **As faturas impedem apagar o contrato.**
   - `client_invoices.contract_id` é `ON DELETE RESTRICT`: uma fatura é registo fiscal.
   - Apagar de vez (DELETE) um contrato com faturas dá erro. O apagar "suave" (`deleted_at`) continua a funcionar.
   - Um contrato apagado assim sai das listas, mas as faturas ficam.
3. **Sem pagamentos parciais.**
   - Há um recibo por fatura (`UNIQUE (invoice_id)`), com o valor total da fatura.
   - Se o cliente pagar uma fatura às prestações, só se valida quando estiver toda paga.
   - Para separar pagamentos, usar tranches (uma fatura por tranche).
4. **A encomenda de material fica só no aviso.**
   - O 1.º pagamento avisa o Armazém ("Materiais da obra"), mas **não cria** a encomenda ao fornecedor.
   - Isso é do Rafael: o stock hoje desconta com `contract_signed` (`Settings.tsx:1520`).
5. **O plano vem do texto das condições de pagamento.**
   - Textos como "30% + 30% + 40%" funcionam.
   - Percentagens que não somem 100 dão "Única 100%". Por exemplo, "IVA a 23%" sozinho não engana.
   - Ainda não há ecrã para editar o plano à mão.
6. **Quem recebe os avisos:** só as pessoas com a permissão por função (`anew_role_permissions`) e membros ativos da organização do contrato. Os administradores de sistema sem função na organização não recebem.
7. **Tipos do Supabase por regenerar.** O código usa `(supabase as any)` nas RPCs novas, o mesmo padrão da Venda Direta.

---

## Verificação feita (13/10/2026)

- `node operacao-app/tools/validar-financeiro.mjs` (PGlite, sem tocar no Supabase): passa tudo. Inclui:
  - as duas migrations corridas 2 vezes, sem duplicados;
  - o plano sugerido a partir do texto;
  - as recusas (número repetido, tranche já faturada, data no futuro, PDF de outra organização, contrato em rascunho, sem permissão, outra organização, escrita direta na tabela);
  - o 1.º pagamento avisa uma vez só;
  - anular e voltar a registar;
  - a obra por criar e o aviso resolvido;
  - `client_contracts` intacto.
- **CRM:**
  - `npx tsc --noEmit -p tsconfig.app.json`: 158 erros, os mesmos da base (`871d538f`);
  - testes novos (vitest/jsdom): 18, a passar;
  - a suite toda tem 11 ficheiros que já falhavam por falta do `.env` do Supabase no worktree. Não têm a ver com esta etapa.
- **Operações:** `npx tsc --noEmit` sem erros; `npx vitest run` com 370 testes, todos a passar (6 novos).
