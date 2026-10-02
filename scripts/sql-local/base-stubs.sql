-- project_admin como en produccion: NO superusuario, BYPASSRLS; las migraciones corren como este rol y es dueño de todo.
create role project_admin bypassrls;
create role anon;
create role authenticated;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, profile jsonb default '{}'::jsonb, metadata jsonb, email_verified boolean default false, created_at timestamptz default now());
create function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create function auth.role() returns text language sql stable as $$ select nullif(auth.jwt() ->> 'role', '')::text $$;
grant usage on schema auth to anon, authenticated;
create schema realtime;
create table realtime.channels (id uuid primary key default gen_random_uuid(), pattern text not null unique, description text, webhook_urls text[], enabled boolean not null default true, created_at timestamptz default now());
create table realtime.messages (id uuid primary key default gen_random_uuid(), event_name text, channel_name text, payload jsonb, created_at timestamptz default now());
create function realtime.publish(p_channel_name text, p_event_name text, p_payload jsonb) returns uuid language plpgsql security definer as $$
declare v_channel_id uuid; v_message_id uuid;
begin
  select id into v_channel_id from realtime.channels where enabled = true and (pattern = p_channel_name or p_channel_name like pattern) order by pattern = p_channel_name desc limit 1;
  if v_channel_id is null then raise warning 'Realtime: No matching channel found for "%"', p_channel_name; return null; end if;
  insert into realtime.messages (event_name, channel_name, payload) values (p_event_name, p_channel_name, p_payload) returning id into v_message_id;
  return v_message_id;
end $$;
create function realtime.channel_name() returns text language sql stable as $$ select current_setting('realtime.channel_name', true) $$;
create schema storage;
create table storage.buckets (name text primary key, public boolean default false);
create table storage.objects (bucket text, key text, size bigint, primary key (bucket, key));
create extension if not exists pgcrypto;

-- Privilegios por defecto como en produccion (pg_default_acl, leido el 2026-10-01): lo que crea project_admin en public
-- da arwd a anon/authenticated en tablas y rU en secuencias; las funciones NO tienen ACL por defecto (EXECUTE a PUBLIC).
grant all on schema public to project_admin;
grant usage on schema public to anon, authenticated;
grant usage on schema auth, realtime, storage to project_admin;
alter table auth.users owner to project_admin;
alter table realtime.channels owner to project_admin;
alter table realtime.messages owner to project_admin;
alter table storage.buckets owner to project_admin;
alter table storage.objects owner to project_admin;
alter default privileges for role project_admin in schema public grant select, insert, update, delete on tables to anon, authenticated;
alter default privileges for role project_admin in schema public grant usage, select on sequences to anon, authenticated;
