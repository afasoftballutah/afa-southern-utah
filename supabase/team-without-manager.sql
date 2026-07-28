-- A team can be in a tournament before anyone has said who runs it.
--
-- registrations.manager_name and manager_email were NOT NULL because the only
-- way a row got here was the public entry form, where a manager types their
-- own name and agrees to the waiver. That stopped being the only way in: a
-- director enters last season's bracket, or takes an entry over the phone, and
-- has a team name and nothing else.
--
-- The workaround was 'unknown@example.invalid' in the email column, which is a
-- lie the schema forced. Null is the truth: there is no manager yet. Anything
-- that needs one — the waiver, the PDF, the signing link — already checks.
--
-- JD, 2026-07-28: "the teams should be put in, with no managers or players
-- yet...possible or does this violate something?"

alter table registrations alter column manager_name drop not null;
alter table registrations alter column manager_email drop not null;

update registrations set manager_email = null where manager_email like '%@example.invalid';
