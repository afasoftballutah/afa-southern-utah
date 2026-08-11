"use client";

import { useState } from "react";
import { formatNewsDate } from "@/lib/news";

/**
 * Director news desk: create, publish/unpublish, delete posts for the homepage.
 */
export default function NewsAdmin({ initialPosts = [] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState(null);

  function resetForm() {
    setTitle("");
    setBody("");
    setLinkUrl("");
    setLinkLabel("");
    setEditingId(null);
  }

  function startEdit(p) {
    setEditingId(p.id);
    setTitle(p.title || "");
    setBody(p.body || "");
    setLinkUrl(p.link_url || "");
    setLinkLabel(p.link_label || "");
    setError("");
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
      <form
        onSubmit={save}
        className="card p-4 space-y-3"
      >
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
            {posts.map((p) => (
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
                  </p>
                  <p className="t-meta text-[13px] mt-1 line-clamp-2">
                    {p.body}
                  </p>
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
