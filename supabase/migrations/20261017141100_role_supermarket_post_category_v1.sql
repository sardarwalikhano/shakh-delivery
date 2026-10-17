-- Allow roles that can manage/publish marketplace listings to create supermarket posts.
-- Run only after 20261017141000_add_supermarket_post_category_enum_v1 is committed.
begin;

insert into public.role_post_categories (role, category)
values
  ('super_admin'::public.app_role, 'supermarket'::public.post_category),
  ('admin'::public.app_role, 'supermarket'::public.post_category),
  ('supermarket_vendor'::public.app_role, 'supermarket'::public.post_category)
on conflict (role, category) do nothing;

commit;
