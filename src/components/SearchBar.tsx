import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/state/store";
import {
  searchAddresses,
  searchOwners,
  searchNeighborhoods,
  type OwnerMatch,
} from "@/lib/searchIndex";
import { selectAndFly } from "@/lib/select";
import { toTitleCase, fixOwnerName, numberWithCommas } from "@/lib/format";
import type { ParcelFeature } from "@/data/parcels";

// Top-center omnibox over our own data (ports the original "Address, owner, or
// neighborhood" search, REVERSE-ENGINEERING.md §10.2). No external geocoder.

const MIN_CHARS = 2;
const DEBOUNCE_MS = 150;

interface Results {
  addresses: ParcelFeature[];
  owners: OwnerMatch[];
  neighborhoods: string[];
}

const EMPTY_RESULTS: Results = { addresses: [], owners: [], neighborhoods: [] };

// Flattened for arrow-key navigation across the three result groups (ARIA
// combobox pattern: one roving aria-activedescendant, not per-group focus).
type FlatOption =
  | { kind: "address"; id: string; feature: ParcelFeature }
  | { kind: "owner"; id: string; owner: OwnerMatch }
  | { kind: "neighborhood"; id: string; name: string };

export function SearchBar() {
  const dataReady = useStore((s) => s.dataReady);

  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = "search-listbox";

  // Debounce raw input into the query the search index actually runs on.
  useEffect(() => {
    const t = text.trim();
    if (t.length < MIN_CHARS) {
      setQuery("");
      return;
    }
    const id = window.setTimeout(() => setQuery(t), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [text]);

  const results = useMemo<Results>(() => {
    if (!dataReady || query.length < MIN_CHARS) return EMPTY_RESULTS;
    return {
      addresses: searchAddresses(query, 6),
      owners: searchOwners(query, 6),
      neighborhoods: searchNeighborhoods(query, 5),
    };
  }, [dataReady, query]);

  const hasResults =
    results.addresses.length > 0 ||
    results.owners.length > 0 ||
    results.neighborhoods.length > 0;

  const flatOptions = useMemo<FlatOption[]>(
    () => [
      ...results.addresses.map((f): FlatOption => ({ kind: "address", id: f.properties.ParcelId, feature: f })),
      ...results.owners.map((o): FlatOption => ({ kind: "owner", id: o.name, owner: o })),
      ...results.neighborhoods.map((n): FlatOption => ({ kind: "neighborhood", id: n, name: n })),
    ],
    [results]
  );

  // The active option resets whenever the candidate list changes underneath it.
  useEffect(() => setActiveIndex(-1), [flatOptions]);

  // Close the dropdown on any outside click.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function reset() {
    setText("");
    setQuery("");
    setOpen(false);
  }

  function pickAddress(f: ParcelFeature) {
    selectAndFly(f.properties);
    reset();
  }

  function pickOwner(name: string) {
    useStore.getState().openMpoPanel(name);
    reset();
  }

  function pickNeighborhood(name: string) {
    const s = useStore.getState();
    s.setHighlightedNeighborhood(name);
    s.setView("map");
    reset();
  }

  function activate(option: FlatOption) {
    if (option.kind === "address") pickAddress(option.feature);
    else if (option.kind === "owner") pickOwner(option.owner.name);
    else pickNeighborhood(option.name);
  }

  const showDropdown = open && dataReady && query.length >= MIN_CHARS;

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!showDropdown || flatOptions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flatOptions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? flatOptions.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      activate(flatOptions[activeIndex]);
    }
  }

  return (
    <div className="search-box" ref={rootRef}>
      <div className="search-input-row">
        <span className="search-icon" aria-hidden="true" />
        <input
          className="search-input"
          type="text"
          role="combobox"
          value={text}
          disabled={!dataReady}
          placeholder={dataReady ? "Address, owner, or neighborhood" : "Loading data…"}
          aria-label="Search by address, owner, or neighborhood"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
        />
        {text && (
          <button className="search-clear" aria-label="Clear search" onClick={reset}>
            ×
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="search-results" role="listbox" id={listboxId} aria-label="Search results">
          {!hasResults && <div className="search-empty">No matches found.</div>}

          {results.addresses.length > 0 && (
            <div className="search-group" role="group" aria-label="Addresses">
              <div className="search-group-title" aria-hidden="true">Addresses</div>
              {results.addresses.map((f, i) => (
                <button
                  key={f.properties.ParcelId}
                  id={`${listboxId}-opt-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  className={`search-result${i === activeIndex ? " active" : ""}`}
                  onClick={() => pickAddress(f)}
                >
                  <span className="search-result-main">
                    {toTitleCase(f.properties.Address) || "Vacant parcel"}
                  </span>
                  {f.properties.NhdName && (
                    <span className="search-result-sub">
                      {toTitleCase(f.properties.NhdName)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {results.owners.length > 0 && (
            <div className="search-group" role="group" aria-label="Owners">
              <div className="search-group-title" aria-hidden="true">Owners</div>
              {results.owners.map((o, i) => {
                const idx = results.addresses.length + i;
                return (
                  <button
                    key={o.name}
                    id={`${listboxId}-opt-${idx}`}
                    role="option"
                    aria-selected={idx === activeIndex}
                    className={`search-result${idx === activeIndex ? " active" : ""}`}
                    onClick={() => pickOwner(o.name)}
                  >
                    <span className="search-result-main">{fixOwnerName(o.name)}</span>
                    <span className="search-result-sub">
                      ({numberWithCommas(o.count)}{" "}
                      {o.count === 1 ? "property" : "properties"})
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {results.neighborhoods.length > 0 && (
            <div className="search-group" role="group" aria-label="Neighborhoods">
              <div className="search-group-title" aria-hidden="true">Neighborhoods</div>
              {results.neighborhoods.map((n, i) => {
                const idx = results.addresses.length + results.owners.length + i;
                return (
                  <button
                    key={n}
                    id={`${listboxId}-opt-${idx}`}
                    role="option"
                    aria-selected={idx === activeIndex}
                    className={`search-result${idx === activeIndex ? " active" : ""}`}
                    onClick={() => pickNeighborhood(n)}
                  >
                    <span className="search-result-main">{toTitleCase(n)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
