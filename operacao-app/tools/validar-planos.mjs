/**
 * Prova que os planos preventivos geram as ordens certas, e só essas.
 *
 * As duas coisas que interessam:
 *   · a janela é uma janela — nada é gerado para lá do horizonte;
 *   · correr o job dez vezes gera o mesmo que correr uma.
 *
 *     npm run validar-planos
 */

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STUBS_CRM } from "./_stubs-crm.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const ler = (f) => readFileSync(join(RAIZ, "db", f), "utf8");

const db = new PGlite();
await db.waitReady;
const q = async (sql) => (await db.query(sql)).rows;
const um = async (sql) => (await q(sql))[0];

const falhas = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const mau = (m) => { console.log(`  ✗ ${m}`); falhas.push(m); };

const ORG = "11111111-1111-1111-1111-111111111111";
const CLI = "22222222-2222-2222-2222-222222222222";

await db.exec(STUBS_CRM);
await db.exec(`
  CREATE TABLE public.auth_to_business_user_map (auth_user_id uuid, business_user_id uuid);
  CREATE OR REPLACE FUNCTION public.current_business_user_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
    SELECT m.business_user_id FROM public.auth_to_business_user_map m
     WHERE m.auth_user_id = auth.uid() LIMIT 1 $fn$;
  -- Os nomes dos parametros tem de ser os mesmos do stub, senao o Postgres
  -- recusa o CREATE OR REPLACE.
  CREATE OR REPLACE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
    RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$ SELECT true $fn$;
  INSERT INTO public.anew_users (id, auth_user_id, name, email)
    VALUES ('aaaa0000-0000-0000-0000-00000000000a','aaaa1111-0000-0000-0000-00000000000a','Gestora','g@x.pt');
  INSERT INTO auth.users (id, email, email_confirmed_at)
    VALUES ('aaaa1111-0000-0000-0000-00000000000a','g@x.pt',now());
  INSERT INTO public.auth_to_business_user_map (auth_user_id, business_user_id)
    VALUES ('aaaa1111-0000-0000-0000-00000000000a','aaaa0000-0000-0000-0000-00000000000a');
  INSERT INTO public.anew_organizations (id, name) VALUES ('${ORG}','Org');
  INSERT INTO public.anew_entities (id, display_name) VALUES ('77777777-7777-7777-7777-777777777777','C');
  INSERT INTO public.anew_clients (id, organization_id, entity_id)
    VALUES ('${CLI}','${ORG}','77777777-7777-7777-7777-777777777777');
`);
await db.exec(ler("schema.sql"));
await db.exec(ler("permissoes.sql"));
await db.exec(ler("rpcs.sql"));
await db.exec(ler("rpcs-tarefas.sql"));
await db.exec(ler("planos.sql"));
await db.exec(ler("correcoes-modelo.sql"));
await db.exec(ler("medicoes.sql"));
await db.exec(ler("despacho.sql"));
await db.exec(ler("planos-crud.sql"));

// ── O expansor, isolado ──────────────────────────────────────────────────
console.log("\n─── expandir RRULE ──────────────────────");

// O PGlite devolve `date` como objeto Date. `String(d)` daria "Tue Sep 01",
// que não se compara com "2026-09-01" — e faria o teste acusar o SQL de um
// erro que é da formatação.
const iso = (d) =>
  d instanceof Date
    ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
    : String(d).slice(0, 10);

const expandir = async (regra, de, ate) =>
  (await q(`SELECT public.ops_expandir_rrule('${regra}','${de}'::date,'${ate}'::date) AS d`))
    .map((r) => iso(r.d));

{
  const d = await expandir("FREQ=DAILY", "2026-09-01", "2026-09-05");
  d.length === 5 ? ok("diária: 5 dias em 5") : mau(`diária deu ${d.length}: ${d}`);

  const q2 = await expandir("FREQ=DAILY;INTERVAL=2", "2026-09-01", "2026-09-07");
  q2.join() === "2026-09-01,2026-09-03,2026-09-05,2026-09-07"
    ? ok("de 2 em 2 dias") : mau(`INTERVAL=2 deu ${q2}`);

  // 2026-09-01 é uma terça-feira.
  const seg = await expandir("FREQ=WEEKLY;BYDAY=MO", "2026-09-01", "2026-09-30");
  seg.length === 4 && seg.every((x) => new Date(x + "T12:00:00Z").getUTCDay() === 1)
    ? ok(`semanal à segunda: ${seg.length} segundas, todas segundas`)
    : mau(`semanal deu ${seg}`);

  const duasVezes = await expandir("FREQ=WEEKLY;BYDAY=TU,TH", "2026-09-01", "2026-09-14");
  duasVezes.length === 4 ? ok("duas vezes por semana: 4 em duas semanas")
                         : mau(`BYDAY=TU,TH deu ${duasVezes}`);

  const mensal = await expandir("FREQ=MONTHLY;BYMONTHDAY=15", "2026-09-01", "2026-12-31");
  mensal.join() === "2026-09-15,2026-10-15,2026-11-15,2026-12-15"
    ? ok("mensal ao dia 15") : mau(`mensal deu ${mensal}`);

  // Fevereiro não tem 31. Saltar é melhor do que escorregar para março.
  const dia31 = await expandir("FREQ=MONTHLY;BYMONTHDAY=31", "2026-01-01", "2026-04-30");
  dia31.every((d) => d.endsWith("-31"))
    ? ok(`dia 31: ${dia31.length} meses, e nenhum escorregou para o mês seguinte`)
    : mau(`dia 31 escorregou: ${dia31}`);

  const ate = await expandir("FREQ=DAILY;UNTIL=20260903", "2026-09-01", "2026-09-30");
  ate.length === 3 ? ok("UNTIL trava a série") : mau(`UNTIL deu ${ate.length}`);

  const conta = await expandir("FREQ=DAILY;COUNT=2", "2026-09-01", "2026-09-30");
  conta.length === 2 ? ok("COUNT trava a série") : mau(`COUNT deu ${conta.length}`);

  try {
    await expandir("FREQ=WEEKLY;BYSETPOS=1", "2026-09-01", "2026-09-30");
    mau("uma regra não suportada devia ter sido recusada, e passou");
  } catch (e) {
    e.message.includes("não suportada")
      ? ok("uma regra não suportada é recusada em voz alta, não interpretada mal")
      : mau(`recusada com mensagem errada: ${e.message}`);
  }

  // Ordinal de dia da semana no mes — "primeira/ultima segunda-feira".
  // Setembro de 2026 comeca a uma terca-feira.
  const primeiraSeg = await expandir("FREQ=MONTHLY;BYDAY=1MO", "2026-09-01", "2026-11-30");
  primeiraSeg.join() === "2026-09-07,2026-10-05,2026-11-02"
    ? ok("primeira segunda-feira de cada mes")
    : mau(`1MO deu ${primeiraSeg}`);

  const ultimaSex = await expandir("FREQ=MONTHLY;BYDAY=-1FR", "2026-09-01", "2026-11-30");
  ultimaSex.join() === "2026-09-25,2026-10-30,2026-11-27"
    ? ok("ultima sexta-feira de cada mes")
    : mau(`-1FR deu ${ultimaSex}`);

  // Setembro e outubro de 2026 tem 4 segundas cada; novembro tem mesmo 5.
  // A janela para aqui em outubro de proposito.
  const quinta5 = await expandir("FREQ=MONTHLY;BYDAY=5MO", "2026-09-01", "2026-10-31");
  quinta5.length === 0
    ? ok("um 5.o ordinal que nao existe nao inventa datas")
    : mau(`5MO devia dar vazio, deu ${quinta5}`);
}

// ── A materialização ─────────────────────────────────────────────────────
console.log("\n─── materializar ────────────────────────");
{
  await db.exec(`
    INSERT INTO public.ops_checklist (id, organization_id, codigo, nome, estado)
      VALUES ('c1c1c1c1-0000-0000-0000-0000000000c1','${ORG}','CL-0001','Extintor trimestral','publicada');
    INSERT INTO public.ops_checklist_tarefa (checklist_id, posicao, nome, tipo, unidade, limite_min, limite_max)
      VALUES ('c1c1c1c1-0000-0000-0000-0000000000c1', 0, 'Verificacao de pressao','inspecao','bar',10,15),
             ('c1c1c1c1-0000-0000-0000-0000000000c1', 1, 'Verificacao do selo','inspecao',NULL,NULL,NULL);
    INSERT INTO public.ops_local (id, organization_id, cliente_id, codigo, nome, tipo)
      VALUES ('11ee0000-0000-0000-0000-0000000000ee','${ORG}','${CLI}','L1','Garagem','espaco');
    INSERT INTO public.ops_plano (id, organization_id, codigo, nome, cliente_id, regra_recorrencia, hora_prevista, inicio_em)
      VALUES ('dddd1111-0000-0000-0000-0000000000d1'::uuid,'${ORG}','PLN-0001','PMP mensal AVAC','${CLI}',
              'FREQ=MONTHLY;BYMONTHDAY=1','09:00', current_date);
    INSERT INTO public.ops_plano_alvo (plano_id, local_id, checklist_id)
      VALUES ('dddd1111-0000-0000-0000-0000000000d1'::uuid,'11ee0000-0000-0000-0000-0000000000ee','c1c1c1c1-0000-0000-0000-0000000000c1');
  `);

  const r1 = await um(`SELECT public.rpc_ops_materializar_planos(NULL, 120) AS r`);
  const res = typeof r1.r === "string" ? JSON.parse(r1.r) : r1.r;
  res.ordens_criadas >= 3 && res.ordens_criadas <= 5
    ? ok(`gerou ${res.ordens_criadas} ordens numa janela de 120 dias (mensal → 3 a 5)`)
    : mau(`esperava 3 a 5 ordens, gerou ${res.ordens_criadas}`);
  res.ignorados.length === 0 ? ok("nenhum plano ignorado") : mau(`ignorados: ${JSON.stringify(res.ignorados)}`);

  const alem = await um(`
    SELECT count(*)::int n FROM public.ops_ordem
     WHERE origem='preventiva' AND agendada_para > now() + interval '121 days'`);
  alem.n === 0 ? ok("nada foi gerado para lá do horizonte — não há ordens até 2033")
               : mau(`${alem.n} ordens para lá da janela`);

  const t = await um(`
    SELECT count(*)::int n FROM public.ops_ordem_tarefa t
      JOIN public.ops_ordem o ON o.id = t.ordem_id WHERE o.origem='preventiva'`);
  t.n === res.ordens_criadas * 2
    ? ok(`as tarefas da checklist foram copiadas: ${t.n} para ${res.ordens_criadas} ordens`)
    : mau(`esperava ${res.ordens_criadas * 2} tarefas, há ${t.n}`);

  const v = await um(`
    SELECT count(*)::int n FROM public.ops_ordem_alvo a
      JOIN public.ops_ordem o ON o.id = a.ordem_id
     WHERE o.origem='preventiva' AND a.checklist_versao IS NOT NULL`);
  v.n === res.ordens_criadas
    ? ok("a versão da checklist ficou congelada em cada alvo")
    : mau(`${v.n} alvos com versão, esperava ${res.ordens_criadas}`);

  // Idempotência: correr outra vez não pode gerar mais nada.
  const antes = (await um(`SELECT count(*)::int n FROM public.ops_ordem WHERE origem='preventiva'`)).n;
  await db.exec(`SELECT public.rpc_ops_materializar_planos(NULL, 120);`);
  await db.exec(`SELECT public.rpc_ops_materializar_planos(NULL, 120);`);
  const depois = (await um(`SELECT count(*)::int n FROM public.ops_ordem WHERE origem='preventiva'`)).n;
  antes === depois ? ok("correr o job três vezes gera o mesmo que correr uma")
                   : mau(`duplicou: ${antes} → ${depois}`);
}

// ── Um plano com regra inválida não derruba os outros ─────────────────────
console.log("\n─── um plano partido não parte os outros ─");
{
  await db.exec(`
    INSERT INTO public.ops_plano (organization_id, codigo, nome, cliente_id, regra_recorrencia, inicio_em)
      VALUES ('${ORG}','PLN-MAU','Regra invalida','${CLI}','FREQ=WEEKLY;BYSETPOS=2', current_date);
    INSERT INTO public.ops_plano (organization_id, codigo, nome, cliente_id, regra_recorrencia, inicio_em)
      VALUES ('${ORG}','PLN-BOM','Semanal a segunda','${CLI}','FREQ=WEEKLY;BYDAY=MO', current_date);
  `);
  const r = await um(`SELECT public.rpc_ops_materializar_planos(NULL, 30) AS r`);
  const res = typeof r.r === "string" ? JSON.parse(r.r) : r.r;

  res.ignorados.length === 1 && res.ignorados[0].plano === "PLN-MAU"
    ? ok("o plano com regra inválida foi ignorado e reportado pelo nome")
    : mau(`ignorados: ${JSON.stringify(res.ignorados)}`);
  res.ordens_criadas > 0
    ? ok(`o plano bom gerou na mesma: ${res.ordens_criadas} ordens`)
    : mau("o plano inválido impediu os outros de gerar");
}

// ── Recorrência dinâmica ────────────────────────────────────────────────
console.log("\n─── recorrencia dinamica ────────────────");
{
  await db.exec(`
    INSERT INTO public.ops_plano
      (id, organization_id, codigo, nome, cliente_id, tipo_recorrencia, intervalo_horas, inicio_em)
    VALUES ('eeee1111-0000-0000-0000-0000000000e1'::uuid, '${ORG}','PLN-DIN','Limpeza a cada 72h','${CLI}',
            'dinamica', 72, current_date);
  `);

  const antes = (await um(`SELECT count(*)::int n FROM public.ops_ordem WHERE plano_id='eeee1111-0000-0000-0000-0000000000e1'`)).n;
  await db.exec(`SELECT public.rpc_ops_materializar_planos(NULL, 120);`);
  const depois = (await um(`SELECT count(*)::int n FROM public.ops_ordem WHERE plano_id='eeee1111-0000-0000-0000-0000000000e1'`)).n;
  antes === depois
    ? ok("o job diario NAO materializa planos dinamicos")
    : mau(`o job criou ${depois - antes} ordens de um plano dinamico`);

  // A primeira nasce a mao; a seguinte nasce do fecho.
  await db.exec(`
    INSERT INTO public.ops_ordem (organization_id, codigo, origem, estado, cliente_id, plano_id, titulo)
    VALUES ('${ORG}','OT-DIN-1','preventiva','em_curso','${CLI}','eeee1111-0000-0000-0000-0000000000e1','Limpeza');
  `);
  const id = (await um(`SELECT id FROM public.ops_ordem WHERE codigo='OT-DIN-1'`)).id;

  await db.exec(`SELECT public.ops_gerar_proxima_dinamica('${id}');`);
  const abertas = (await um(`
    SELECT count(*)::int n FROM public.ops_ordem
     WHERE plano_id='eeee1111-0000-0000-0000-0000000000e1'
       AND estado IN ('por_aprovar','agendada','em_curso','pausada')`)).n;
  abertas === 1
    ? ok("com uma ordem ainda aberta, NAO nasce outra")
    : mau(`ficaram ${abertas} abertas`);

  // A fechadura do estado aplica-se a toda a gente, inclusive a este teste.
  // Autorizar explicitamente é o que a RPC faz — aqui fazemo-lo à mão porque
  // não há sessão autenticada.
  await db.exec(`
    SELECT set_config('ops.transicao','autorizada',false);
    UPDATE public.ops_ordem SET estado='confirmada' WHERE id='${id}';
    SELECT set_config('ops.transicao','',false);
  `);
  await db.exec(`SELECT public.ops_gerar_proxima_dinamica('${id}');`);
  const nova = await um(`
    SELECT codigo, agendada_para FROM public.ops_ordem
     WHERE plano_id='eeee1111-0000-0000-0000-0000000000e1' AND codigo <> 'OT-DIN-1'`);
  nova ? ok(`depois de fechar, nasce a seguinte: ${nova.codigo}`)
       : mau("nao nasceu a ordem seguinte");

  if (nova) {
    const h = (await um(`
      SELECT EXTRACT(EPOCH FROM (agendada_para - now()))/3600 AS h
        FROM public.ops_ordem WHERE codigo='${nova.codigo}'`)).h;
    Math.abs(Number(h) - 72) < 1
      ? ok("agendada 72h depois do fecho, como o plano manda")
      : mau(`esperava +72h, deu +${Number(h).toFixed(1)}h`);
  }
}


// ── Criar e editar um plano sem escrever SQL ─────────────────────────────
console.log("\n─── gravar um plano ─────────────────────");

const GESTOR_AUTH = "aaaa1111-0000-0000-0000-00000000000a";

await db.exec(`
  INSERT INTO public.ops_utilizador_perfil (organization_id, utilizador_id, funcao)
    VALUES ('${ORG}','aaaa0000-0000-0000-0000-00000000000a','gestor');
`);

async function gravar(args) {
  const p = {
    p_plano_id: "NULL",
    p_cliente_id: `'${CLI}'`,
    ...args,
  };
  const r = await db.exec(`
    BEGIN;
    SET LOCAL request.jwt.claim.sub = '${GESTOR_AUTH}';
    SELECT public.rpc_ops_gravar_plano(${Object.entries(p).map(([k, v]) => `${k} => ${v}`).join(", ")});
    COMMIT;
  `);
  const linhas = r.flatMap((x) => x.rows ?? []);
  const bruto = Object.values(linhas.at(-1) ?? {})[0];
  return typeof bruto === "string" ? JSON.parse(bruto) : bruto;
}

async function gravarDeveFalhar(nome, args, trecho) {
  try {
    await gravar(args);
    mau(`${nome} — PASSOU, e devia ter sido recusado`);
  } catch (e) {
    await db.exec("ROLLBACK").catch(() => {});
    if (!trecho || e.message.includes(trecho)) ok(nome);
    else mau(`${nome} — mensagem errada: ${e.message.split("\n")[0]}`);
  }
}

{
  const r = await gravar({
    p_nome: "'PMP trimestral extintores'",
    p_regra: "'FREQ=MONTHLY;BYDAY=1MO'",
  });
  r?.ok && r.criado ? ok(`criou o plano ${r.codigo}`) : mau(`não criou: ${JSON.stringify(r)}`);

  const p = await um(`SELECT nome, tipo_recorrencia, regra_recorrencia, estado
                        FROM public.ops_plano WHERE id='${r.id}'`);
  p.regra_recorrencia === "FREQ=MONTHLY;BYDAY=1MO"
    ? ok("com a regra ordinal guardada tal e qual")
    : mau(`regra: ${p.regra_recorrencia}`);

  // Editar substitui, e obriga o job a reconsiderar a janela.
  await db.exec(`UPDATE public.ops_plano SET materializado_ate = current_date + 120 WHERE id='${r.id}';`);
  const e = await gravar({
    p_plano_id: `'${r.id}'`,
    p_nome: "'PMP trimestral extintores (revisto)'",
    p_regra: "'FREQ=MONTHLY;BYMONTHDAY=15'",
  });
  e?.criado === false ? ok("editar não cria um segundo plano") : mau("editar criou outro");

  const p2 = await um(`SELECT nome, regra_recorrencia, materializado_ate
                         FROM public.ops_plano WHERE id='${r.id}'`);
  p2.regra_recorrencia === "FREQ=MONTHLY;BYMONTHDAY=15"
    ? ok("a regra mudou") : mau(`regra ficou ${p2.regra_recorrencia}`);
  p2.materializado_ate === null
    ? ok("e a janela já gerada foi invalidada — mudar a regra obriga a recontar")
    : mau(`materializado_ate ficou ${p2.materializado_ate}`);
}

await gravarDeveFalhar(
  "um plano sem nome é recusado",
  { p_nome: "'  '", p_regra: "'FREQ=DAILY'" },
  "precisa de um nome"
);

await gravarDeveFalhar(
  "uma regra que o expansor não sabe ler é recusada AO GRAVAR",
  { p_nome: "'Regra impossivel'", p_regra: "'FREQ=WEEKLY;BYSETPOS=1'" },
  "não é suportada"
);

await gravarDeveFalhar(
  "um plano dinâmico sem intervalo é recusado",
  { p_nome: "'Dinamico'", p_tipo_recorrencia: "'dinamica'" },
  "intervalo em horas"
);

await gravarDeveFalhar(
  "um plano que acaba antes de começar é recusado",
  { p_nome: "'Ao contrario'", p_regra: "'FREQ=DAILY'",
    p_inicio_em: "'2026-06-01'", p_fim_em: "'2026-05-01'" },
  "acaba antes de começar"
);

{
  // Uma regra sintaticamente válida que nunca gera nada é pior do que uma
  // inválida: fica em silêncio para sempre.
  await gravarDeveFalhar(
    "uma regra que não gera data nenhuma no próximo ano é recusada",
    { p_nome: "'Nunca acontece'", p_regra: "'FREQ=DAILY;COUNT=0'" },
    "não gera nenhuma data"
  );
}

console.log("\n─── experimentar antes de gravar ────────");
{
  const r = await um(`SELECT public.rpc_ops_experimentar_regra('FREQ=MONTHLY;BYDAY=1MO','2026-09-01',3) AS r`);
  const res = typeof r.r === "string" ? JSON.parse(r.r) : r.r;
  res.ok && res.datas.length === 3
    ? ok(`experimentar devolveu 3 datas: ${res.datas.join(", ")}`)
    : mau(`experimentar deu ${JSON.stringify(res)}`);

  const mauR = await um(`SELECT public.rpc_ops_experimentar_regra('FREQ=WEEKLY;BYSETPOS=1') AS r`);
  const resMau = typeof mauR.r === "string" ? JSON.parse(mauR.r) : mauR.r;
  resMau.ok === false && resMau.erro
    ? ok("e uma regra má devolve o erro em vez de rebentar o ecrã")
    : mau(`devia ter devolvido erro: ${JSON.stringify(resMau)}`);
}

console.log("");
if (falhas.length) {
  console.error(`✗ ${falhas.length} verificação(ões) falharam`);
  process.exit(1);
}
console.log("✓ os planos geram a janela certa, e o job é repetível");
