-- Preferred was backfilled as full legal name. Default preferred = first name only.

-- players: preferred that equals "First Last" → first name; display full_name too
update public.players
set
  preferred_name = nullif(trim(legal_first_name), ''),
  full_name = coalesce(
    nullif(trim(legal_first_name), ''),
    full_name
  )
where legal_first_name is not null
  and nullif(trim(legal_first_name), '') is not null
  and preferred_name is not null
  and lower(trim(preferred_name)) = lower(
    trim(legal_first_name) || ' ' || coalesce(trim(legal_last_name), '')
  );

-- players: preferred equals full_name and has a space (not a single-token nickname)
update public.players
set
  preferred_name = coalesce(
    nullif(trim(legal_first_name), ''),
    split_part(trim(full_name), ' ', 1)
  ),
  full_name = coalesce(
    nullif(trim(legal_first_name), ''),
    split_part(trim(full_name), ' ', 1),
    full_name
  )
where preferred_name is not null
  and full_name is not null
  and lower(trim(preferred_name)) = lower(trim(full_name))
  and position(' ' in trim(preferred_name)) > 0;

-- roster_members: same cleanup
update public.roster_members
set
  preferred_name = nullif(trim(legal_first_name), ''),
  name = coalesce(
    nullif(trim(legal_first_name), ''),
    name
  )
where legal_first_name is not null
  and nullif(trim(legal_first_name), '') is not null
  and preferred_name is not null
  and lower(trim(preferred_name)) = lower(
    trim(legal_first_name) || ' ' || coalesce(trim(legal_last_name), '')
  );

update public.roster_members
set
  preferred_name = coalesce(
    nullif(trim(legal_first_name), ''),
    split_part(trim(name), ' ', 1)
  ),
  name = coalesce(
    nullif(trim(legal_first_name), ''),
    split_part(trim(name), ' ', 1),
    name
  )
where preferred_name is not null
  and name is not null
  and lower(trim(preferred_name)) = lower(trim(name))
  and position(' ' in trim(preferred_name)) > 0;
