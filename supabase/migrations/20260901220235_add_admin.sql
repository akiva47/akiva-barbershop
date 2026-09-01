-- Make Akiva an admin. Without a row here an account can sign in and still see
-- nothing: every policy on the sensitive tables checks this table, not merely
-- whether you are logged in.
insert into public.admins (user_id)
values ('284d6ce1-17e4-41bc-989d-c10418a356da')
on conflict (user_id) do nothing;
