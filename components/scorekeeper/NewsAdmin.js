"use client";

import { useRef, useState } from "react";
import { formatNewsDate, newsImageUrls } from "@/lib/news";

const MAX_IMAGES = 12;
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Director news desk: create, publish/unpublish, delete posts for the homepage.
 * Posts may include zero or more images (photos bucket).
 */
export default function NewsAdmin({ initialPosts = [] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  /** Already-saved public URLs kept when editing. */
  const [existingUrls, setExistingUrls] = useState([]);
  /** New picks as data URLs (uploaded on save). */
  const [pendingDataUrls, setPendingDataUrls] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);
  const fileInput = useRef(null);

  const totalImages = existingUrls.length + pendingDataUrls.length;
  const slotsLeft = Math.max(0, MAX_IMAGES - totalImages);

  function resetForm() {
    setTitle("");
    setBody("");
    setLinkUrl("");
    setLinkLabel("");
    setExistingUrls([]);
    setPendingDataUrls([]);
    setEditingId(null);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setTitle(p.title || "");
    setBody(p.body || "");
    setLinkUrl(p.link_url || "");
    setLinkLabel(p.link_label || "");
    setExistingUrls(newsImageUrls(p));
    setPendingDataUrls([]);
    setError("");
  }

  function removeExisting(idx) {
    setExistingUrls((cur) => cur.filter((_, i) => i !== idx));
  }

  function removePending(idx) {
    setPendingDataUrls((cur) => cur.filter((_, i) => i !== idx));
  }

  function pickFiles(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    const remaining = MAX_IMAGES - existingUrls.length - pendingDataUrls.length;
    if (remaining <= 0) {
      setError(`At most ${MAX_IMAGES} images per post`);
      return;
    }

    const toRead = files.slice(0, remaining);
    const readers = toRead.map(
      (file) =>
        new Promise((resolve, reject) => {
          if (!file.type?.startsWith("image/")) {
            reject(new Error("Only image files are allowed"));
            return;
          }
          if (file.size > MAX_BYTES) {
            reject(new Error("Each image must be under 5 MB"));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read image"));
          reader.readAsDataURL(file);
        })
    );

    Promise.all(readers)
      .then((dataUrls) => {
        setPendingDataUrls((cur) => [...cur, ...dataUrls].slice(0, MAX_IMAGES));
        setError("");
      })
      .catch((err) => setError(err.message || "Could not read images"));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        linkUrl: linkUrl.trim() || null,
        linkLabel: linkLabel.trim() || null,
        published: true,
        imageUrls: existingUrls,
        imageDataUrls: pendingDataUrls,
      };
      const res = await fetch(
        editingId
          ? `/api/scorekeeper/news/${editingId}`
          : "/api/scorekeeper/news",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save");
      if (editingId) {
        setPosts((cur) =>
          cur.map((p) => (p.id === editingId ? json.post : p))
        );
      } else {
        setPosts((cur) => [json.post, ...cur]);
      }
      resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function setPublished(p, published) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/news/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not update");
      setPosts((cur) => cur.map((x) => (x.id === p.id ? json.post : x)));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(p) {
    if (!window.confirm(`Delete “${p.title}”? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/scorekeeper/news/${p.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not delete");
      setPosts((cur) => cur.filter((x) => x.id !== p.id));
      if (editingId === p.id) resetForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <form onSubmit={save} className="card p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="t-strong">
            {editingId ? "Edit post" : "New post"}
          </p>
          {editingId && (
            <button
              type="button"
              className="t-label underline text-afa-muted"
              onClick={resetForm}
            >
              Cancel edit
            </button>
          )}
        </div>
        <p className="t-meta text-[12px]">
          Published posts appear on the homepage under News. Keep titles short.
          You can attach up to {MAX_IMAGES} photos.
        </p>
        <label className="block">
          <span className="form-label">Title</span>
          <input
            className="form-field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Registration open for Southern Utah 2026"
            required
          />
        </label>
        <label className="block">
          <span className="form-label">Body</span>
          <textarea
            className="form-field min-h-[7rem]"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What should players and managers know?"
            required
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="form-label">Link URL (optional)</span>
            <input
              className="form-field"
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <label className="block">
            <span className="form-label">Link label (optional)</span>
            <input
              className="form-field"
              value={linkLabel}
              onChange={(e) => setLinkLabel(e.target.value)}
              placeholder="Register →"
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="form-label">Photos (optional)</span>
            <span className="t-meta text-[11px]">
              {totalImages}/{MAX_IMAGES}
              {slotsLeft === 0 ? " · full" : ""}
            </span>
          </div>
          {(existingUrls.length > 0 || pendingDataUrls.length > 0) && (
            <ul className="news-admin__thumbs">
              {existingUrls.map((url, i) => (
                <li key={`ex-${url}-${i}`} className="news-admin__thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" />
                  <button
                    type="button"
                    className="news-admin__thumb-x"
                    aria-label="Remove photo"
                    disabled={busy}
                    onClick={() => removeExisting(i)}
                  >
                    ×
                  </button>
                </li>
              ))}
              {pendingDataUrls.map((dataUrl, i) => (
                <li key={`pe-${i}`} className="news-admin__thumb">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={dataUrl} alt="" />
                  <button
                    type="button"
                    className="news-admin__thumb-x"
                    aria-label="Remove photo"
                    disabled={busy}
                    onClick={() => removePending(i)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={pickFiles}
          />
          <button
            type="button"
            className="pill"
            disabled={busy || slotsLeft === 0}
            onClick={() => fileInput.current?.click()}
          >
            {slotsLeft === 0
              ? "Max photos reached"
              : totalImages === 0
                ? "Add photos"
                : "Add more photos"}
          </button>
          <p className="t-meta text-[11px]">
            PNG, JPEG, or WebP · under 5 MB each
          </p>
        </div>

        {error && (
          <p className="t-meta text-afa-red font-semibold">{error}</p>
        )}
        <button type="submit" className="btn-action" disabled={busy}>
          {busy
            ? "Saving…"
            : editingId
              ? "Save changes"
              : "Publish post"}
        </button>
      </form>

      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-afa-navy/10 bg-afa-soft-gray/50">
          <p className="t-strong text-sm">
            {posts.length === 0
              ? "No posts yet"
              : `${posts.length} post${posts.length === 1 ? "" : "s"}`}
          </p>
        </div>
        {posts.length === 0 ? (
          <p className="p-6 t-meta text-center">
            Publish your first update above — it will show on the home News
            section.
          </p>
        ) : (
          <ul className="divide-y divide-afa-navy/10">
            {posts.map((p) => {
              const imgs = newsImageUrls(p);
              return (
                <li
                  key={p.id}
                  className="px-4 py-3 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="t-body font-semibold">
                      {p.title}
                      {!p.published && (
                        <span className="t-meta font-normal"> · draft</span>
                      )}
                    </p>
                    <p className="t-meta text-[12px] mt-0.5">
                      {formatNewsDate(p.published_at)}
                      {imgs.length > 0
                        ? ` · ${imgs.length} photo${imgs.length === 1 ? "" : "s"}`
                        : ""}
                    </p>
                    <p className="t-meta text-[13px] mt-1 line-clamp-2">
                      {p.body}
                    </p>
                    {imgs.length > 0 && (
                      <ul className="news-admin__thumbs news-admin__thumbs--sm mt-2">
                        {imgs.slice(0, 4).map((url, i) => (
                          <li key={`${p.id}-${i}`} className="news-admin__thumb">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt="" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 shrink-0">
                    <button
                      type="button"
                      className="pill"
                      disabled={busy}
                      onClick={() => startEdit(p)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="pill"
                      disabled={busy}
                      onClick={() => setPublished(p, !p.published)}
                    >
                      {p.published ? "Unpublish" : "Publish"}
                    </button>
                    <button
                      type="button"
                      className="pill text-afa-red border-afa-red/30"
                      disabled={busy}
                      onClick={() => remove(p)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
