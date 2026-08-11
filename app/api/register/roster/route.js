import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";
import { resolvePlayer } from "@/lib/identity";
import {
  assertPlayerFreeForTeam,
  releaseMemberToPool,
} from "@/lib/roster-eligibility";
import { personFieldsFromInput } from "@/lib/person-name";

export const runtime = "nodejs";

// Roster editing, gated on manage_token — the manager's PRIVATE credential.
// Not roster_token: that one is pasted into the team chat, so anything behind
// it is something every teammate can do, including removing each other.
//
// No outbound comms here either. Adding someone produces a signing link the
// manager passes on herself, or they find their name on the team link.

function bad(message, status = 400) {
  return Response.json({ error: message }, { status });
}

async function registrationFor(supabase, token) {
  if (!token) return null;
  const { data } = await supabase
    .from("registrations")
    .select(
      "id, status, manager_member_id, tournament_id, team_name, divisions(gender, display_name, name)"
    )
    .eq("manage_token", token)
    .maybeSingle();
  return data ?? null;
}

/** List open free agents for this tournament (same gender as this team). */
export async function GET(request) {
  const token = new URL(request.url).searchParams.get("token");
  const supabase = getServiceClient();
  const registration = await registrationFor(supabase, token);
  if (!registration) return bad("Management link not found", 404);

  const gender = registration.divisions?.gender ?? null;
  let q = supabase
    .from("tournament_player_pool")
    .select("id, name, birth_date, division_gender, released_at, source_registration_id")
    .eq("tournament_id", registration.tournament_id)
    .is("claimed_at", null)
    .order("released_at", { ascending: false });

  // Only show pool players whose gender matches this team's division
  if (gender) q = q.eq("division_gender", gender);

  const { data, error } = await q;
  if (error) {
    // Table may not exist yet in a stale env
    console.error("pool list failed", error);
    return Response.json({ ok: true, pool: [] });
  }
  return Response.json({ ok: true, pool: data ?? [] });
}

/** Add a person to the roster, or claim from the free-agent pool. */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  const { token, name, birthDate, address, role, poolId, restoreMemberId } =
    body ?? {};
  const supabase = getServiceClient();
  const registration = await registrationFor(supabase, token);
  if (!registration) return bad("Management link not found", 404);
  if (registration.status === "withdrawn") {
    return bad("This team has withdrawn. Ask the director to reinstate it first.", 409);
  }

  const origin = new URL(request.url).origin;

  // ---- Restore a soft-removed member on this team --------------------
  if (restoreMemberId) {
    const { data: member } = await supabase
      .from("roster_members")
      .select("id, name, birth_date, player_id, removed_at, signing_token, signed_at")
      .eq("id", restoreMemberId)
      .eq("registration_id", registration.id)
      .maybeSingle();

    if (!member) return bad("That player is not on this roster", 404);
    if (!member.removed_at) {
      return bad(`${member.name} is already on this roster`, 409);
    }

    const teamGender = registration.divisions?.gender ?? null;
    const gate = await assertPlayerFreeForTeam(supabase, {
      tournamentId: registration.tournament_id,
      divisionGender: teamGender,
      name: member.name,
      birthDate: member.birth_date,
      playerId: member.player_id,
      exceptRegistrationId: registration.id,
      exceptMemberId: member.id,
    });
    if (!gate.ok) return bad(gate.error, 409);

    const { data: restored, error } = await supabase
      .from("roster_members")
      .update({ removed_at: null })
      .eq("id", member.id)
      .select("id, name, signing_token, birth_date")
      .single();
    if (error) {
      console.error("roster restore failed", error);
      return bad("Could not restore that player — please try again", 500);
    }

    // If they were sitting open in the free-agent pool from this cut, pull
    // the listing so another team cannot claim a player who is back.
    await supabase
      .from("tournament_player_pool")
      .update({
        claimed_at: new Date().toISOString(),
        claimed_registration_id: registration.id,
      })
      .eq("source_member_id", member.id)
      .is("claimed_at", null);

    try {
      await regenerateAndStoreWaiverPdf(registration.id);
    } catch (err) {
      console.error("PDF regeneration after roster restore failed", err);
    }

    return Response.json({
      ok: true,
      member: {
        id: restored.id,
        name: restored.name,
        birthDate: restored.birth_date ?? member.birth_date,
        signed: Boolean(member.signed_at),
        signLink: `${origin}/register/sign/${restored.signing_token}`,
      },
    });
  }

  // ---- Claim from free-agent pool ------------------------------------
  if (poolId) {
    const { data: entry } = await supabase
      .from("tournament_player_pool")
      .select("*")
      .eq("id", poolId)
      .is("claimed_at", null)
      .maybeSingle();

    if (!entry) return bad("That free agent is no longer available", 409);
    if (entry.tournament_id !== registration.tournament_id) {
      return bad("That player is not in this tournament's pool", 409);
    }
    const teamGender = registration.divisions?.gender ?? null;
    if (
      entry.division_gender &&
      teamGender &&
      entry.division_gender !== teamGender
    ) {
      return bad("That player is not eligible for this division gender", 409);
    }

    const gate = await assertPlayerFreeForTeam(supabase, {
      tournamentId: registration.tournament_id,
      divisionGender: teamGender,
      name: entry.name,
      birthDate: entry.birth_date,
      playerId: entry.player_id,
      exceptRegistrationId: registration.id,
    });
    if (!gate.ok) return bad(gate.error, 409);

    // Restore original member row if it was soft-removed, else insert new
    let member;
    if (entry.source_member_id) {
      const { data: source } = await supabase
        .from("roster_members")
        .select("id, registration_id, removed_at, signing_token, name")
        .eq("id", entry.source_member_id)
        .maybeSingle();

      if (source && source.registration_id === registration.id && source.removed_at) {
        const { data, error } = await supabase
          .from("roster_members")
          .update({ removed_at: null })
          .eq("id", source.id)
          .select("id, name, signing_token")
          .single();
        if (error) return bad("Could not restore that player", 500);
        member = data;
      } else if (source && source.removed_at) {
        // Move: reattach member row to this registration (keep signing token)
        const { data, error } = await supabase
          .from("roster_members")
          .update({
            registration_id: registration.id,
            removed_at: null,
            role: "player",
          })
          .eq("id", source.id)
          .select("id, name, signing_token")
          .single();
        if (error) {
          // Fall through to insert if move fails (e.g. unique constraints)
          console.error("pool claim move failed", error);
        } else {
          member = data;
        }
      }
    }

    if (!member) {
      const { data, error } = await supabase
        .from("roster_members")
        .insert({
          registration_id: registration.id,
          role: "player",
          name: entry.name,
          birth_date: entry.birth_date,
          player_id: entry.player_id,
        })
        .select("id, name, signing_token")
        .single();
      if (error) {
        console.error("pool claim insert failed", error);
        return bad("Could not add that player — please try again", 500);
      }
      member = data;
    }

    await supabase
      .from("tournament_player_pool")
      .update({
        claimed_at: new Date().toISOString(),
        claimed_registration_id: registration.id,
      })
      .eq("id", entry.id);

    try {
      await regenerateAndStoreWaiverPdf(registration.id);
    } catch (err) {
      console.error("PDF regeneration after pool claim failed", err);
    }

    return Response.json({
      ok: true,
      member: {
        id: member.id,
        name: member.name,
        birthDate: entry.birth_date,
        signLink: `${origin}/register/sign/${member.signing_token}`,
      },
    });
  }

  // ---- Add by manager: first + last + gender (rest at waiver signing) --
  // Also accepts legacy legalFirst/Last + preferred + email for older clients.
  if (role && !["player", "coach"].includes(role)) {
    return bad("Role must be player or coach");
  }

  const firstName = String(
    body?.firstName ?? body?.legalFirstName ?? ""
  ).trim();
  const lastName = String(body?.lastName ?? body?.legalLastName ?? "").trim();
  const genderRaw = body?.gender ? String(body.gender).trim() : "";
  const gender = genderRaw === "M" || genderRaw === "F" ? genderRaw : null;

  // Coaches may still send full contact; players are name + gender only.
  const isCoach = (role ?? "player") === "coach";
  const person = personFieldsFromInput(
    {
      name: name || [firstName, lastName].filter(Boolean).join(" "),
      legalFirstName: firstName || body?.legalFirstName,
      legalLastName: lastName || body?.legalLastName,
      preferredName: body?.preferredName,
      email: body?.email,
      phone: body?.phone,
    },
    { allowPhone: isCoach }
  );

  if (!person.displayName && !(firstName && lastName)) {
    return bad("First and last name are required");
  }
  const displayName =
    person.displayName || [firstName, lastName].filter(Boolean).join(" ");

  if (!isCoach && !gender) {
    return bad("Gender (M or F) is required when adding a player");
  }

  // Optional: manager picked someone already in the directory
  let playerId = body?.playerId ? String(body.playerId) : null;
  if (playerId) {
    const { data: known } = await supabase
      .from("players")
      .select("id, full_name, gender, birth_date, merged_into_id")
      .eq("id", playerId)
      .maybeSingle();
    if (!known || known.merged_into_id) {
      return bad("That player is not on file", 404);
    }
    playerId = known.merged_into_id ?? known.id;
  } else if (birthDate && person.legalFirstName && person.legalLastName) {
    // Legacy path with birth date — resolve into directory now
    try {
      playerId = await resolvePlayer(supabase, {
        name: displayName,
        birthDate: birthDate || null,
        legalFirstName: person.legalFirstName,
        legalLastName: person.legalLastName,
        preferredName: person.preferredName,
        email: person.email,
      });
    } catch (err) {
      console.error("player resolution failed on roster add", err);
    }
  }

  const gate = await assertPlayerFreeForTeam(supabase, {
    tournamentId: registration.tournament_id,
    divisionGender: registration.divisions?.gender ?? null,
    name: displayName,
    birthDate: birthDate || null,
    playerId,
    exceptRegistrationId: registration.id,
  });
  if (!gate.ok) return bad(gate.error, 409);

  // Someone already on the roster who was removed comes BACK rather than
  // arriving twice — a manager who removes the wrong person and re-adds them
  // should not end up with two rows and two signing links.
  const { data: existing } = await supabase
    .from("roster_members")
    .select("id, removed_at, signing_token, name")
    .eq("registration_id", registration.id)
    .ilike("name", displayName)
    .maybeSingle();

  // Manager stub: roster name + gender only. Legal/preferred/email/DOB/address
  // are filled by the player on the signing page (except coaches).
  const memberPatch = {
    removed_at: null,
    name: displayName,
    gender: gender,
    birth_date: isCoach ? birthDate || null : birthDate || null,
    legal_first_name: isCoach
      ? person.legalFirstName
      : firstName || person.legalFirstName,
    legal_last_name: isCoach
      ? person.legalLastName
      : lastName || person.legalLastName,
    preferred_name: isCoach ? person.preferredName : null,
    email: isCoach ? person.email : person.email || null,
    phone: isCoach ? person.phone : null,
    ...(playerId ? { player_id: playerId } : {}),
  };

  let member;
  if (existing?.removed_at) {
    const { data, error } = await supabase
      .from("roster_members")
      .update(memberPatch)
      .eq("id", existing.id)
      .select("id, name, signing_token, gender")
      .single();
    if (error) return bad("Could not restore that player — please try again", 500);
    member = data;
  } else if (existing) {
    return bad(`${displayName} is already on this roster`, 409);
  } else {
    const { data, error } = await supabase
      .from("roster_members")
      .insert({
        registration_id: registration.id,
        role: role ?? "player",
        address: isCoach ? address || null : null,
        ...memberPatch,
      })
      .select("id, name, signing_token, gender")
      .single();
    if (error) {
      console.error("roster add failed", error);
      return bad("Could not add that player — please try again", 500);
    }
    member = data;
  }

  try {
    await regenerateAndStoreWaiverPdf(registration.id);
  } catch (err) {
    console.error("PDF regeneration after roster add failed", err);
  }

  return Response.json({
    ok: true,
    member: {
      id: member.id,
      name: member.name,
      gender: member.gender ?? gender,
      birthDate: birthDate || null,
      signLink: `${origin}/register/sign/${member.signing_token}`,
    },
  });
}

/**
 * Remove a person from the roster.
 * body.toPool = true → soft-remove and put them in the tournament free-agent pool
 * (so another team can claim them). Default is soft-remove only.
 */
export async function DELETE(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  const { token, memberId, toPool } = body ?? {};
  if (!memberId) return bad("Which player?");

  const supabase = getServiceClient();
  const registration = await registrationFor(supabase, token);
  if (!registration) return bad("Management link not found", 404);

  if (toPool) {
    if (memberId === registration.manager_member_id) {
      return bad("You cannot release yourself to the pool", 409);
    }
    const result = await releaseMemberToPool(supabase, memberId);
    if (!result.ok) return bad(result.error, 409);

    try {
      await regenerateAndStoreWaiverPdf(registration.id);
    } catch (err) {
      console.error("PDF regeneration after pool release failed", err);
    }

    return Response.json({
      ok: true,
      removed: { id: memberId, name: result.member?.name },
      pooled: true,
      poolEntry: result.poolEntry,
    });
  }

  const { data: member } = await supabase
    .from("roster_members")
    .select("id, name, signed_at, removed_at")
    .eq("id", memberId)
    .eq("registration_id", registration.id)
    .maybeSingle();

  if (!member) return bad("That player is not on this roster", 404);
  if (member.removed_at) return bad(`${member.name} is already off the roster`, 409);

  if (member.id === registration.manager_member_id) {
    return bad("You cannot remove yourself — ask the director to change the manager", 409);
  }

  const { error } = await supabase
    .from("roster_members")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", member.id);

  if (error) {
    console.error("roster remove failed", error);
    return bad("Could not remove that player — please try again", 500);
  }

  try {
    await regenerateAndStoreWaiverPdf(registration.id);
  } catch (err) {
    console.error("PDF regeneration after roster remove failed", err);
  }

  return Response.json({ ok: true, removed: { id: member.id, name: member.name }, pooled: false });
}
