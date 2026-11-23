/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import migrationSql from "../../../supabase/migrations/20261229600000_confirmacao_visita_ao_confirmar.sql?raw";

// A confirmacao ao cliente sai quando a EMPRESA confirma na Agenda. Teste de
// texto: confirma que as guardas estao no SQL. NAO prova que o SQL corre --
// isso so o db push (e a prova na nike) mostram.

function raw(): string {
  return migrationSql;
}

function sql(): string {
  return raw().toLowerCase().replace(/"/g, "").replace(/\s+/g, " ").trim();
}

describe("migration: confirmacao da visita ao confirmar na Agenda", () => {
  it("existe e esta em CRLF", () => {
    const text = raw();
    expect(text.length).toBeGreaterThan(0);
    expect(text.includes("\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "").includes("\n")).toBe(false);
  });

  it("omissao = comportamento de hoje (booking, interruptor desligado, visitas antigas sem modo)", () => {
    const s = sql();
    expect(s).toContain("add column if not exists confirmation_send_on text not null default 'booking'");
    expect(s).toContain("add column if not exists send_confirmation_on_confirm boolean not null default false");
    expect(s).toMatch(/alter table public\.schedule_items add column if not exists confirmation_send_on text;/);
  });

  it("o gatilho so dispara na confirmacao da EMPRESA (confirmed_at vazio) e so no modo novo", () => {
    const s = sql();
    expect(s).toContain("after insert or update of status on public.schedule_items");
    expect(s).toContain("new.status = 'confirmed' and new.confirmed_at is null and new.confirmation_send_on = 'agenda_confirm'");
    // confirmed -> confirmed nao reenvia
    expect(s).toContain("if old.status::text = 'confirmed' then return null;");
  });

  it("idempotente: uma confirmacao automatica por visita, canal e hora", () => {
    const s = sql();
    expect(s).toContain("create unique index if not exists visit_confirmation_sends_auto_once on public.visit_confirmation_sends (schedule_item_id, channel, visit_start_snapshot) where kind = 'auto'");
    expect(s).toContain("on conflict (schedule_item_id, channel, visit_start_snapshot) where kind = 'auto' do nothing");
  });

  it("fila fechada: RLS ligada, sem politicas, sem privilegios para anon/authenticated", () => {
    const s = sql();
    expect(s).toContain("alter table public.visit_confirmation_sends enable row level security");
    expect(s).not.toMatch(/create policy/);
    expect(s).toContain("revoke all on table public.visit_confirmation_sends from anon");
    expect(s).toContain("revoke all on table public.visit_confirmation_sends from authenticated");
  });

  it("RPCs com ambito por dentro; a de reclamar so para a service_role", () => {
    const s = sql();
    expect(s).toContain("get_schedule_item_scope_context(si.organization_id, 'scheduling.items.view')");
    expect(s).toContain("get_schedule_item_scope_context(v_item.organization_id, 'scheduling.items.edit')");
    expect(s).toContain("revoke all on function public.fn_visit_confirmation_claim(uuid, integer) from authenticated");
    expect(s).toContain("grant execute on function public.fn_visit_confirmation_claim(uuid, integer) to service_role");
    expect(s).toContain("for update skip locked");
    expect(s).toContain("k_max_per_day constant integer := 3");
  });

  it("todas as funcoes sao security definer com search_path fixo", () => {
    const s = sql();
    const defs = s.split("create or replace function").slice(1);
    expect(defs.length).toBe(5);
    for (const d of defs) {
      expect(d).toContain("security definer");
      expect(d).toContain("set search_path to 'public', 'pg_temp'");
    }
  });

  it("RAISE sem % por escapar e colunas char do catalogo convertidas a text", () => {
    const text = raw();
    for (const m of text.matchAll(/RAISE EXCEPTION '([^']*)'(,[^;]*)?/g)) {
      const pct = (m[1].match(/%/g) ?? []).length;
      const args = m[2] ? m[2].split(",").length - 1 : 0;
      expect(pct).toBeLessThanOrEqual(args);
    }
    expect(sql()).not.toMatch(/contype\s*(\|\||=)/);
  });

  it("termina com o bloco de conferir", () => {
    const s = sql();
    expect(s).toContain("ha formularios fora do modo booking logo a seguir a migration");
    expect(s).toContain("visit_confirmation_sends nao deve ter politicas");
  });
});

// Achados da revisao independente. Testes de TEXTO: provam que a guarda esta
// escrita no SQL, nao que o SQL corre (so o db push e a prova na nike mostram).
describe("migration: correcoes da revisao (texto)", () => {
  function fn(name: string): string {
    const defs = sql().split("create or replace function ").slice(1);
    const hit = defs.find((d) => d.startsWith(`public.${name}`));
    expect(hit, `funcao ${name}`).toBeTruthy();
    return hit as string;
  }

  it("1. limite de confirmacoes automaticas por visita e canal em 24 h (arrastar a hora nao faz spam)", () => {
    const f = fn("fn_schedule_items_enqueue_visit_confirmation");
    expect(f).toContain("k_max_auto_per_day constant integer := 4");
    expect(f).toContain("v.kind = 'auto'");
    expect(f).toContain("v.created_at > now() - interval '24 hours'");
    expect(f).toMatch(/\) < k_max_auto_per_day/);
    // continua a usar o predicado do indice parcial
    expect(f).toContain("on conflict (schedule_item_id, channel, visit_start_snapshot) where kind = 'auto' do nothing");
  });

  it("2. linha caducada em sending volta a pending se ainda tem tentativas, senao fica failed e e devolvida para o aviso", () => {
    const f = fn("fn_visit_confirmation_claim");
    expect(f).toContain("k_max_attempts constant integer := 3");
    // (.*? e nao [^;]*: as mensagens de erro entre aspas levam um ';')
    expect(f).toMatch(/set status = 'pending'.*?where status = 'sending' and claimed_at < now\(\) - interval '10 minutes' and attempts < k_max_attempts;/);
    expect(f).toMatch(/set status = 'failed'.*?where status = 'sending' and claimed_at < now\(\) - interval '10 minutes' and attempts >= k_max_attempts returning/);
    // as falhadas voltam ao chamador (o processador avisa o comercial no sino)
    expect(f).toMatch(/for v_row in update public\.visit_confirmation_sends set status = 'failed'/);
    expect(f).toContain("return next v_row");
  });

  it("3. lembretes: coluna reminders_created_at e linha 'reminders' para a mesma hora reconfirmada", () => {
    const s = sql();
    expect(s).toContain("reminders_created_at timestamptz");
    expect(s).toContain("check (kind in ('auto', 'resend', 'reminders'))");
    expect(s).toContain("check (channel in ('email', 'sms', 'reminders'))");
    const f = fn("fn_schedule_items_enqueue_visit_confirmation");
    expect(f).toContain("get diagnostics v_inserted = row_count");
    expect(f).toMatch(/if v_inserted = 0 then insert into public\.visit_confirmation_sends/);
    expect(f).toContain("'reminders', 'reminders'");
    // o ecra e o limite de reenvios nunca veem a linha tecnica
    expect(fn("rpc_visit_confirmation_status")).toContain("v.kind <> 'reminders'");
  });

  it("4. lock_timeout no topo, antes de qualquer ALTER TABLE", () => {
    const s = sql();
    const lock = s.indexOf("set lock_timeout = '5s';");
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(s.indexOf("alter table public.form_branding"));
    expect(lock).toBeLessThan(s.indexOf("alter table public.schedule_items"));
  });

  it("5. o modo por omissao corre DEPOIS do espelho contact_id -> lead_id (ordem alfabetica dos gatilhos)", () => {
    const s = sql();
    const name = "trg_schedule_items_zz_confirmation_mode_default";
    expect(s).toContain(`create trigger ${name} before insert on public.schedule_items`);
    expect(s).toContain(`tgname::text = '${name}'`);
    expect(s).not.toContain("trg_schedule_items_confirmation_mode_default");
    expect(name > "trg_schedule_items_sync_lead_contact").toBe(true);
  });

  it("6. o destinatario so sai a quem tem scheduling.items.edit", () => {
    const f = fn("rpc_visit_confirmation_status");
    expect(f).toContain("v_can_edit boolean := public.has_scheduling_permission(auth.uid(), 'scheduling.items.edit')");
    expect(f).toContain("case when v_can_edit then q.recipient else null end");
    expect(f).not.toMatch(/q\.skip_reason, q\.recipient/);
  });
});
