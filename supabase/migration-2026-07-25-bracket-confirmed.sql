-- Confirming the bracket (redesign spec §1, §2)
--
-- A tournament runs in two stages: pool play, then the bracket. Confirming
-- the bracket is the hinge between them. It is a DIRECTOR'S DECISION, not
-- something derivable from the data — every pool can be final and every
-- seed written while the director is still deciding whether a score is
-- right — so it needs somewhere to live.
--
-- Recorded on the division that OWNS pool play (the parent), because that
-- is what gets locked. The bracket children read it through their parent.
--
-- Nullable and defaulted to unconfirmed, so an un-migrated database and a
-- migrated-but-unconfirmed division behave identically: the app treats a
-- missing column and a null timestamp as the same state.

alter table public.divisions
  add column if not exists bracket_confirmed_at timestamptz,
  -- Who confirmed it. The scorekeeper session is PIN-based and carries no
  -- identity, so this is a free-text note the director can leave rather
  -- than a foreign key to a user that does not exist.
  add column if not exists bracket_confirmed_by text;

comment on column public.divisions.bracket_confirmed_at is
  'When the director confirmed the bracket. Non-null means pool play for this division is final and its scores are read-only in the scorekeeper. Reversible: reopening pool play sets this back to null, because a wrong score has to be fixable at a ballpark at midnight.';

-- Pool play''s locked state is DERIVED from the column above, never stored
-- separately. Two flags that can disagree is a bug waiting to happen, and
-- the only question anyone asks is "has the bracket been confirmed".
