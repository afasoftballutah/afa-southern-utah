"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * Free address field:
 *  - Browser autofill (Chrome/Safari saved addresses) via autocomplete attrs
 *  - Typeahead from OpenStreetMap Photon (no Google, no billing, no API key)
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
        setOpen(true); // show panel even if empty (so user knows it tried)
        setActive(-1);
      } catch (err) {
        if (err?.name !== "AbortError") {
          setItems([]);
          setOpen(false);
        }
      }
    }, 320);
  }

  function pick(item) {
    // Always put the FULL address in the field (street, city, state, zip).
    const full = item.label || item.street || "";
    const street = item.street || full;
    onChange(full);
    onPlace?.({
      street,
      city: item.city || "",
      state: item.state || "",
      zip: item.zip || "",
      formatted: full,
    });
    setOpen(false);
    setItems([]);
    setActive(-1);
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
        disabled={disabled}
        enterKeyHint="done"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
      />
      {open && (
        <ul
          id={`${id}-list`}
          className="address-input__list"
          role="listbox"
        >
          {items.length === 0 ? (
            <li className="address-input__empty" role="presentation">
              No matches — try street, city, and state (e.g. Main St, St George, UT)
            </li>
          ) : (
            items.map((item, i) => (
              <li key={`${item.label}-${i}`} role="option" aria-selected={i === active}>
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
