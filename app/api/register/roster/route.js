import { getServiceClient } from "@/lib/supabase";
import { regenerateAndStoreWaiverPdf } from "@/lib/pdf/regenerate";
import { resolvePlayer } from "@/lib/identity";

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
    .select("id, status, manager_member_id")
    .eq("manage_token", token)
    .maybeSingle();
  return data ?? null;
}

/** Add a person to the roster. */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  const { token, name, birthDate, address, role } = body ?? {};
  if (!name?.trim()) return bad("A name is required");
  if (role && !["player", "coach"].includes(role)) {
    return bad("Role must be player or coach");
  }

  const supabase = getServiceClient();
  const registration = await registrationFor(supabase, token);
  if (!registration) return bad("Management link not found", 404);
  if (registration.status === "withdrawn") {
    return bad("This team has withdrawn. Ask the director to reinstate it first.", 409);
  }

  // Someone already on the roster who was removed comes BACK rather than
  // arriving twice — a manager who removes the wrong person and re-adds them
  // should not end up with two rows and two signing links.
  const { data: existing } = await supabase
    .from("roster_members")
    .select("id, removed_at, signing_token")
    .eq("registration_id", registration.id)
    .ilike("name", name.trim())
    .maybeSingle();

  let member;
  if (existing?.removed_at) {
    const { data, error } = await supabase
      .from("roster_members")
      .update({ removed_at: null })
      .eq("id", existing.id)
      .select("id, name, signing_token")
      .single();
    if (error) return bad("Could not restore that player — please try again", 500);
    member = data;
  } else if (existing) {
    return bad(`${name.trim()} is already on this roster`, 409);
  } else {
    const { data, error } = await supabase
      .from("roster_members")
      .insert({
        registration_id: registration.id,
        role: role ?? "player",
        name: name.trim(),
        birth_date: birthDate || null,
        address: address || null,
      })
      .select("id, name, signing_token")
      .single();
    if (error) {
      console.error("roster add failed", error);
      return bad("Could not add that player — please try again", 500);
    }
    member = data;
  }

  // Same identity resolution the register route does, so someone added on
  // Saturday is the same person as the one who played in June. Soft: a
  // missing birth date leaves it unlinked rather than failing the add.
  try {
    const playerId = await resolvePlayer(supabase, { name: member.name, birthDate });
    if (playerId) {
      await supabase.from("roster_members").update({ player_id: playerId }).eq("id", member.id);
    }
  } catch (err) {
    console.error("player resolution failed on roster add", err);
  }

  try {
    await regenerateAndStoreWaiverPdf(registration.id);
  } catch (err) {
    console.error("PDF regeneration after roster add failed", err);
  }

  const origin = new URL(request.url).origin;
  return Response.json({
    ok: true,
    member: {
      id: member.id,
      name: member.name,
      signLink: `${origin}/register/sign/${member.signing_token}`,
    },
  });
}

/** Remove a person from the roster. Soft delete, always. */
export async function DELETE(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  const { token, memberId } = body ?? {};
  if (!memberId) return bad("Which player?");

  const supabase = getServiceClient();
  const registration = await registrationFor(supabase, token);
  if (!registration) return bad("Management link not found", 404);

  const { data: member } = await supabase
    .from("roster_members")
    .select("id, name, signed_at, removed_at")
    .eq("id", memberId)
    .eq("registration_id", registration.id)
    .maybeSingle();

  if (!member) return bad("That player is not on this roster", 404);
  if (member.removed_at) return bad(`${member.name} is already off the roster`, 409);

  // The manager cannot remove herself. Her row carries the signature on the
  // form's manager line, and a team with no manager has nobody to fix it.
  if (member.id === registration.manager_member_id) {
    return bad("You cannot remove yourself — ask the director to change the manager", 409);
  }

  // NEVER hard delete. A signature is a legal record, and the PDF regenerated
  // below simply stops listing them.
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

  return Response.json({ ok: true, removed: { id: member.id, name: member.name } });
}
