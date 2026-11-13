-- The Edge Function "push" reads and writes through the service role, which
-- had no table privileges in this project, so every call was refused (403).
grant usage on schema public to service_role;
grant select on public.notify_settings to service_role;
grant select, delete on public.push_subscriptions to service_role;
grant select, update on public.appointments to service_role;
grant select on public.services to service_role;
