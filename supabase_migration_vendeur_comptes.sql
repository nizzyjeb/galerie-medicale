-- ============================================================
-- GALERIE MEDICALE - Migration : vendeur sur factures + correctif comptes
-- A executer UNE FOIS dans Supabase > SQL Editor > New Query > Run
-- (idempotent : peut etre relance sans risque)
-- ============================================================

-- 1) Nom du vendeur sur les factures / pro formas
alter table public.factures add column if not exists vendeur text;

-- 2) Confirmer immediatement les comptes crees depuis l'application
--    (sinon Supabase exige un clic sur un email de confirmation et
--     la connexion echoue avec "Email not confirmed")
create or replace function public.admin_confirmer_utilisateur(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and actif = true) then
    raise exception 'Reserve aux administrateurs';
  end if;
  update auth.users
     set email_confirmed_at = coalesce(email_confirmed_at, now())
   where id = p_user_id;
end;
$$;
revoke all on function public.admin_confirmer_utilisateur(uuid) from public, anon;
grant execute on function public.admin_confirmer_utilisateur(uuid) to authenticated;

-- 3) Permettre a un administrateur de redefinir le mot de passe d'un utilisateur
create extension if not exists pgcrypto with schema extensions;

create or replace function public.admin_definir_mot_de_passe(p_user_id uuid, p_password text)
returns void language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and actif = true) then
    raise exception 'Reserve aux administrateurs';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Mot de passe trop court (6 caracteres minimum)';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         updated_at = now()
   where id = p_user_id;
end;
$$;
revoke all on function public.admin_definir_mot_de_passe(uuid, text) from public, anon;
grant execute on function public.admin_definir_mot_de_passe(uuid, text) to authenticated;

-- 4) CORRECTIF IMMEDIAT : confirmer tous les comptes deja crees et bloques
--    (dont celui de Jeffrey) et les marquer actifs
update auth.users u
   set email_confirmed_at = now()
 where u.email_confirmed_at is null
   and exists (select 1 from public.profiles p where p.id = u.id);

update public.profiles set actif = true where actif is null;

-- Verification : liste des comptes et de leur etat
select u.email, p.nom, p.role, p.actif, u.email_confirmed_at is not null as confirme, u.last_sign_in_at
  from auth.users u left join public.profiles p on p.id = u.id
 order by u.created_at desc;
