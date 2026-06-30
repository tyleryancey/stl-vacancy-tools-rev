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

export function SearchBar() {
  const dataReady = useStore((s) => s.dataReady);

  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  const showDropdown = open && dataReady && query.length >= MIN_CHARS;

  return (
    <div className="search-box" ref={rootRef}>
      <div className="search-input-row">
        <span className="search-icon" aria-hidden="true" />
        <input
          className="search-input"
          type="text"
          value={text}
          disabled={!dataReady}
          placeholder={dataReady ? "Address, owner, or neighborhood" : "Loading data…"}
          aria-label="Search by address, owner, or neighborhood"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        />
        {text && (
          <button className="search-clear" aria-label="Clear search" onClick={reset}>
            ×
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="search-results">
          {!hasResults && <div className="search-empty">No matches found.</div>}

          {results.addresses.length > 0 && (
            <div className="search-group">
              <div className="search-group-title">Addresses</div>
              {results.addresses.map((f) => (
                <button
                  key={f.properties.ParcelId}
                  className="search-result"
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
            <div className="search-group">
              <div className="search-group-title">Owners</div>
              {results.owners.map((o) => (
                <button
                  key={o.name}
                  className="search-result"
                  onClick={() => pickOwner(o.name)}
                >
                  <span className="search-result-main">{fixOwnerName(o.name)}</span>
                  <span className="search-result-sub">
                    ({numberWithCommas(o.count)}{" "}
                    {o.count === 1 ? "property" : "properties"})
                  </span>
                </button>
              ))}
            </div>
          )}

          {results.neighborhoods.length > 0 && (
            <div className="search-group">
              <div className="search-group-title">Neighborhoods</div>
              {results.neighborhoods.map((n) => (
                <button
                  key={n}
                  className="search-result"
                  onClick={() => pickNeighborhood(n)}
                >
                  <span className="search-result-main">{toTitleCase(n)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
