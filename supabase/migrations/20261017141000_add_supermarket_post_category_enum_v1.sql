-- Add supermarket as a first-class marketplace post category.
-- Keep this migration separate from role mappings because the new enum value must be committed first.
alter type public.post_category add value if not exists 'supermarket';
