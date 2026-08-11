"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Address field with typeahead.
 * Uses Google Places via /api/address-suggest when the server has a key;
 * otherwise OSM Photon. Browser autofill still works via autocomplete attrs.
 */
export default function AddressInput({
  value,
  onChange,
  /** Optional: { street, city, state, zip, formatted } when a suggestion is picked */
  onPlace = null,
  placeholder = "Start typing your address…",
  className = "form-field",
  id: idProp,
  name = "street-address",
  required = false,
  disabled = false,
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(-1);
  const [busyPick, setBusyPick] = useState(false);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!wrapRef.current?.contains(e.target)) {
        setOpen(false);
        setActive(-1);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function scheduleSuggest(q) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const query = (q ?? "").trim();
    if (query.length < 3) {
      setItems([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(
          `/api/address-suggest?q=${encodeURIComponent(query)}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        const list = data.suggestions ?? [];
        setItems(list);
        setOpen(true);
        setActive(-1);
      } catch (err) {
        if (err?.name !== "AbortError") {
          setItems([]);
          setOpen(false);
        }
      }
    }, 280);
  }

  async function pick(item) {
    setBusyPick(true);
    try {
      let street = item.street || "";
      let city = item.city || "";
      let state = item.state || "";
      let zip = item.zip || "";
      let full = item.label || street || "";

      // Google suggestions need a details call for structured parts
      if (item.placeId) {
        const res = await fetch(
          `/api/address-details?placeId=${encodeURIComponent(item.placeId)}`
        );
        if (res.ok) {
          const d = await res.json();
          street = d.street || street;
          city = d.city || city;
          state = d.state || state;
          zip = d.zip || zip;
          full = d.formatted || d.label || full;
        }
      }

      if (!full) full = [street, city, state, zip].filter(Boolean).join(", ");
      // Drop country + trailing commas (Google often ends with ", USA")
      const tidy = (s) =>
        String(s ?? "")
          .replace(
            /,?\s*(United States of America|United States|USA|US)\s*$/i,
            ""
          )
          .replace(/\s+,/g, ",")
          .replace(/,+/g, ",")
          .replace(/[,\s]+$/g, "")
          .trim();
      full = tidy(full);
      street = tidy(street || full);
      onChange(full);
      onPlace?.({
        street: street || full,
        city,
        state,
        zip,
        formatted: full,
      });
    } finally {
      setBusyPick(false);
      setOpen(false);
      setItems([]);
      setActive(-1);
    }
  }

  function onKeyDown(e) {
    if (!open || items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div className="address-input" ref={wrapRef}>
      <input
        id={id}
        name={name}
        type="text"
        className={className}
        value={value ?? ""}
        onChange={(e) => {
          onChange(e.target.value);
          scheduleSuggest(e.target.value);
        }}
        onFocus={() => {
          if (items.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="street-address"
        autoCapitalize="words"
        spellCheck={false}
        required={required}
        disabled={disabled || busyPick}
        enterKeyHint="done"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
      />
      {open && (
        <ul id={`${id}-list`} className="address-input__list" role="listbox">
          {items.length === 0 ? (
            <li className="address-input__empty" role="presentation">
              No matches — try a street number and name
            </li>
          ) : (
            items.map((item, i) => (
              <li
                key={`${item.placeId || item.label}-${i}`}
                role="option"
                aria-selected={i === active}
              >
                <button
                  type="button"
                  className={
                    "address-input__option" +
                    (i === active ? " address-input__option--active" : "")
                  }
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(item);
                  }}
                >
                  {item.label}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
