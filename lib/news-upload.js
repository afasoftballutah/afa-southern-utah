/** Server-only: upload news images to the public photos bucket. */

/** Upload one data URL; returns public URL or null. */
export async function uploadNewsImage(supabase, dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const match = /^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const contentType = match[1];
  const buffer = Buffer.from(match[3], "base64");
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error("Each image must be under 5 MB");
  }
  const ext = contentType.split("/")[1].replace("jpeg", "jpg");
  const path = `news/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("photos")
    .upload(path, buffer, { contentType, upsert: false });
  if (uploadError) {
    console.error("news image upload", uploadError);
    throw new Error("Could not upload image");
  }
  const { data: pub } = supabase.storage.from("photos").getPublicUrl(path);
  return pub?.publicUrl ?? null;
}
