-- ========================================================================
-- O BANCO DO CRM
--
-- Rode este arquivo UMA VEZ, num projeto Supabase novo e vazio.
-- O instalador (npm run instalar) faz isso sozinho e é o caminho normal;
-- rodar na mão, no SQL Editor do Supabase, funciona igual.
--
-- ── O QUE PROTEGE OS SEUS DADOS ────────────────────────────────────────────
--
-- Toda tabela aqui tem RLS (Row Level Security) ligada. A tela do CRM fala com
-- o banco DIRETO, com a chave pública, e quem decide o que cada pessoa pode ler
-- e escrever são as policy deste arquivo, dentro do Postgres.
--
-- Isso é o contrário de esconder a regra no código da tela: código de tela roda
-- no navegador de quem está olhando, e qualquer pessoa edita. A regra que vale
-- é a que o banco recusa.
--
-- As tabelas terminadas em _secrets são a exceção que confirma: elas têm RLS
-- ligada e NENHUMA policy. Ninguém lê, nem quem está logado. Só o servidor, com
-- a chave de serviço, alcança. É lá que mora o token do seu WhatsApp.
--
-- Gerado a partir de um banco em produção, não escrito à mão.
-- ========================================================================

-- ------------------------------------------------------------------------
-- Extensões
-- ------------------------------------------------------------------------

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------
-- Tabelas
-- ------------------------------------------------------------------------

create table if not exists public."clients" (
  "id" uuid default gen_random_uuid() not null,
  "company_name" text not null,
  "commercial_name" text,
  "logo_url" text,
  "responsible_name" text,
  "responsible_contact" text,
  "segment" text,
  "status" text default 'ATIVO'::text not null,
  "workspace_slug" text not null,
  "primary_color" text default '#6366f1'::text not null,
  "website" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "clients_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_agents" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "status" text default 'rascunho'::text not null,
  "config" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_agents_pkey" PRIMARY KEY (id),
  constraint "crm_agents_status_check" CHECK ((status = ANY (ARRAY['rascunho'::text, 'ativo'::text, 'pausado'::text])))
);

create table if not exists public."crm_broadcast_settings" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "connection_id" uuid not null,
  "min_interval_seconds" integer default 30 not null,
  "max_interval_seconds" integer default 90 not null,
  "daily_cap" integer default 200 not null,
  "window_start" time without time zone default '09:00:00'::time without time zone not null,
  "window_end" time without time zone default '20:00:00'::time without time zone not null,
  "pause_on_reply" boolean default true not null,
  "updated_at" timestamp with time zone default now() not null,
  "fluxo_boas_vindas" uuid,
  "fluxo_resposta_padrao" uuid,
  "resposta_padrao_horas" integer default 24 not null,
  "fluxo_conversa_finalizada" uuid,
  "fluxo_atendimento_finalizado" uuid,
  constraint "crm_broadcast_settings_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_broadcast_targets" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "broadcast_id" uuid not null,
  "name" text,
  "phone" text not null,
  "status" text default 'pendente'::text not null,
  "error" text,
  "sent_at" timestamp with time zone,
  constraint "crm_broadcast_targets_pkey" PRIMARY KEY (id),
  constraint "crm_broadcast_targets_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'falhou'::text, 'cancelado'::text])))
);

create table if not exists public."crm_broadcasts" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "connection_id" uuid,
  "template_id" uuid,
  "flow_id" uuid,
  "message_body" text,
  "status" text default 'rascunho'::text not null,
  "scheduled_at" timestamp with time zone,
  "total_count" integer default 0 not null,
  "sent_count" integer default 0 not null,
  "failed_count" integer default 0 not null,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_broadcasts_pkey" PRIMARY KEY (id),
  constraint "crm_broadcasts_status_check" CHECK ((status = ANY (ARRAY['rascunho'::text, 'agendado'::text, 'enviando'::text, 'concluido'::text, 'cancelado'::text, 'falhou'::text])))
);

create table if not exists public."crm_calls" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "contact_id" uuid,
  "direction" text default 'saida'::text not null,
  "duration_seconds" integer default 0 not null,
  "notes" text,
  "occurred_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_calls_pkey" PRIMARY KEY (id),
  constraint "crm_calls_direction_check" CHECK ((direction = ANY (ARRAY['entrada'::text, 'saida'::text])))
);

create table if not exists public."crm_chat_field_values" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "chat_id" uuid not null,
  "field_id" uuid not null,
  "value" text,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_chat_field_values_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_chat_notes" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "chat_id" uuid not null,
  "body" text not null,
  "author_name" text,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_chat_notes_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_chats" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "connection_id" uuid,
  "contact_id" uuid,
  "contact_name" text not null,
  "phone" text,
  "avatar_url" text,
  "status" text default 'aguardando'::text not null,
  "unread_count" integer default 0 not null,
  "last_message_at" timestamp with time zone,
  "last_message_preview" text,
  "assigned_to" uuid,
  "assigned_name" text,
  "department_id" uuid,
  "kanban_card_id" uuid,
  "tags" text[] default '{}'::text[] not null,
  "external_id" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "resolved_by_name" text,
  "resolved_at" timestamp with time zone,
  "avatar_path" text,
  "avatar_checked_at" timestamp with time zone,
  "bot_paused" boolean default false not null,
  "resposta_padrao_em" timestamp with time zone,
  "fora_horario_em" timestamp with time zone,
  "canal" text default 'whatsapp'::text not null,
  "ig_user_id" text,
  constraint "crm_chats_pkey" PRIMARY KEY (id),
  constraint "crm_chats_canal_check" CHECK ((canal = ANY (ARRAY['whatsapp'::text]))),
  constraint "crm_chats_status_check" CHECK ((status = ANY (ARRAY['aguardando'::text, 'atendendo'::text, 'resolvido'::text])))
);

create table if not exists public."crm_connection_secrets" (
  "connection_id" uuid not null,
  "cloud_token" text,
  "updated_at" timestamp with time zone default now() not null,
  "uazapi_token" text,
  constraint "crm_connection_secrets_pkey" PRIMARY KEY (connection_id)
);

create table if not exists public."crm_connections" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "kind" text default 'web'::text not null,
  "phone" text,
  "status" text default 'desconectada'::text not null,
  "plan" text default 'starter'::text not null,
  "instance_id" text,
  "status_detail" text,
  "connected_at" timestamp with time zone,
  "disconnected_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "device_name" text,
  "history_imported_at" timestamp with time zone,
  "cloud_phone_id" text,
  "cloud_waba_id" text,
  "uazapi_server" text,
  "uazapi_instance" text,
  constraint "crm_connections_pkey" PRIMARY KEY (id),
  constraint "crm_connections_kind_check" CHECK ((kind = ANY (ARRAY['uazapi'::text, 'oficial'::text]))),
  constraint "crm_connections_plan_check" CHECK ((plan = ANY (ARRAY['starter'::text, 'pro'::text]))),
  constraint "crm_connections_status_check" CHECK ((status = ANY (ARRAY['desconectada'::text, 'conectando'::text, 'conectada'::text, 'erro'::text])))
);

create table if not exists public."crm_contacts" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "email" text,
  "phone" text,
  "organization" text,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "tags" text[] default '{}'::text[] not null,
  "custom_fields" jsonb default '{}'::jsonb not null,
  "avatar_url" text,
  constraint "crm_contacts_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_custom_fields" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "entity" text default 'contato'::text not null,
  "label" text not null,
  "key" text not null,
  "type" text default 'texto'::text not null,
  "options" text[] default '{}'::text[] not null,
  "required" boolean default false not null,
  "position" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "description" text,
  "sistema" boolean default false not null,
  constraint "crm_custom_fields_pkey" PRIMARY KEY (id),
  constraint "crm_custom_fields_entity_check" CHECK ((entity = ANY (ARRAY['contato'::text, 'lead'::text, 'negocio'::text, 'chat'::text]))),
  constraint "crm_custom_fields_type_check" CHECK ((type = ANY (ARRAY['texto'::text, 'numero'::text, 'data'::text, 'lista'::text, 'booleano'::text])))
);

create table if not exists public."crm_dashboard_settings" (
  "client_id" uuid not null,
  "currency" text default 'BRL'::text not null,
  "tax_pct" numeric(6,2) default 0 not null,
  "gateway_fee_pct" numeric(6,2) default 0 not null,
  "fixed_cost" numeric(14,2) default 0 not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_dashboard_settings_pkey" PRIMARY KEY (client_id)
);

create table if not exists public."crm_deals" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "pipeline_id" uuid,
  "stage_id" uuid,
  "contact_id" uuid,
  "title" text not null,
  "value" numeric(14,2) default 0 not null,
  "status" text default 'aberto'::text not null,
  "closed_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_deals_pkey" PRIMARY KEY (id),
  constraint "crm_deals_status_check" CHECK ((status = ANY (ARRAY['aberto'::text, 'ganho'::text, 'perdido'::text])))
);

create table if not exists public."crm_departments" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "description" text,
  "color" text default '#6366f1'::text not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_departments_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_disparo_regras" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "connection_id" uuid not null,
  "combinador" text default 'ou'::text not null,
  "condicoes" jsonb default '[]'::jsonb not null,
  "flow_id" uuid,
  "position" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_disparo_regras_pkey" PRIMARY KEY (id),
  constraint "crm_disparo_regras_combinador_check" CHECK ((combinador = ANY (ARRAY['ou'::text, 'e'::text])))
);

create table if not exists public."crm_flow_folders" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_flow_folders_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_flow_rodizio" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "flow_id" uuid not null,
  "block_id" text not null,
  "chat_id" uuid,
  "saida_id" text not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_flow_rodizio_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_flow_runs" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "flow_id" uuid not null,
  "chat_id" uuid,
  "trigger_kind" text default 'manual'::text not null,
  "triggered_by_name" text,
  "status" text default 'pendente'::text not null,
  "status_detail" text,
  "created_at" timestamp with time zone default now() not null,
  "finished_at" timestamp with time zone,
  "current_block_id" text,
  "waiting_block_id" text,
  "waiting_since" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "variables" jsonb default '{}'::jsonb not null,
  "last_step_at" timestamp with time zone,
  "reperguntas" integer default 0 not null,
  constraint "crm_flow_runs_pkey" PRIMARY KEY (id),
  constraint "crm_flow_runs_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'executando'::text, 'aguardando'::text, 'dormindo'::text, 'concluido'::text, 'falhou'::text, 'cancelado'::text])))
);

create table if not exists public."crm_flows" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "folder_id" uuid,
  "name" text not null,
  "status" text default 'ativo'::text not null,
  "trigger_kind" text default 'palavra_chave'::text not null,
  "trigger_value" text,
  "graph" jsonb default '{"edges": [], "nodes": []}'::jsonb not null,
  "blocks_count" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_flows_pkey" PRIMARY KEY (id),
  constraint "crm_flows_status_check" CHECK ((status = ANY (ARRAY['ativo'::text, 'pausado'::text, 'arquivado'::text]))),
  constraint "crm_flows_trigger_kind_check" CHECK ((trigger_kind = ANY (ARRAY['palavra_chave'::text, 'primeira_mensagem'::text, 'webhook'::text, 'manual'::text, 'etiqueta'::text])))
);

create table if not exists public."crm_global_variables" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "key" text not null,
  "value" text default ''::text not null,
  "description" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "tipo" text default 'texto'::text not null,
  constraint "crm_global_variables_pkey" PRIMARY KEY (id),
  constraint "crm_global_variables_tipo_check" CHECK ((tipo = ANY (ARRAY['texto'::text, 'numero'::text, 'booleano'::text])))
);

create table if not exists public."crm_horario_config" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "connection_id" uuid not null,
  "ativo" boolean default false not null,
  "acao_fora" text default 'mensagem'::text not null,
  "mensagem_fora" text,
  "fluxo_fora" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_horario_config_pkey" PRIMARY KEY (id),
  constraint "crm_horario_config_acao_fora_check" CHECK ((acao_fora = ANY (ARRAY['mensagem'::text, 'fluxo'::text])))
);

create table if not exists public."crm_horario_janelas" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "connection_id" uuid not null,
  "weekday" smallint not null,
  "inicio" time without time zone default '09:00:00'::time without time zone not null,
  "fim" time without time zone default '18:00:00'::time without time zone not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_horario_janelas_pkey" PRIMARY KEY (id),
  constraint "crm_horario_janelas_weekday_check" CHECK (((weekday >= 0) AND (weekday <= 6)))
);

create table if not exists public."crm_integration_secrets" (
  "integration_id" uuid not null,
  "secret" text not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_integration_secrets_pkey" PRIMARY KEY (integration_id)
);

create table if not exists public."crm_integrations" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "provider" text not null,
  "label" text not null,
  "config" jsonb default '{}'::jsonb not null,
  "status" text default 'pendente'::text not null,
  "status_detail" text,
  "last_sync_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "secret_hint" text,
  constraint "crm_integrations_pkey" PRIMARY KEY (id),
  constraint "crm_integrations_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'conectado'::text, 'erro'::text, 'desativado'::text])))
);

create table if not exists public."crm_invites" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "email" text not null,
  "role" text default 'atendente'::text not null,
  "status" text default 'pendente'::text not null,
  "token" uuid default gen_random_uuid() not null,
  "expires_at" timestamp with time zone default (now() + '7 days'::interval) not null,
  "accepted_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_invites_pkey" PRIMARY KEY (id),
  constraint "crm_invites_role_check" CHECK ((role = ANY (ARRAY['proprietario'::text, 'admin'::text, 'atendente'::text, 'leitura'::text]))),
  constraint "crm_invites_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'aceito'::text, 'expirado'::text, 'cancelado'::text])))
);

create table if not exists public."crm_invoices" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "description" text not null,
  "amount_cents" integer default 0 not null,
  "status" text default 'aberta'::text not null,
  "issued_at" date default CURRENT_DATE not null,
  "due_date" date,
  "paid_at" date,
  "url" text,
  constraint "crm_invoices_pkey" PRIMARY KEY (id),
  constraint "crm_invoices_status_check" CHECK ((status = ANY (ARRAY['paga'::text, 'aberta'::text, 'vencida'::text, 'cancelada'::text])))
);

create table if not exists public."crm_kanban_cards" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "kanban_id" uuid not null,
  "column_id" uuid not null,
  "title" text not null,
  "description" text,
  "value" numeric(14,2) default 0 not null,
  "contact_id" uuid,
  "position" integer default 0 not null,
  "due_at" timestamp with time zone,
  "tags" text[] default '{}'::text[] not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_kanban_cards_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_kanban_columns" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "kanban_id" uuid not null,
  "name" text not null,
  "color" text default '#6366f1'::text not null,
  "position" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  "is_conversion" boolean default false not null,
  constraint "crm_kanban_columns_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_kanbans" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "description" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_kanbans_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_leads" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "status" text default 'novo'::text not null,
  "email" text,
  "phone" text,
  "organization" text,
  "origin" text,
  "assigned_to" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_leads_pkey" PRIMARY KEY (id),
  constraint "crm_leads_status_check" CHECK ((status = ANY (ARRAY['novo'::text, 'em_nutricao'::text, 'nao_qualificado'::text, 'contatado'::text])))
);

create table if not exists public."crm_mcp_tokens" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "token_prefix" text not null,
  "token_hash" text not null,
  "scopes" text[] default '{leitura}'::text[] not null,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "auth_type" text default 'estatico'::text not null,
  constraint "crm_mcp_tokens_pkey" PRIMARY KEY (id),
  constraint "crm_mcp_tokens_auth_type_check" CHECK ((auth_type = ANY (ARRAY['estatico'::text, 'oauth'::text])))
);

create table if not exists public."crm_messages" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "chat_id" uuid not null,
  "direction" text not null,
  "body" text default ''::text not null,
  "media_url" text,
  "media_kind" text,
  "author_name" text,
  "status" text default 'enviada'::text not null,
  "external_id" text,
  "sent_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null,
  "media_path" text,
  "imported_at" timestamp with time zone,
  "buttons" jsonb,
  constraint "crm_messages_pkey" PRIMARY KEY (id),
  constraint "crm_messages_direction_check" CHECK ((direction = ANY (ARRAY['entrada'::text, 'saida'::text]))),
  constraint "crm_messages_media_kind_check" CHECK ((media_kind = ANY (ARRAY['imagem'::text, 'audio'::text, 'video'::text, 'documento'::text, 'figurinha'::text]))),
  constraint "crm_messages_status_check" CHECK ((status = ANY (ARRAY['enviando'::text, 'enviada'::text, 'entregue'::text, 'lida'::text, 'falhou'::text])))
);

create table if not exists public."crm_meta_assets" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "kind" text not null,
  "external_id" text not null,
  "name" text not null,
  "selected" boolean default false not null,
  "meta" jsonb default '{}'::jsonb not null,
  "synced_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_meta_assets_pkey" PRIMARY KEY (id),
  constraint "crm_meta_assets_kind_check" CHECK ((kind = ANY (ARRAY['conta_anuncio'::text, 'pagina'::text, 'pixel'::text, 'perfil'::text])))
);

create table if not exists public."crm_meta_campaigns" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "account_external_id" text not null,
  "campaign_id" text not null,
  "name" text not null,
  "status" text,
  "objective" text,
  "spend" numeric(14,2) default 0 not null,
  "impressions" bigint default 0 not null,
  "clicks" bigint default 0 not null,
  "results" bigint default 0 not null,
  "day" date not null,
  "synced_at" timestamp with time zone default now() not null,
  constraint "crm_meta_campaigns_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_notes" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "body" text not null,
  "deal_id" uuid,
  "lead_id" uuid,
  "contact_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_notes_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_notifications" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "message" text not null,
  "read" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_notifications_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_pipelines" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text default 'Funil de vendas'::text not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_pipelines_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_products" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "sku" text,
  "description" text,
  "price_min" numeric(14,2) default 0 not null,
  "price_max" numeric(14,2) default 0 not null,
  "default_price" numeric(14,2) default 0 not null,
  "active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "currency" text default 'BRL'::text not null,
  constraint "crm_products_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_quick_replies" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "shortcut" text not null,
  "title" text,
  "body" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "items" jsonb default '[]'::jsonb not null,
  constraint "crm_quick_replies_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_sales" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "deal_id" uuid,
  "chat_id" uuid,
  "connection_id" uuid,
  "product_id" uuid,
  "customer_name" text,
  "amount" numeric(14,2) default 0 not null,
  "status" text default 'aprovada'::text not null,
  "source" text,
  "occurred_at" timestamp with time zone default now() not null,
  "created_at" timestamp with time zone default now() not null,
  "customer_phone" text,
  "currency" text default 'BRL'::text not null,
  "invoice_number" text,
  "kanban_card_id" uuid,
  constraint "crm_sales_pkey" PRIMARY KEY (id),
  constraint "crm_sales_status_check" CHECK ((status = ANY (ARRAY['aprovada'::text, 'pendente'::text, 'reembolsada'::text, 'recusada'::text])))
);

create table if not exists public."crm_scheduled_messages" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "chat_id" uuid not null,
  "kind" text default 'mensagem'::text not null,
  "body" text,
  "flow_id" uuid,
  "run_at" timestamp with time zone not null,
  "repeat" text default 'nao_repetir'::text not null,
  "status" text default 'pendente'::text not null,
  "status_detail" text,
  "last_run_at" timestamp with time zone,
  "created_by_name" text,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_scheduled_messages_pkey" PRIMARY KEY (id),
  constraint "crm_scheduled_ate_31_dias" CHECK ((run_at <= (created_at + '31 days'::interval))),
  constraint "crm_scheduled_conteudo_coerente" CHECK ((((kind = 'mensagem'::text) AND (COALESCE(TRIM(BOTH FROM body), ''::text) <> ''::text)) OR ((kind = 'fluxo'::text) AND (flow_id IS NOT NULL)))),
  constraint "crm_scheduled_messages_kind_check" CHECK ((kind = ANY (ARRAY['mensagem'::text, 'fluxo'::text]))),
  constraint "crm_scheduled_messages_repeat_check" CHECK ((repeat = ANY (ARRAY['nao_repetir'::text, 'diario'::text, 'semanal'::text, 'mensal'::text]))),
  constraint "crm_scheduled_messages_status_check" CHECK ((status = ANY (ARRAY['pendente'::text, 'enviado'::text, 'cancelado'::text, 'falhou'::text])))
);

create table if not exists public."crm_settings" (
  "client_id" uuid not null,
  "greeting_message" text,
  "out_of_hours_message" text,
  "auto_assign" boolean default false not null,
  "resolve_after_minutes" integer default 0 not null,
  "timezone" text default 'America/Sao_Paulo'::text not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_settings_pkey" PRIMARY KEY (client_id)
);

create table if not exists public."crm_stages" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "pipeline_id" uuid not null,
  "name" text not null,
  "position" integer default 0 not null,
  "variant" text default 'normal'::text not null,
  "pos_x" double precision default 0 not null,
  "pos_y" double precision default 0 not null,
  constraint "crm_stages_pkey" PRIMARY KEY (id),
  constraint "crm_stages_variant_check" CHECK ((variant = ANY (ARRAY['normal'::text, 'won'::text, 'lost'::text])))
);

create table if not exists public."crm_subscription" (
  "client_id" uuid not null,
  "account_code" text,
  "status" text default 'ativa'::text not null,
  "slots_starter" integer default 0 not null,
  "slots_pro" integer default 0 not null,
  "price_cents" integer default 0 not null,
  "period_start" date,
  "period_end" date,
  "due_date" date,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_subscription_pkey" PRIMARY KEY (client_id),
  constraint "crm_subscription_status_check" CHECK ((status = ANY (ARRAY['ativa'::text, 'trial'::text, 'inadimplente'::text, 'cancelada'::text])))
);

create table if not exists public."crm_tags" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "color" text default '#6366f1'::text not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_tags_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_tasks" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "title" text not null,
  "due_at" timestamp with time zone,
  "done" boolean default false not null,
  "deal_id" uuid,
  "lead_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  constraint "crm_tasks_pkey" PRIMARY KEY (id)
);

create table if not exists public."crm_webhooks" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "token" uuid default gen_random_uuid() not null,
  "target" text default 'lead'::text not null,
  "mapping" jsonb default '{}'::jsonb not null,
  "kanban_column_id" uuid,
  "active" boolean default true not null,
  "received_count" integer default 0 not null,
  "last_received_at" timestamp with time zone,
  "last_payload" jsonb,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "connection_id" uuid,
  constraint "crm_webhooks_pkey" PRIMARY KEY (id),
  constraint "crm_webhooks_target_check" CHECK ((target = ANY (ARRAY['lead'::text, 'contato'::text, 'kanban'::text])))
);

create table if not exists public."crm_whatsapp_templates" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "name" text not null,
  "language" text default 'pt_BR'::text not null,
  "category" text default 'utility'::text not null,
  "header" text,
  "body" text not null,
  "footer" text,
  "buttons" jsonb default '[]'::jsonb not null,
  "status" text default 'rascunho'::text not null,
  "meta_template_id" text,
  "rejection_reason" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "crm_whatsapp_templates_pkey" PRIMARY KEY (id),
  constraint "crm_whatsapp_templates_category_check" CHECK ((category = ANY (ARRAY['marketing'::text, 'utility'::text, 'authentication'::text]))),
  constraint "crm_whatsapp_templates_status_check" CHECK ((status = ANY (ARRAY['rascunho'::text, 'pendente'::text, 'aprovado'::text, 'rejeitado'::text])))
);

create table if not exists public."integration_connections" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid,
  "provider" text not null,
  "status" text default 'not_connected'::text not null,
  "external_account" text,
  "config" jsonb default '{}'::jsonb not null,
  "connected_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "integration_connections_pkey" PRIMARY KEY (id),
  constraint "integration_connections_provider_check" CHECK ((provider = ANY (ARRAY['meta'::text, 'canva'::text, 'claude_cloud'::text, 'whatsapp'::text, 'frappe'::text]))),
  constraint "integration_connections_status_check" CHECK ((status = ANY (ARRAY['not_connected'::text, 'pending'::text, 'connected'::text, 'error'::text])))
);

create table if not exists public."integration_secrets" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "provider" text not null,
  "secret" text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "integration_secrets_pkey" PRIMARY KEY (id),
  constraint "integration_secrets_provider_check" CHECK ((provider = ANY (ARRAY['meta'::text, 'canva'::text, 'claude_cloud'::text, 'whatsapp'::text, 'frappe'::text])))
);

create table if not exists public."profiles" (
  "id" uuid not null,
  "role" text default 'client'::text not null,
  "client_id" uuid,
  "full_name" text,
  "created_at" timestamp with time zone default now() not null,
  "avatar_url" text,
  constraint "profiles_pkey" PRIMARY KEY (id),
  constraint "profiles_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'client'::text, 'financeiro'::text])))
);

create table if not exists public."site_configs" (
  "client_id" uuid not null,
  "config" jsonb default '{}'::jsonb not null,
  "published" boolean default false not null,
  "published_at" timestamp with time zone,
  "updated_at" timestamp with time zone default now() not null,
  constraint "site_configs_pkey" PRIMARY KEY (client_id)
);

create table if not exists public."workspace_members" (
  "id" uuid default gen_random_uuid() not null,
  "client_id" uuid not null,
  "profile_id" uuid,
  "email" text not null,
  "display_name" text,
  "role" text default 'membro'::text not null,
  "permissions" jsonb default '{}'::jsonb not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "workspace_members_pkey" PRIMARY KEY (id),
  constraint "workspace_members_role_check" CHECK ((role = ANY (ARRAY['proprietario'::text, 'admin'::text, 'membro'::text, 'atendente'::text, 'leitura'::text])))
);

create table if not exists public."workspace_settings" (
  "client_id" uuid not null,
  "notifications" jsonb default '{}'::jsonb not null,
  "preferences" jsonb default '{}'::jsonb not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "workspace_settings_pkey" PRIMARY KEY (client_id)
);


-- ------------------------------------------------------------------------
-- Chaves e restrições
-- ------------------------------------------------------------------------

alter table public."clients" drop constraint if exists "clients_workspace_slug_key";
alter table public."clients" add constraint "clients_workspace_slug_key" UNIQUE (workspace_slug);
alter table public."crm_agents" drop constraint if exists "crm_agents_client_id_fkey";
alter table public."crm_agents" add constraint "crm_agents_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_broadcast_settings" drop constraint if exists "crm_broadcast_settings_client_id_connection_id_key";
alter table public."crm_broadcast_settings" add constraint "crm_broadcast_settings_client_id_connection_id_key" UNIQUE (client_id, connection_id);
alter table public."crm_broadcast_settings" drop constraint if exists "crm_broadcast_settings_client_id_fkey";
alter table public."crm_broadcast_settings" add constraint "crm_broadcast_settings_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_broadcast_settings" drop constraint if exists "crm_broadcast_settings_connection_id_fkey";
alter table public."crm_broadcast_settings" add constraint "crm_broadcast_settings_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm_connections(id) ON DELETE CASCADE;
alter table public."crm_broadcast_settings" drop constraint if exists "crm_broadcast_settings_fluxo_atendimento_finalizado_fkey";
alter table public."crm_broadcast_settings" add constraint "crm_broadcast_settings_fluxo_atendimento_finalizado_fkey" FOREIGN KEY (fluxo_atendimento_finalizado) REFERENCES crm_flows(id) ON DELETE SET NULL;
alter table public."crm_broadcast_settings" drop constraint if exists "crm_broadcast_settings_fluxo_boas_vindas_fkey";
alter table public."crm_broadcast_settings" add constraint "crm_broadcast_settings_fluxo_boas_vindas_fkey" FOREIGN KEY (fluxo_boas_vindas) REFERENCES crm_flows(id) ON DELETE SET NULL;
alter table public."crm_broadcast_settings" drop constraint if exists "crm_broadcast_settings_fluxo_conversa_finalizada_fkey";
alter table public."crm_broadcast_settings" add constraint "crm_broadcast_settings_fluxo_conversa_finalizada_fkey" FOREIGN KEY (fluxo_conversa_finalizada) REFERENCES crm_flows(id) ON DELETE SET NULL;
alter table public."crm_broadcast_settings" drop constraint if exists "crm_broadcast_settings_fluxo_resposta_padrao_fkey";
alter table public."crm_broadcast_settings" add constraint "crm_broadcast_settings_fluxo_resposta_padrao_fkey" FOREIGN KEY (fluxo_resposta_padrao) REFERENCES crm_flows(id) ON DELETE SET NULL;
alter table public."crm_broadcast_targets" drop constraint if exists "crm_broadcast_targets_broadcast_id_fkey";
alter table public."crm_broadcast_targets" add constraint "crm_broadcast_targets_broadcast_id_fkey" FOREIGN KEY (broadcast_id) REFERENCES crm_broadcasts(id) ON DELETE CASCADE;
alter table public."crm_broadcast_targets" drop constraint if exists "crm_broadcast_targets_client_id_fkey";
alter table public."crm_broadcast_targets" add constraint "crm_broadcast_targets_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_broadcasts" drop constraint if exists "crm_broadcasts_client_id_fkey";
alter table public."crm_broadcasts" add constraint "crm_broadcasts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_broadcasts" drop constraint if exists "crm_broadcasts_connection_id_fkey";
alter table public."crm_broadcasts" add constraint "crm_broadcasts_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm_connections(id) ON DELETE SET NULL;
alter table public."crm_broadcasts" drop constraint if exists "crm_broadcasts_flow_id_fkey";
alter table public."crm_broadcasts" add constraint "crm_broadcasts_flow_id_fkey" FOREIGN KEY (flow_id) REFERENCES crm_flows(id) ON DELETE SET NULL;
alter table public."crm_broadcasts" drop constraint if exists "crm_broadcasts_template_id_fkey";
alter table public."crm_broadcasts" add constraint "crm_broadcasts_template_id_fkey" FOREIGN KEY (template_id) REFERENCES crm_whatsapp_templates(id) ON DELETE SET NULL;
alter table public."crm_calls" drop constraint if exists "crm_calls_client_id_fkey";
alter table public."crm_calls" add constraint "crm_calls_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_calls" drop constraint if exists "crm_calls_contact_id_fkey";
alter table public."crm_calls" add constraint "crm_calls_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL;
alter table public."crm_chat_field_values" drop constraint if exists "crm_chat_field_values_chat_id_field_id_key";
alter table public."crm_chat_field_values" add constraint "crm_chat_field_values_chat_id_field_id_key" UNIQUE (chat_id, field_id);
alter table public."crm_chat_field_values" drop constraint if exists "crm_chat_field_values_chat_id_fkey";
alter table public."crm_chat_field_values" add constraint "crm_chat_field_values_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES crm_chats(id) ON DELETE CASCADE;
alter table public."crm_chat_field_values" drop constraint if exists "crm_chat_field_values_client_id_fkey";
alter table public."crm_chat_field_values" add constraint "crm_chat_field_values_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_chat_field_values" drop constraint if exists "crm_chat_field_values_field_id_fkey";
alter table public."crm_chat_field_values" add constraint "crm_chat_field_values_field_id_fkey" FOREIGN KEY (field_id) REFERENCES crm_custom_fields(id) ON DELETE CASCADE;
alter table public."crm_chat_notes" drop constraint if exists "crm_chat_notes_chat_id_fkey";
alter table public."crm_chat_notes" add constraint "crm_chat_notes_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES crm_chats(id) ON DELETE CASCADE;
alter table public."crm_chat_notes" drop constraint if exists "crm_chat_notes_client_id_fkey";
alter table public."crm_chat_notes" add constraint "crm_chat_notes_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_chats" drop constraint if exists "crm_chats_assigned_to_fkey";
alter table public."crm_chats" add constraint "crm_chats_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;
alter table public."crm_chats" drop constraint if exists "crm_chats_client_id_fkey";
alter table public."crm_chats" add constraint "crm_chats_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_chats" drop constraint if exists "crm_chats_connection_id_fkey";
alter table public."crm_chats" add constraint "crm_chats_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm_connections(id) ON DELETE SET NULL;
alter table public."crm_chats" drop constraint if exists "crm_chats_contact_id_fkey";
alter table public."crm_chats" add constraint "crm_chats_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL;
alter table public."crm_chats" drop constraint if exists "crm_chats_department_id_fkey";
alter table public."crm_chats" add constraint "crm_chats_department_id_fkey" FOREIGN KEY (department_id) REFERENCES crm_departments(id) ON DELETE SET NULL;
alter table public."crm_chats" drop constraint if exists "crm_chats_kanban_card_id_fkey";
alter table public."crm_chats" add constraint "crm_chats_kanban_card_id_fkey" FOREIGN KEY (kanban_card_id) REFERENCES crm_kanban_cards(id) ON DELETE SET NULL;
alter table public."crm_connection_secrets" drop constraint if exists "crm_connection_secrets_connection_id_fkey";
alter table public."crm_connection_secrets" add constraint "crm_connection_secrets_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm_connections(id) ON DELETE CASCADE;
alter table public."crm_connections" drop constraint if exists "crm_connections_client_id_fkey";
alter table public."crm_connections" add constraint "crm_connections_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_contacts" drop constraint if exists "crm_contacts_client_id_fkey";
alter table public."crm_contacts" add constraint "crm_contacts_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_custom_fields" drop constraint if exists "crm_custom_fields_client_id_fkey";
alter table public."crm_custom_fields" add constraint "crm_custom_fields_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_dashboard_settings" drop constraint if exists "crm_dashboard_settings_client_id_fkey";
alter table public."crm_dashboard_settings" add constraint "crm_dashboard_settings_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_deals" drop constraint if exists "crm_deals_client_id_fkey";
alter table public."crm_deals" add constraint "crm_deals_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_deals" drop constraint if exists "crm_deals_contact_id_fkey";
alter table public."crm_deals" add constraint "crm_deals_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL;
alter table public."crm_deals" drop constraint if exists "crm_deals_pipeline_id_fkey";
alter table public."crm_deals" add constraint "crm_deals_pipeline_id_fkey" FOREIGN KEY (pipeline_id) REFERENCES crm_pipelines(id) ON DELETE SET NULL;
alter table public."crm_deals" drop constraint if exists "crm_deals_stage_id_fkey";
alter table public."crm_deals" add constraint "crm_deals_stage_id_fkey" FOREIGN KEY (stage_id) REFERENCES crm_stages(id) ON DELETE SET NULL;
alter table public."crm_departments" drop constraint if exists "crm_departments_client_id_name_key";
alter table public."crm_departments" add constraint "crm_departments_client_id_name_key" UNIQUE (client_id, name);
alter table public."crm_departments" drop constraint if exists "crm_departments_client_id_fkey";
alter table public."crm_departments" add constraint "crm_departments_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_disparo_regras" drop constraint if exists "crm_disparo_regras_client_id_fkey";
alter table public."crm_disparo_regras" add constraint "crm_disparo_regras_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_disparo_regras" drop constraint if exists "crm_disparo_regras_connection_id_fkey";
alter table public."crm_disparo_regras" add constraint "crm_disparo_regras_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm_connections(id) ON DELETE CASCADE;
alter table public."crm_disparo_regras" drop constraint if exists "crm_disparo_regras_flow_id_fkey";
alter table public."crm_disparo_regras" add constraint "crm_disparo_regras_flow_id_fkey" FOREIGN KEY (flow_id) REFERENCES crm_flows(id) ON DELETE SET NULL;
alter table public."crm_flow_folders" drop constraint if exists "crm_flow_folders_client_id_fkey";
alter table public."crm_flow_folders" add constraint "crm_flow_folders_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_flow_rodizio" drop constraint if exists "crm_flow_rodizio_chat_id_fkey";
alter table public."crm_flow_rodizio" add constraint "crm_flow_rodizio_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES crm_chats(id) ON DELETE CASCADE;
alter table public."crm_flow_rodizio" drop constraint if exists "crm_flow_rodizio_client_id_fkey";
alter table public."crm_flow_rodizio" add constraint "crm_flow_rodizio_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_flow_rodizio" drop constraint if exists "crm_flow_rodizio_flow_id_fkey";
alter table public."crm_flow_rodizio" add constraint "crm_flow_rodizio_flow_id_fkey" FOREIGN KEY (flow_id) REFERENCES crm_flows(id) ON DELETE CASCADE;
alter table public."crm_flow_runs" drop constraint if exists "crm_flow_runs_chat_id_fkey";
alter table public."crm_flow_runs" add constraint "crm_flow_runs_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES crm_chats(id) ON DELETE CASCADE;
alter table public."crm_flow_runs" drop constraint if exists "crm_flow_runs_client_id_fkey";
alter table public."crm_flow_runs" add constraint "crm_flow_runs_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_flow_runs" drop constraint if exists "crm_flow_runs_flow_id_fkey";
alter table public."crm_flow_runs" add constraint "crm_flow_runs_flow_id_fkey" FOREIGN KEY (flow_id) REFERENCES crm_flows(id) ON DELETE CASCADE;
alter table public."crm_flows" drop constraint if exists "crm_flows_client_id_fkey";
alter table public."crm_flows" add constraint "crm_flows_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_flows" drop constraint if exists "crm_flows_folder_id_fkey";
alter table public."crm_flows" add constraint "crm_flows_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES crm_flow_folders(id) ON DELETE SET NULL;
alter table public."crm_global_variables" drop constraint if exists "crm_global_variables_client_id_key_key";
alter table public."crm_global_variables" add constraint "crm_global_variables_client_id_key_key" UNIQUE (client_id, key);
alter table public."crm_global_variables" drop constraint if exists "crm_global_variables_client_id_fkey";
alter table public."crm_global_variables" add constraint "crm_global_variables_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_horario_config" drop constraint if exists "crm_horario_config_client_id_connection_id_key";
alter table public."crm_horario_config" add constraint "crm_horario_config_client_id_connection_id_key" UNIQUE (client_id, connection_id);
alter table public."crm_horario_config" drop constraint if exists "crm_horario_config_client_id_fkey";
alter table public."crm_horario_config" add constraint "crm_horario_config_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_horario_config" drop constraint if exists "crm_horario_config_connection_id_fkey";
alter table public."crm_horario_config" add constraint "crm_horario_config_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm_connections(id) ON DELETE CASCADE;
alter table public."crm_horario_config" drop constraint if exists "crm_horario_config_fluxo_fora_fkey";
alter table public."crm_horario_config" add constraint "crm_horario_config_fluxo_fora_fkey" FOREIGN KEY (fluxo_fora) REFERENCES crm_flows(id) ON DELETE SET NULL;
alter table public."crm_horario_janelas" drop constraint if exists "crm_horario_janelas_client_id_fkey";
alter table public."crm_horario_janelas" add constraint "crm_horario_janelas_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_horario_janelas" drop constraint if exists "crm_horario_janelas_connection_id_fkey";
alter table public."crm_horario_janelas" add constraint "crm_horario_janelas_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm_connections(id) ON DELETE CASCADE;
alter table public."crm_integration_secrets" drop constraint if exists "crm_integration_secrets_integration_id_fkey";
alter table public."crm_integration_secrets" add constraint "crm_integration_secrets_integration_id_fkey" FOREIGN KEY (integration_id) REFERENCES crm_integrations(id) ON DELETE CASCADE;
alter table public."crm_integrations" drop constraint if exists "crm_integrations_client_id_fkey";
alter table public."crm_integrations" add constraint "crm_integrations_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_invites" drop constraint if exists "crm_invites_client_id_fkey";
alter table public."crm_invites" add constraint "crm_invites_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_invoices" drop constraint if exists "crm_invoices_client_id_fkey";
alter table public."crm_invoices" add constraint "crm_invoices_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_kanban_cards" drop constraint if exists "crm_kanban_cards_client_id_fkey";
alter table public."crm_kanban_cards" add constraint "crm_kanban_cards_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_kanban_cards" drop constraint if exists "crm_kanban_cards_column_id_fkey";
alter table public."crm_kanban_cards" add constraint "crm_kanban_cards_column_id_fkey" FOREIGN KEY (column_id) REFERENCES crm_kanban_columns(id) ON DELETE CASCADE;
alter table public."crm_kanban_cards" drop constraint if exists "crm_kanban_cards_contact_id_fkey";
alter table public."crm_kanban_cards" add constraint "crm_kanban_cards_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL;
alter table public."crm_kanban_cards" drop constraint if exists "crm_kanban_cards_kanban_id_fkey";
alter table public."crm_kanban_cards" add constraint "crm_kanban_cards_kanban_id_fkey" FOREIGN KEY (kanban_id) REFERENCES crm_kanbans(id) ON DELETE CASCADE;
alter table public."crm_kanban_columns" drop constraint if exists "crm_kanban_columns_client_id_fkey";
alter table public."crm_kanban_columns" add constraint "crm_kanban_columns_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_kanban_columns" drop constraint if exists "crm_kanban_columns_kanban_id_fkey";
alter table public."crm_kanban_columns" add constraint "crm_kanban_columns_kanban_id_fkey" FOREIGN KEY (kanban_id) REFERENCES crm_kanbans(id) ON DELETE CASCADE;
alter table public."crm_kanbans" drop constraint if exists "crm_kanbans_client_id_fkey";
alter table public."crm_kanbans" add constraint "crm_kanbans_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_leads" drop constraint if exists "crm_leads_client_id_fkey";
alter table public."crm_leads" add constraint "crm_leads_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_mcp_tokens" drop constraint if exists "crm_mcp_tokens_client_id_fkey";
alter table public."crm_mcp_tokens" add constraint "crm_mcp_tokens_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_messages" drop constraint if exists "crm_messages_chat_id_fkey";
alter table public."crm_messages" add constraint "crm_messages_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES crm_chats(id) ON DELETE CASCADE;
alter table public."crm_messages" drop constraint if exists "crm_messages_client_id_fkey";
alter table public."crm_messages" add constraint "crm_messages_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_meta_assets" drop constraint if exists "crm_meta_assets_client_id_kind_external_id_key";
alter table public."crm_meta_assets" add constraint "crm_meta_assets_client_id_kind_external_id_key" UNIQUE (client_id, kind, external_id);
alter table public."crm_meta_assets" drop constraint if exists "crm_meta_assets_client_id_fkey";
alter table public."crm_meta_assets" add constraint "crm_meta_assets_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_meta_campaigns" drop constraint if exists "crm_meta_campaigns_client_id_campaign_id_day_key";
alter table public."crm_meta_campaigns" add constraint "crm_meta_campaigns_client_id_campaign_id_day_key" UNIQUE (client_id, campaign_id, day);
alter table public."crm_meta_campaigns" drop constraint if exists "crm_meta_campaigns_client_id_fkey";
alter table public."crm_meta_campaigns" add constraint "crm_meta_campaigns_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_notes" drop constraint if exists "crm_notes_client_id_fkey";
alter table public."crm_notes" add constraint "crm_notes_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_notes" drop constraint if exists "crm_notes_contact_id_fkey";
alter table public."crm_notes" add constraint "crm_notes_contact_id_fkey" FOREIGN KEY (contact_id) REFERENCES crm_contacts(id) ON DELETE SET NULL;
alter table public."crm_notes" drop constraint if exists "crm_notes_deal_id_fkey";
alter table public."crm_notes" add constraint "crm_notes_deal_id_fkey" FOREIGN KEY (deal_id) REFERENCES crm_deals(id) ON DELETE SET NULL;
alter table public."crm_notes" drop constraint if exists "crm_notes_lead_id_fkey";
alter table public."crm_notes" add constraint "crm_notes_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;
alter table public."crm_notifications" drop constraint if exists "crm_notifications_client_id_fkey";
alter table public."crm_notifications" add constraint "crm_notifications_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_pipelines" drop constraint if exists "crm_pipelines_client_id_fkey";
alter table public."crm_pipelines" add constraint "crm_pipelines_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_products" drop constraint if exists "crm_products_client_id_fkey";
alter table public."crm_products" add constraint "crm_products_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_quick_replies" drop constraint if exists "crm_quick_replies_client_id_shortcut_key";
alter table public."crm_quick_replies" add constraint "crm_quick_replies_client_id_shortcut_key" UNIQUE (client_id, shortcut);
alter table public."crm_quick_replies" drop constraint if exists "crm_quick_replies_client_id_fkey";
alter table public."crm_quick_replies" add constraint "crm_quick_replies_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_sales" drop constraint if exists "crm_sales_chat_id_fkey";
alter table public."crm_sales" add constraint "crm_sales_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES crm_chats(id) ON DELETE SET NULL;
alter table public."crm_sales" drop constraint if exists "crm_sales_client_id_fkey";
alter table public."crm_sales" add constraint "crm_sales_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_sales" drop constraint if exists "crm_sales_connection_id_fkey";
alter table public."crm_sales" add constraint "crm_sales_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm_connections(id) ON DELETE SET NULL;
alter table public."crm_sales" drop constraint if exists "crm_sales_deal_id_fkey";
alter table public."crm_sales" add constraint "crm_sales_deal_id_fkey" FOREIGN KEY (deal_id) REFERENCES crm_deals(id) ON DELETE SET NULL;
alter table public."crm_sales" drop constraint if exists "crm_sales_kanban_card_id_fkey";
alter table public."crm_sales" add constraint "crm_sales_kanban_card_id_fkey" FOREIGN KEY (kanban_card_id) REFERENCES crm_kanban_cards(id) ON DELETE CASCADE;
alter table public."crm_sales" drop constraint if exists "crm_sales_product_id_fkey";
alter table public."crm_sales" add constraint "crm_sales_product_id_fkey" FOREIGN KEY (product_id) REFERENCES crm_products(id) ON DELETE SET NULL;
alter table public."crm_scheduled_messages" drop constraint if exists "crm_scheduled_messages_chat_id_fkey";
alter table public."crm_scheduled_messages" add constraint "crm_scheduled_messages_chat_id_fkey" FOREIGN KEY (chat_id) REFERENCES crm_chats(id) ON DELETE CASCADE;
alter table public."crm_scheduled_messages" drop constraint if exists "crm_scheduled_messages_client_id_fkey";
alter table public."crm_scheduled_messages" add constraint "crm_scheduled_messages_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_scheduled_messages" drop constraint if exists "crm_scheduled_messages_flow_id_fkey";
alter table public."crm_scheduled_messages" add constraint "crm_scheduled_messages_flow_id_fkey" FOREIGN KEY (flow_id) REFERENCES crm_flows(id) ON DELETE CASCADE;
alter table public."crm_settings" drop constraint if exists "crm_settings_client_id_fkey";
alter table public."crm_settings" add constraint "crm_settings_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_stages" drop constraint if exists "crm_stages_client_id_fkey";
alter table public."crm_stages" add constraint "crm_stages_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_stages" drop constraint if exists "crm_stages_pipeline_id_fkey";
alter table public."crm_stages" add constraint "crm_stages_pipeline_id_fkey" FOREIGN KEY (pipeline_id) REFERENCES crm_pipelines(id) ON DELETE CASCADE;
alter table public."crm_subscription" drop constraint if exists "crm_subscription_client_id_fkey";
alter table public."crm_subscription" add constraint "crm_subscription_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_tags" drop constraint if exists "crm_tags_client_id_name_key";
alter table public."crm_tags" add constraint "crm_tags_client_id_name_key" UNIQUE (client_id, name);
alter table public."crm_tags" drop constraint if exists "crm_tags_client_id_fkey";
alter table public."crm_tags" add constraint "crm_tags_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_tasks" drop constraint if exists "crm_tasks_client_id_fkey";
alter table public."crm_tasks" add constraint "crm_tasks_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_tasks" drop constraint if exists "crm_tasks_deal_id_fkey";
alter table public."crm_tasks" add constraint "crm_tasks_deal_id_fkey" FOREIGN KEY (deal_id) REFERENCES crm_deals(id) ON DELETE SET NULL;
alter table public."crm_tasks" drop constraint if exists "crm_tasks_lead_id_fkey";
alter table public."crm_tasks" add constraint "crm_tasks_lead_id_fkey" FOREIGN KEY (lead_id) REFERENCES crm_leads(id) ON DELETE SET NULL;
alter table public."crm_webhooks" drop constraint if exists "crm_webhooks_client_id_fkey";
alter table public."crm_webhooks" add constraint "crm_webhooks_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."crm_webhooks" drop constraint if exists "crm_webhooks_connection_id_fkey";
alter table public."crm_webhooks" add constraint "crm_webhooks_connection_id_fkey" FOREIGN KEY (connection_id) REFERENCES crm_connections(id) ON DELETE SET NULL;
alter table public."crm_whatsapp_templates" drop constraint if exists "crm_whatsapp_templates_client_id_name_language_key";
alter table public."crm_whatsapp_templates" add constraint "crm_whatsapp_templates_client_id_name_language_key" UNIQUE (client_id, name, language);
alter table public."crm_whatsapp_templates" drop constraint if exists "crm_whatsapp_templates_client_id_fkey";
alter table public."crm_whatsapp_templates" add constraint "crm_whatsapp_templates_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."integration_connections" drop constraint if exists "integration_connections_client_id_provider_key";
alter table public."integration_connections" add constraint "integration_connections_client_id_provider_key" UNIQUE (client_id, provider);
alter table public."integration_connections" drop constraint if exists "integration_connections_client_id_fkey";
alter table public."integration_connections" add constraint "integration_connections_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."integration_secrets" drop constraint if exists "integration_secrets_client_id_provider_key";
alter table public."integration_secrets" add constraint "integration_secrets_client_id_provider_key" UNIQUE (client_id, provider);
alter table public."integration_secrets" drop constraint if exists "integration_secrets_client_id_fkey";
alter table public."integration_secrets" add constraint "integration_secrets_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."profiles" drop constraint if exists "profiles_client_id_fkey";
alter table public."profiles" add constraint "profiles_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
alter table public."profiles" drop constraint if exists "profiles_id_fkey";
alter table public."profiles" add constraint "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public."site_configs" drop constraint if exists "site_configs_client_id_fkey";
alter table public."site_configs" add constraint "site_configs_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."workspace_members" drop constraint if exists "workspace_members_client_id_email_key";
alter table public."workspace_members" add constraint "workspace_members_client_id_email_key" UNIQUE (client_id, email);
alter table public."workspace_members" drop constraint if exists "workspace_members_client_id_fkey";
alter table public."workspace_members" add constraint "workspace_members_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
alter table public."workspace_members" drop constraint if exists "workspace_members_profile_id_fkey";
alter table public."workspace_members" add constraint "workspace_members_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
alter table public."workspace_settings" drop constraint if exists "workspace_settings_client_id_fkey";
alter table public."workspace_settings" add constraint "workspace_settings_client_id_fkey" FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

-- ------------------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS crm_broadcast_targets_idx ON public.crm_broadcast_targets USING btree (broadcast_id, status);
CREATE INDEX IF NOT EXISTS crm_chat_field_values_chat_idx ON public.crm_chat_field_values USING btree (chat_id);
CREATE INDEX IF NOT EXISTS crm_chats_client_idx ON public.crm_chats USING btree (client_id, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS crm_chats_status_idx ON public.crm_chats USING btree (client_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS crm_chats_um_direct_por_pessoa ON public.crm_chats USING btree (client_id, ig_user_id) WHERE (ig_user_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS crm_chats_um_por_telefone ON public.crm_chats USING btree (client_id, phone) WHERE (phone IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_connections_client_idx ON public.crm_connections USING btree (client_id);
CREATE INDEX IF NOT EXISTS crm_connections_cloud_phone_id_idx ON public.crm_connections USING btree (cloud_phone_id) WHERE (cloud_phone_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS crm_custom_fields_chave_idx ON public.crm_custom_fields USING btree (client_id, key);
CREATE INDEX IF NOT EXISTS crm_deals_client_idx ON public.crm_deals USING btree (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_disparo_regras_conexao_idx ON public.crm_disparo_regras USING btree (client_id, connection_id, "position");
CREATE UNIQUE INDEX IF NOT EXISTS crm_flow_rodizio_da_vez_idx ON public.crm_flow_rodizio USING btree (flow_id, block_id) WHERE (chat_id IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS crm_flow_rodizio_por_chat_idx ON public.crm_flow_rodizio USING btree (flow_id, block_id, chat_id) WHERE (chat_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_flow_runs_aguardando_idx ON public.crm_flow_runs USING btree (chat_id) WHERE (status = 'aguardando'::text);
CREATE INDEX IF NOT EXISTS crm_flow_runs_chat_idx ON public.crm_flow_runs USING btree (chat_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_flow_runs_dormindo_idx ON public.crm_flow_runs USING btree (expires_at) WHERE (status = 'dormindo'::text);
CREATE INDEX IF NOT EXISTS crm_flow_runs_fila_idx ON public.crm_flow_runs USING btree (created_at) WHERE (status = 'pendente'::text);
CREATE UNIQUE INDEX IF NOT EXISTS crm_flow_runs_uma_viva_por_conversa ON public.crm_flow_runs USING btree (chat_id, flow_id) WHERE (status = ANY (ARRAY['pendente'::text, 'executando'::text, 'aguardando'::text]));
CREATE INDEX IF NOT EXISTS crm_flows_client_idx ON public.crm_flows USING btree (client_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS crm_horario_janelas_conexao_idx ON public.crm_horario_janelas USING btree (client_id, connection_id, weekday);
CREATE INDEX IF NOT EXISTS crm_kanban_cards_col_idx ON public.crm_kanban_cards USING btree (column_id, "position");
CREATE INDEX IF NOT EXISTS crm_leads_client_idx ON public.crm_leads USING btree (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS crm_messages_chat_idx ON public.crm_messages USING btree (chat_id, sent_at);
CREATE UNIQUE INDEX IF NOT EXISTS crm_messages_external_id_unico ON public.crm_messages USING btree (client_id, external_id) WHERE (external_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_meta_campaigns_day_idx ON public.crm_meta_campaigns USING btree (client_id, day DESC);
CREATE INDEX IF NOT EXISTS crm_sales_client_idx ON public.crm_sales USING btree (client_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_sales_client_occurred_idx ON public.crm_sales USING btree (client_id, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS crm_sales_deal_unico_idx ON public.crm_sales USING btree (deal_id) WHERE ((deal_id IS NOT NULL) AND (source = 'negocio-ganho'::text));
CREATE UNIQUE INDEX IF NOT EXISTS crm_sales_kanban_card_unico_idx ON public.crm_sales USING btree (kanban_card_id) WHERE (kanban_card_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS crm_sales_kanban_idx ON public.crm_sales USING btree (client_id, kanban_card_id);
CREATE INDEX IF NOT EXISTS crm_scheduled_chat_idx ON public.crm_scheduled_messages USING btree (chat_id, status);
CREATE INDEX IF NOT EXISTS crm_scheduled_fila_idx ON public.crm_scheduled_messages USING btree (client_id, status, run_at);
CREATE INDEX IF NOT EXISTS crm_tasks_client_idx ON public.crm_tasks USING btree (client_id, due_at);
CREATE UNIQUE INDEX IF NOT EXISTS crm_webhooks_token_idx ON public.crm_webhooks USING btree (token);

-- ------------------------------------------------------------------------
-- Funções
-- ------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.crm_coluna_deixou_de_converter()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(old.is_conversion, false) and not coalesce(new.is_conversion, false) then
    delete from public.crm_sales
    where kanban_card_id in (select id from public.crm_kanban_cards where column_id = new.id);
  end if;

  -- Marcou agora: os cartões que já estavam ali passam a valer.
  if not coalesce(old.is_conversion, false) and coalesce(new.is_conversion, false) then
    update public.crm_kanban_cards set updated_at = now() where column_id = new.id;
  end if;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.crm_kanban_para_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  converte boolean;
  nome_cliente text;
begin
  select coalesce(is_conversion, false) into converte
  from public.crm_kanban_columns
  where id = new.column_id;

  -- Saiu da etapa de ganho: a venda existia por causa da posição do cartão,
  -- então ela deixa de existir junto. O lançamento espelhado vai embora pela
  -- cascata da 0020. Arrastar de volta cria de novo.
  if not coalesce(converte, false) then
    delete from public.crm_sales where kanban_card_id = new.id;
    return new;
  end if;

  -- Cartão sem valor não vira receita. Um lançamento de R$ 0,00 não informa
  -- nada e ainda suja a lista de contas a receber.
  if coalesce(new.value, 0) <= 0 then
    return new;
  end if;

  select coalesce(nullif(trim(c.name), ''), nullif(trim(new.title), ''), 'Venda do Kanban')
    into nome_cliente
  from public.crm_kanban_cards k
  left join public.crm_contacts c on c.id = new.contact_id
  where k.id = new.id;

  insert into public.crm_sales (client_id, customer_name, amount, status, source, occurred_at, kanban_card_id)
  values (
    new.client_id,
    coalesce(nome_cliente, 'Venda do Kanban'),
    new.value,
    -- 'pendente' e não 'aprovada': ganhou o negócio, não recebeu o dinheiro.
    'pendente',
    'kanban',
    now(),
    new.id
  )
  -- `crm_sales` não tem updated_at: o espelho em Vendas é que carimba a
  -- hora, e é ele que a tela mostra.
  on conflict (kanban_card_id) where kanban_card_id is not null do update set
    customer_name = excluded.customer_name,
    amount        = excluded.amount,
    occurred_at   = excluded.occurred_at;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.crm_negocio_ganho_para_venda()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  nome text;
begin
  if new.status = 'ganho' then
    -- Nome do cliente: o do contato quando existir; senão o título do
    -- negócio, que é o que a pessoa reconhece na tela.
    select c.name into nome from public.crm_contacts c where c.id = new.contact_id;
    nome := coalesce(nullif(trim(nome), ''), new.title);

    insert into public.crm_sales (client_id, deal_id, customer_name, amount, status, source, occurred_at)
    values (new.client_id, new.id, nome, new.value, 'aprovada', 'negocio-ganho',
            coalesce(new.closed_at, now()))
    on conflict (deal_id) where deal_id is not null and source = 'negocio-ganho'
    do update set
      customer_name = excluded.customer_name,
      amount        = excluded.amount,
      -- Voltar pro "Ganho" reativa a venda que tinha sido recusada.
      status        = 'aprovada',
      occurred_at   = excluded.occurred_at;

  elsif tg_op = 'UPDATE' and old.status = 'ganho' then
    -- Saiu do ganho: a venda é recusada, e o espelho em Vendas vira
    -- cancelado pela seção 2. O registro fica — apagar esconderia que o
    -- número já esteve lá.
    update public.crm_sales
       set status = 'recusada'
     where deal_id = new.id and source = 'negocio-ganho';
  end if;

  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.crm_registrar_recebida(p_chat_id uuid, p_preview text, p_em timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update public.crm_chats
  set
    unread_count = unread_count + 1,
    last_message_at = p_em,
    last_message_preview = p_preview
  where id = p_chat_id;
$function$

;

CREATE OR REPLACE FUNCTION public.crm_venda_libera_espelho()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  perform set_config('crm.espelhando', '1', true);
  return old;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.current_client_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select client_id from public.profiles
   where id = auth.uid() and role = 'client';
$function$

;

CREATE OR REPLACE FUNCTION public.current_finance_client_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select client_id from public.profiles
   where id = auth.uid() and role in ('client', 'financeiro');
$function$

;

CREATE OR REPLACE FUNCTION public.excluir_cliente(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- `true` = vale só nesta transação. Sem isso o sinal vazaria pra próxima
  -- consulta que pegasse a mesma conexão do pool, e a trava do espelho ficaria
  -- desligada pra quem viesse depois.
  perform set_config('crm.espelhando', '1', true);
  delete from public.clients where id = p_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.finance_entry_espelho_protegida()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if coalesce(current_setting('crm.espelhando', true), '0') = '1' then
    return coalesce(new, old);
  end if;

  raise exception
    'Este lançamento é o espelho de uma venda do CRM e não se edita aqui. Altere a venda no CRM, que o restante acompanha sozinho.'
    using errcode = 'check_violation';
end;
$function$

;

CREATE OR REPLACE FUNCTION public.fn_agent_versions_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  raise exception '% é imutável: mudança = versão nova; rollback = mover o ponteiro (%)',
    tg_table_name, replace(tg_table_name, '_versions', '_pointers');
end;
$function$

;

CREATE OR REPLACE FUNCTION public.fn_ai_agent_version_content_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.status <> 'draft' and (
       new.system_prompt          is distinct from old.system_prompt
    or new.provider               is distinct from old.provider
    or new.model                  is distinct from old.model
    or new.credential_id          is distinct from old.credential_id
    or new.tool_ids               is distinct from old.tool_ids
    or new.trigger_config         is distinct from old.trigger_config
    or new.channel_session_id     is distinct from old.channel_session_id
    or new.max_steps              is distinct from old.max_steps
    or new.token_budget           is distinct from old.token_budget
    or new.cost_budget_cents      is distinct from old.cost_budget_cents
    or new.history_message_window is distinct from old.history_message_window
    or new.history_token_window   is distinct from old.history_token_window
    or new.handoff_keywords       is distinct from old.handoff_keywords
    or new.handoff_tool_enabled   is distinct from old.handoff_tool_enabled
    or new.followup               is distinct from old.followup
    or new.version_number         is distinct from old.version_number
    or new.agent_id               is distinct from old.agent_id
    or new.organization_id        is distinct from old.organization_id
  ) then
    raise exception 'ai_agent_versions % é imutável (status=%): mudança de conteúdo = versão draft nova; rollback = revert (clona + publica)',
      old.id, old.status;
  end if;
  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.fn_publish_followup_flow_version(p_org uuid, p_pointer uuid, p_graph jsonb, p_created_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pointer record;
  v_version_id uuid;
begin
  select p.id, p.organization_id
    into v_pointer
  from followup_flow_pointers p
  where p.id = p_pointer
  for update;

  if not found or v_pointer.organization_id <> p_org then
    raise exception 'pointer_not_found' using errcode = 'P0001';
  end if;

  insert into followup_flow_versions (organization_id, pointer_id, graph, created_by)
  values (p_org, p_pointer, p_graph, p_created_by)
  returning id into v_version_id;

  update followup_flow_pointers
     set active_version_id = v_version_id,
         status = 'active',
         updated_at = now()
   where id = p_pointer;

  return v_version_id;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.is_finance_only()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'financeiro'
  );
$function$

;

CREATE OR REPLACE FUNCTION public.is_owner()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  );
$function$

;

CREATE OR REPLACE FUNCTION public.provision_client_crm(p_client_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.crm_settings (client_id)
  values (p_client_id)
  on conflict (client_id) do nothing;

  insert into public.crm_dashboard_settings (client_id)
  values (p_client_id)
  on conflict (client_id) do nothing;

  insert into public.crm_subscription (client_id, account_code, status, period_start)
  values (p_client_id, upper(substr(replace(p_client_id::text, '-', ''), 1, 6)), 'trial', current_date)
  on conflict (client_id) do nothing;
end;
$function$

;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$

;


-- ------------------------------------------------------------------------
-- Gatilhos
-- ------------------------------------------------------------------------

drop trigger if exists "clients_set_updated_at" on public."clients";
CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_agents_set_updated_at" on public."crm_agents";
CREATE TRIGGER crm_agents_set_updated_at BEFORE UPDATE ON public.crm_agents FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_broadcast_settings_set_updated_at" on public."crm_broadcast_settings";
CREATE TRIGGER crm_broadcast_settings_set_updated_at BEFORE UPDATE ON public.crm_broadcast_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_broadcasts_set_updated_at" on public."crm_broadcasts";
CREATE TRIGGER crm_broadcasts_set_updated_at BEFORE UPDATE ON public.crm_broadcasts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_chats_set_updated_at" on public."crm_chats";
CREATE TRIGGER crm_chats_set_updated_at BEFORE UPDATE ON public.crm_chats FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_connection_secrets_set_updated_at" on public."crm_connection_secrets";
CREATE TRIGGER crm_connection_secrets_set_updated_at BEFORE UPDATE ON public.crm_connection_secrets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_connections_set_updated_at" on public."crm_connections";
CREATE TRIGGER crm_connections_set_updated_at BEFORE UPDATE ON public.crm_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_contacts_set_updated_at" on public."crm_contacts";
CREATE TRIGGER crm_contacts_set_updated_at BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_dashboard_settings_set_updated_at" on public."crm_dashboard_settings";
CREATE TRIGGER crm_dashboard_settings_set_updated_at BEFORE UPDATE ON public.crm_dashboard_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_deals_gera_venda" on public."crm_deals";
CREATE TRIGGER crm_deals_gera_venda AFTER INSERT OR UPDATE OF status, value, contact_id, title, closed_at ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION crm_negocio_ganho_para_venda();
drop trigger if exists "crm_deals_set_updated_at" on public."crm_deals";
CREATE TRIGGER crm_deals_set_updated_at BEFORE UPDATE ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_flows_set_updated_at" on public."crm_flows";
CREATE TRIGGER crm_flows_set_updated_at BEFORE UPDATE ON public.crm_flows FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_global_variables_set_updated_at" on public."crm_global_variables";
CREATE TRIGGER crm_global_variables_set_updated_at BEFORE UPDATE ON public.crm_global_variables FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_integrations_set_updated_at" on public."crm_integrations";
CREATE TRIGGER crm_integrations_set_updated_at BEFORE UPDATE ON public.crm_integrations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_kanban_cards_gera_venda" on public."crm_kanban_cards";
CREATE TRIGGER crm_kanban_cards_gera_venda AFTER INSERT OR UPDATE OF column_id, value, contact_id, title ON public.crm_kanban_cards FOR EACH ROW EXECUTE FUNCTION crm_kanban_para_venda();
drop trigger if exists "crm_kanban_cards_set_updated_at" on public."crm_kanban_cards";
CREATE TRIGGER crm_kanban_cards_set_updated_at BEFORE UPDATE ON public.crm_kanban_cards FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_kanban_columns_conversao" on public."crm_kanban_columns";
CREATE TRIGGER crm_kanban_columns_conversao AFTER UPDATE OF is_conversion ON public.crm_kanban_columns FOR EACH ROW EXECUTE FUNCTION crm_coluna_deixou_de_converter();
drop trigger if exists "crm_kanbans_set_updated_at" on public."crm_kanbans";
CREATE TRIGGER crm_kanbans_set_updated_at BEFORE UPDATE ON public.crm_kanbans FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_leads_set_updated_at" on public."crm_leads";
CREATE TRIGGER crm_leads_set_updated_at BEFORE UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_notes_set_updated_at" on public."crm_notes";
CREATE TRIGGER crm_notes_set_updated_at BEFORE UPDATE ON public.crm_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_products_set_updated_at" on public."crm_products";
CREATE TRIGGER crm_products_set_updated_at BEFORE UPDATE ON public.crm_products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_quick_replies_set_updated_at" on public."crm_quick_replies";
CREATE TRIGGER crm_quick_replies_set_updated_at BEFORE UPDATE ON public.crm_quick_replies FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_sales_libera_espelho" on public."crm_sales";
CREATE TRIGGER crm_sales_libera_espelho BEFORE DELETE ON public.crm_sales FOR EACH ROW EXECUTE FUNCTION crm_venda_libera_espelho();
drop trigger if exists "crm_settings_set_updated_at" on public."crm_settings";
CREATE TRIGGER crm_settings_set_updated_at BEFORE UPDATE ON public.crm_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_subscription_set_updated_at" on public."crm_subscription";
CREATE TRIGGER crm_subscription_set_updated_at BEFORE UPDATE ON public.crm_subscription FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_webhooks_set_updated_at" on public."crm_webhooks";
CREATE TRIGGER crm_webhooks_set_updated_at BEFORE UPDATE ON public.crm_webhooks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "crm_whatsapp_templates_set_updated_at" on public."crm_whatsapp_templates";
CREATE TRIGGER crm_whatsapp_templates_set_updated_at BEFORE UPDATE ON public.crm_whatsapp_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "integration_connections_set_updated_at" on public."integration_connections";
CREATE TRIGGER integration_connections_set_updated_at BEFORE UPDATE ON public.integration_connections FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "integration_secrets_set_updated_at" on public."integration_secrets";
CREATE TRIGGER integration_secrets_set_updated_at BEFORE UPDATE ON public.integration_secrets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "site_configs_set_updated_at" on public."site_configs";
CREATE TRIGGER site_configs_set_updated_at BEFORE UPDATE ON public.site_configs FOR EACH ROW EXECUTE FUNCTION set_updated_at();
drop trigger if exists "workspace_settings_set_updated_at" on public."workspace_settings";
CREATE TRIGGER workspace_settings_set_updated_at BEFORE UPDATE ON public.workspace_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------------
-- Row Level Security
-- ------------------------------------------------------------------------

alter table public."clients" enable row level security;
alter table public."crm_agents" enable row level security;
alter table public."crm_broadcast_settings" enable row level security;
alter table public."crm_broadcast_targets" enable row level security;
alter table public."crm_broadcasts" enable row level security;
alter table public."crm_calls" enable row level security;
alter table public."crm_chat_field_values" enable row level security;
alter table public."crm_chat_notes" enable row level security;
alter table public."crm_chats" enable row level security;
alter table public."crm_connection_secrets" enable row level security;
alter table public."crm_connections" enable row level security;
alter table public."crm_contacts" enable row level security;
alter table public."crm_custom_fields" enable row level security;
alter table public."crm_dashboard_settings" enable row level security;
alter table public."crm_deals" enable row level security;
alter table public."crm_departments" enable row level security;
alter table public."crm_disparo_regras" enable row level security;
alter table public."crm_flow_folders" enable row level security;
alter table public."crm_flow_rodizio" enable row level security;
alter table public."crm_flow_runs" enable row level security;
alter table public."crm_flows" enable row level security;
alter table public."crm_global_variables" enable row level security;
alter table public."crm_horario_config" enable row level security;
alter table public."crm_horario_janelas" enable row level security;
alter table public."crm_integration_secrets" enable row level security;
alter table public."crm_integrations" enable row level security;
alter table public."crm_invites" enable row level security;
alter table public."crm_invoices" enable row level security;
alter table public."crm_kanban_cards" enable row level security;
alter table public."crm_kanban_columns" enable row level security;
alter table public."crm_kanbans" enable row level security;
alter table public."crm_leads" enable row level security;
alter table public."crm_mcp_tokens" enable row level security;
alter table public."crm_messages" enable row level security;
alter table public."crm_meta_assets" enable row level security;
alter table public."crm_meta_campaigns" enable row level security;
alter table public."crm_notes" enable row level security;
alter table public."crm_notifications" enable row level security;
alter table public."crm_pipelines" enable row level security;
alter table public."crm_products" enable row level security;
alter table public."crm_quick_replies" enable row level security;
alter table public."crm_sales" enable row level security;
alter table public."crm_scheduled_messages" enable row level security;
alter table public."crm_settings" enable row level security;
alter table public."crm_stages" enable row level security;
alter table public."crm_subscription" enable row level security;
alter table public."crm_tags" enable row level security;
alter table public."crm_tasks" enable row level security;
alter table public."crm_webhooks" enable row level security;
alter table public."crm_whatsapp_templates" enable row level security;
alter table public."integration_connections" enable row level security;
alter table public."integration_secrets" enable row level security;
alter table public."profiles" enable row level security;
alter table public."site_configs" enable row level security;
alter table public."workspace_members" enable row level security;
alter table public."workspace_settings" enable row level security;

drop policy if exists "clients_client_select_own" on public."clients";
create policy "clients_client_select_own" on public."clients" as permissive for select to public
  using ((id = current_client_id()));
drop policy if exists "clients_financeiro_select_own" on public."clients";
create policy "clients_financeiro_select_own" on public."clients" as permissive for select to public
  using ((id = current_finance_client_id()));
drop policy if exists "clients_owner_all" on public."clients";
create policy "clients_owner_all" on public."clients" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_agents_client_own" on public."crm_agents";
create policy "crm_agents_client_own" on public."crm_agents" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_agents_owner_all" on public."crm_agents";
create policy "crm_agents_owner_all" on public."crm_agents" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_broadcast_settings_client_own" on public."crm_broadcast_settings";
create policy "crm_broadcast_settings_client_own" on public."crm_broadcast_settings" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_broadcast_settings_owner_all" on public."crm_broadcast_settings";
create policy "crm_broadcast_settings_owner_all" on public."crm_broadcast_settings" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_broadcast_targets_client_own" on public."crm_broadcast_targets";
create policy "crm_broadcast_targets_client_own" on public."crm_broadcast_targets" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_broadcast_targets_owner_all" on public."crm_broadcast_targets";
create policy "crm_broadcast_targets_owner_all" on public."crm_broadcast_targets" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_broadcasts_client_own" on public."crm_broadcasts";
create policy "crm_broadcasts_client_own" on public."crm_broadcasts" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_broadcasts_owner_all" on public."crm_broadcasts";
create policy "crm_broadcasts_owner_all" on public."crm_broadcasts" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_calls_client_own" on public."crm_calls";
create policy "crm_calls_client_own" on public."crm_calls" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_calls_owner_all" on public."crm_calls";
create policy "crm_calls_owner_all" on public."crm_calls" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_chat_field_values_client_own" on public."crm_chat_field_values";
create policy "crm_chat_field_values_client_own" on public."crm_chat_field_values" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_chat_field_values_owner_all" on public."crm_chat_field_values";
create policy "crm_chat_field_values_owner_all" on public."crm_chat_field_values" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_chat_notes_client_own" on public."crm_chat_notes";
create policy "crm_chat_notes_client_own" on public."crm_chat_notes" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_chat_notes_owner_all" on public."crm_chat_notes";
create policy "crm_chat_notes_owner_all" on public."crm_chat_notes" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_chats_client_own" on public."crm_chats";
create policy "crm_chats_client_own" on public."crm_chats" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_chats_owner_all" on public."crm_chats";
create policy "crm_chats_owner_all" on public."crm_chats" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_connections_client_own" on public."crm_connections";
create policy "crm_connections_client_own" on public."crm_connections" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_connections_owner_all" on public."crm_connections";
create policy "crm_connections_owner_all" on public."crm_connections" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_contacts_client_own" on public."crm_contacts";
create policy "crm_contacts_client_own" on public."crm_contacts" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_contacts_owner_all" on public."crm_contacts";
create policy "crm_contacts_owner_all" on public."crm_contacts" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_custom_fields_client_own" on public."crm_custom_fields";
create policy "crm_custom_fields_client_own" on public."crm_custom_fields" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_custom_fields_owner_all" on public."crm_custom_fields";
create policy "crm_custom_fields_owner_all" on public."crm_custom_fields" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_dashboard_settings_client_own" on public."crm_dashboard_settings";
create policy "crm_dashboard_settings_client_own" on public."crm_dashboard_settings" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_dashboard_settings_owner_all" on public."crm_dashboard_settings";
create policy "crm_dashboard_settings_owner_all" on public."crm_dashboard_settings" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_deals_client_own" on public."crm_deals";
create policy "crm_deals_client_own" on public."crm_deals" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_deals_owner_all" on public."crm_deals";
create policy "crm_deals_owner_all" on public."crm_deals" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_departments_client_own" on public."crm_departments";
create policy "crm_departments_client_own" on public."crm_departments" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_departments_owner_all" on public."crm_departments";
create policy "crm_departments_owner_all" on public."crm_departments" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_disparo_regras_client_own" on public."crm_disparo_regras";
create policy "crm_disparo_regras_client_own" on public."crm_disparo_regras" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_disparo_regras_owner_all" on public."crm_disparo_regras";
create policy "crm_disparo_regras_owner_all" on public."crm_disparo_regras" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_flow_folders_client_own" on public."crm_flow_folders";
create policy "crm_flow_folders_client_own" on public."crm_flow_folders" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_flow_folders_owner_all" on public."crm_flow_folders";
create policy "crm_flow_folders_owner_all" on public."crm_flow_folders" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_flow_runs_client_own" on public."crm_flow_runs";
create policy "crm_flow_runs_client_own" on public."crm_flow_runs" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_flow_runs_owner_all" on public."crm_flow_runs";
create policy "crm_flow_runs_owner_all" on public."crm_flow_runs" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_flows_client_own" on public."crm_flows";
create policy "crm_flows_client_own" on public."crm_flows" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_flows_owner_all" on public."crm_flows";
create policy "crm_flows_owner_all" on public."crm_flows" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_global_variables_client_own" on public."crm_global_variables";
create policy "crm_global_variables_client_own" on public."crm_global_variables" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_global_variables_owner_all" on public."crm_global_variables";
create policy "crm_global_variables_owner_all" on public."crm_global_variables" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_horario_config_client_own" on public."crm_horario_config";
create policy "crm_horario_config_client_own" on public."crm_horario_config" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_horario_config_owner_all" on public."crm_horario_config";
create policy "crm_horario_config_owner_all" on public."crm_horario_config" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_horario_janelas_client_own" on public."crm_horario_janelas";
create policy "crm_horario_janelas_client_own" on public."crm_horario_janelas" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_horario_janelas_owner_all" on public."crm_horario_janelas";
create policy "crm_horario_janelas_owner_all" on public."crm_horario_janelas" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_integrations_client_own" on public."crm_integrations";
create policy "crm_integrations_client_own" on public."crm_integrations" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_integrations_owner_all" on public."crm_integrations";
create policy "crm_integrations_owner_all" on public."crm_integrations" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_invites_client_own" on public."crm_invites";
create policy "crm_invites_client_own" on public."crm_invites" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_invites_owner_all" on public."crm_invites";
create policy "crm_invites_owner_all" on public."crm_invites" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_invoices_client_own" on public."crm_invoices";
create policy "crm_invoices_client_own" on public."crm_invoices" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_invoices_owner_all" on public."crm_invoices";
create policy "crm_invoices_owner_all" on public."crm_invoices" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_kanban_cards_client_own" on public."crm_kanban_cards";
create policy "crm_kanban_cards_client_own" on public."crm_kanban_cards" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_kanban_cards_owner_all" on public."crm_kanban_cards";
create policy "crm_kanban_cards_owner_all" on public."crm_kanban_cards" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_kanban_columns_client_own" on public."crm_kanban_columns";
create policy "crm_kanban_columns_client_own" on public."crm_kanban_columns" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_kanban_columns_owner_all" on public."crm_kanban_columns";
create policy "crm_kanban_columns_owner_all" on public."crm_kanban_columns" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_kanbans_client_own" on public."crm_kanbans";
create policy "crm_kanbans_client_own" on public."crm_kanbans" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_kanbans_owner_all" on public."crm_kanbans";
create policy "crm_kanbans_owner_all" on public."crm_kanbans" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_leads_client_own" on public."crm_leads";
create policy "crm_leads_client_own" on public."crm_leads" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_leads_owner_all" on public."crm_leads";
create policy "crm_leads_owner_all" on public."crm_leads" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_mcp_tokens_client_own" on public."crm_mcp_tokens";
create policy "crm_mcp_tokens_client_own" on public."crm_mcp_tokens" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_mcp_tokens_owner_all" on public."crm_mcp_tokens";
create policy "crm_mcp_tokens_owner_all" on public."crm_mcp_tokens" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_messages_client_own" on public."crm_messages";
create policy "crm_messages_client_own" on public."crm_messages" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_messages_owner_all" on public."crm_messages";
create policy "crm_messages_owner_all" on public."crm_messages" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_meta_assets_client_own" on public."crm_meta_assets";
create policy "crm_meta_assets_client_own" on public."crm_meta_assets" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_meta_assets_owner_all" on public."crm_meta_assets";
create policy "crm_meta_assets_owner_all" on public."crm_meta_assets" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_meta_campaigns_client_own" on public."crm_meta_campaigns";
create policy "crm_meta_campaigns_client_own" on public."crm_meta_campaigns" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_meta_campaigns_owner_all" on public."crm_meta_campaigns";
create policy "crm_meta_campaigns_owner_all" on public."crm_meta_campaigns" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_notes_client_own" on public."crm_notes";
create policy "crm_notes_client_own" on public."crm_notes" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_notes_owner_all" on public."crm_notes";
create policy "crm_notes_owner_all" on public."crm_notes" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_notifications_client_own" on public."crm_notifications";
create policy "crm_notifications_client_own" on public."crm_notifications" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_notifications_owner_all" on public."crm_notifications";
create policy "crm_notifications_owner_all" on public."crm_notifications" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_pipelines_client_own" on public."crm_pipelines";
create policy "crm_pipelines_client_own" on public."crm_pipelines" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_pipelines_owner_all" on public."crm_pipelines";
create policy "crm_pipelines_owner_all" on public."crm_pipelines" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_products_client_own" on public."crm_products";
create policy "crm_products_client_own" on public."crm_products" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_products_owner_all" on public."crm_products";
create policy "crm_products_owner_all" on public."crm_products" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_quick_replies_client_own" on public."crm_quick_replies";
create policy "crm_quick_replies_client_own" on public."crm_quick_replies" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_quick_replies_owner_all" on public."crm_quick_replies";
create policy "crm_quick_replies_owner_all" on public."crm_quick_replies" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_sales_client_own" on public."crm_sales";
create policy "crm_sales_client_own" on public."crm_sales" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_sales_owner_all" on public."crm_sales";
create policy "crm_sales_owner_all" on public."crm_sales" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_scheduled_messages_client_own" on public."crm_scheduled_messages";
create policy "crm_scheduled_messages_client_own" on public."crm_scheduled_messages" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_scheduled_messages_owner_all" on public."crm_scheduled_messages";
create policy "crm_scheduled_messages_owner_all" on public."crm_scheduled_messages" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_settings_client_own" on public."crm_settings";
create policy "crm_settings_client_own" on public."crm_settings" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_settings_owner_all" on public."crm_settings";
create policy "crm_settings_owner_all" on public."crm_settings" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_stages_client_own" on public."crm_stages";
create policy "crm_stages_client_own" on public."crm_stages" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_stages_owner_all" on public."crm_stages";
create policy "crm_stages_owner_all" on public."crm_stages" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_subscription_client_own" on public."crm_subscription";
create policy "crm_subscription_client_own" on public."crm_subscription" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_subscription_owner_all" on public."crm_subscription";
create policy "crm_subscription_owner_all" on public."crm_subscription" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_tags_client_own" on public."crm_tags";
create policy "crm_tags_client_own" on public."crm_tags" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_tags_owner_all" on public."crm_tags";
create policy "crm_tags_owner_all" on public."crm_tags" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_tasks_client_own" on public."crm_tasks";
create policy "crm_tasks_client_own" on public."crm_tasks" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_tasks_owner_all" on public."crm_tasks";
create policy "crm_tasks_owner_all" on public."crm_tasks" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_webhooks_client_own" on public."crm_webhooks";
create policy "crm_webhooks_client_own" on public."crm_webhooks" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_webhooks_owner_all" on public."crm_webhooks";
create policy "crm_webhooks_owner_all" on public."crm_webhooks" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "crm_whatsapp_templates_client_own" on public."crm_whatsapp_templates";
create policy "crm_whatsapp_templates_client_own" on public."crm_whatsapp_templates" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "crm_whatsapp_templates_owner_all" on public."crm_whatsapp_templates";
create policy "crm_whatsapp_templates_owner_all" on public."crm_whatsapp_templates" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "integration_connections_client_own" on public."integration_connections";
create policy "integration_connections_client_own" on public."integration_connections" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "integration_connections_owner_all" on public."integration_connections";
create policy "integration_connections_owner_all" on public."integration_connections" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "profiles_owner_manage_role" on public."profiles";
create policy "profiles_owner_manage_role" on public."profiles" as permissive for update to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "profiles_select_own_or_owner" on public."profiles";
create policy "profiles_select_own_or_owner" on public."profiles" as permissive for select to public
  using (((id = auth.uid()) OR is_owner()));
drop policy if exists "profiles_update_own" on public."profiles";
create policy "profiles_update_own" on public."profiles" as permissive for update to public
  using ((id = auth.uid()))
  with check ((id = auth.uid()));
drop policy if exists "site_configs_client_own" on public."site_configs";
create policy "site_configs_client_own" on public."site_configs" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "site_configs_owner_all" on public."site_configs";
create policy "site_configs_owner_all" on public."site_configs" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "workspace_members_client_own" on public."workspace_members";
create policy "workspace_members_client_own" on public."workspace_members" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "workspace_members_owner_all" on public."workspace_members";
create policy "workspace_members_owner_all" on public."workspace_members" as permissive for all to public
  using (is_owner())
  with check (is_owner());
drop policy if exists "workspace_settings_client_own" on public."workspace_settings";
create policy "workspace_settings_client_own" on public."workspace_settings" as permissive for all to public
  using ((client_id = current_client_id()))
  with check ((client_id = current_client_id()));
drop policy if exists "workspace_settings_owner_all" on public."workspace_settings";
create policy "workspace_settings_owner_all" on public."workspace_settings" as permissive for all to public
  using (is_owner())
  with check (is_owner());

-- SEM NENHUMA POLICY, E DE PROPÓSITO.
--
-- RLS ligada e zero policy significa: ninguém lê, ninguém escreve, nem
-- estando logado. Só a chave de serviço, que roda no servidor, alcança.
-- É onde ficam os tokens.
--
-- Se você criar uma policy aqui para "resolver" um erro de permissão, o
-- token do seu WhatsApp passa a ser legível pelo navegador de qualquer
-- pessoa logada. O erro certo se resolve no servidor, não aqui.
--
--   crm_connection_secrets
--   crm_flow_rodizio
--   crm_integration_secrets
--   integration_secrets
