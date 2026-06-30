# STL Vacancy Explorer — Technical Reverse-Engineering Report

> Target: **https://www.stlvacancytools.com/** ("STL Vacancy Explorer" / "Vacant Property Explorer")
> Method: static analysis of downloaded client code only (`homepage.html`, `mpo.js`, `stats.html`, `caseUpload.html`, `csv_head.txt`). **No live backend store (Firebase RTDB, Firestore, Cloud Functions) was probed** — those contain Legal Services of Eastern Missouri (LSEM) legal-aid case data with PII. Every technical claim is grounded in a line number or filename; reasoning about intent is prefixed **(inferred)**.

---

## Executive summary

STL Vacancy Explorer is a civic-tech web application that maps, classifies, and risk-scores every vacant property in the City of St. Louis. It is built and hosted by **Public Goodness** (the author also runs the sibling site `publicgoodness.org`, which hosts `/stlv/` data and the build tooling) on behalf of the **St. Louis Vacancy Collaborative**, in collaboration with the City of St. Louis and **Legal Services of Eastern Missouri (LSEM)**. Architecturally it is a single static HTML/JS page (one ~7,100-line `index.html`) served from Google Cloud Storage behind Cloudflare, rendering an interactive Mapbox GL JS map over precomputed vector tilesets, with all dynamic behavior delegated to Firebase (Email/password Auth, Realtime Database, Firestore) and ten Google Cloud Functions. The same file ships **two experiences gated by login**: a fully public vacancy map for anonymous visitors, and an authenticated **LSEM** mode that overlays legal-aid case markers, a case-management table, richer distress scoring, and per-property neighborhood-context profiles. Vacancy/burden/nuisance/tax scores are not merely read from a database — the same scoring function runs **client-side, on demand, against live St. Louis city open-data** to reproduce and display each property's score breakdown and a 4-year timeline.

---

## Table of contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Hosting & delivery](#2-hosting--delivery)
3. [Frontend stack & app bootstrap](#3-frontend-stack--app-bootstrap)
4. [Authentication, roles & the two-tier (public vs LSEM) model](#4-authentication-roles--the-two-tier-public-vs-lsem-model)
5. [Map rendering engine](#5-map-rendering-engine)
6. [Data model](#6-data-model)
7. [Vacancy scoring & timeline engine](#7-vacancy-scoring--timeline-engine)
8. [Backend: Cloud Functions, Firebase data flow & the LSEM case system](#8-backend-cloud-functions-firebase-data-flow--the-lsem-case-system)
9. [External data integrations](#9-external-data-integrations)
10. [UI/UX: search, filters, panels, views, deep-linking & secondary pages](#10-uiux-search-filters-panels-views-deep-linking--secondary-pages)
11. [Security & data-sensitivity notes](#11-security--data-sensitivity-notes)
12. [How to rebuild it](#12-how-to-rebuild-it)
13. [Open questions & unverified inferences](#13-open-questions--unverified-inferences)

---

## 1. Architecture at a glance

```
                              ┌────────────────────────────────────────────┐
   Browser (SPA)              │  Cloudflare CDN  ──►  Google Cloud Storage  │
   ────────────              │  (x-goog-* origin headers; static files)    │
   index.html  ◄─────────────┤  index.html · stats.html · caseUpload.html  │
   stats.html                │  /scripts/* · /images/* · favicon.ico        │
   caseUpload.html           └────────────────────────────────────────────┘
        │
        │  one inline <script> (homepage.html:838-7097) builds window.stlv
        │
        ├─► Mapbox GL JS v1.12.0  ──►  Mapbox tiles/styles  (account "godavem")
        │        custom style ckl2xx4mk1vz417p1634xly6h
        │        vector tilesets stlvPrclFull5 / stlvPrclAll5 / 0ljoulq8(Lean)
        │
        ├─► Firebase JS SDK 8.3.0  (project: stlvacancycollaborative)
        │        Auth (Email/password via FirebaseUI 3.6.0)
        │        Realtime Database:  /apiCases  /users/{uid}  /roles/{uid}  (legacy /cases)
        │        Firestore:          parcels, propertyValues, propertyTax4, reEntry,
        │                            profilingBaseline, misc{*}, miscSecure{*}, allParcels(legacy)
        │
        ├─► Cloud Functions  https://us-central1-stlvacancycollaborative.cloudfunctions.net/
        │        convWGS84ToNAD83 · getAddlMenu · getAssignedCases · getFallbackCityData
        │        getNbrhds · getNeighborhoods · getOrgs · getPetitionText · getSign · getZillowInfo
        │
        ├─► Bulk data (static, sibling origin)
        │        https://www.publicgoodness.org/stlv/csv/stl_vacancy_data.csv  (6.5 MB)
        │        mpo.js  (precomputed multi-property-owner grouping)
        │
        └─► External services (direct links or via CF proxy)
                 vcpp.stldata.org/parcel_data/ · Google Street View (maps.googleapis.com)
                 Zillow (legacy XML, via getZillowInfo) · opencorporates.com · neighborly.info
                 stlouis-mo.gov (CSB request-submit, LRA "Buy Now", dept links) · ip-api.com
                 stlcitypermits.com (dead) · Google Analytics 4 (G-M4M4647JP5)
```

### Third-party dependency inventory

| Dependency | Version | Loaded at | Role |
|---|---|---|---|
| jQuery | 3.3.1 | `homepage.html:38` | DOM + AJAX (all backend calls use `$.ajax`/`$.getJSON`) |
| typeahead.js | — | `homepage.html:39` | **Loaded but unused/vestigial** (no `.typeahead(`/`Bloodhound` call; superseded by Mapbox geocoder) |
| Mapbox GL JS | v1.12.0 | `homepage.html:40-41` | Map rendering engine |
| mapbox-gl-geocoder | v4.7.0 | `homepage.html:42-43` | Address/neighborhood search control |
| Firebase JS SDK (app/auth/database/firestore) | 8.3.0 | `homepage.html:44-47` | Auth + RTDB + Firestore (SPA) |
| FirebaseUI | 3.6.0 | `homepage.html:60-61` | Drop-in Email/password sign-in widget |
| Google Maps JS API | (Street View only) | `homepage.html:91` | Interactive `StreetViewPanorama` |
| Google Analytics 4 (gtag) | — | `homepage.html:92-98` | Page-view telemetry, measurement id `G-M4M4647JP5` |
| jquery.csv | — | `caseUpload.html:12` | CSV parsing on the LSEM upload page |
| Google Charts (`loader.js`) | — | `stats.html:29` | Stacked-area "over time" charts |
| turf.js | — | `caseUpload.html` (point-in-polygon) | Neighborhood assignment during case geocode |
| Firebase JS SDK | **7.14.0** (stats.html), **5.8.2** (caseUpload.html) | — | Secondary pages were not migrated in lockstep with the 8.3.0 SPA |

**Public client config (NOT secrets — see §11):** Firebase web `apiKey <FIREBASE_WEB_API_KEY_redacted>` (`homepage.html:52`), a separate Google Maps JS key `<GOOGLE_MAPS_KEY_redacted>` (`homepage.html:91`), and the Mapbox public token `pk.eyJ1IjoiZ29kYXZlbS...` (`homepage.html:1429`).

---

## 2. Hosting & delivery

**FACT — static single-page app.** The page is server-template-free. There is no markup that looks generated server-side; the entire application is **one inline `<script>` spanning `homepage.html:838-7097`** operating on hand-authored body markup (`homepage.html:675-838`). The hosting/CDN layer is not directly observable in the source — the **Cloudflare-fronted Google Cloud Storage** origin is an established architecture fact derived from `x-goog-*` response headers, not anything citable in the HTML. What the code *does* prove, consistent with static hosting:

- **Relative, origin-local asset paths:** `favicon.ico` (`:8`), `mpo.js` (`:37`), `./scripts/typeahead.jquery.min.js` (`:39`), and many `images/...` references (e.g. `:714`, `:931`).
- **Third-party libraries pulled from public CDNs** rather than bundled (see dependency table).
- **Bulk data fetched from a sibling static origin:** the city-wide CSV downloads from `https://www.publicgoodness.org/stlv/csv/stl_vacancy_data.csv` (`:696`). A build comment at `:36` confirms the author's local workflow — "copying new vacancy.csv into \stlv\multi_property_processor and run node index.js" — i.e. `mpo.js` is a **pre-generated static artifact**, not a live endpoint.

The three pages are `index.html` (the SPA), `stats.html`, and `caseUpload.html`.

**(inferred)** The full architecture is: a static HTML/JS bundle on object storage behind a CDN, with all dynamic behavior delegated to Firebase (Auth/RTDB/Firestore) and the Cloud Functions tier; there is no application server of the author's own beyond Cloud Functions.

---

## 3. Frontend stack & app bootstrap

### 3.1 The global `stlv` namespace and client state

The very first script block (`homepage.html:9-35`, before any library loads) creates the single global `window.stlv` that holds essentially all app state:

| Property | Init value (`:10-23`) | Purpose |
|---|---|---|
| `stlv.brand` | `"public"` | Active experience: `"public"` vs `"lsem"`. Drives layers, title, favicon, filters. |
| `stlv.time` | `Date.now()` | Load timestamp. |
| `stlv.cases` | `{}` | Map of LSEM case objects (keyed by case id), populated from RTDB `/apiCases`. |
| `stlv.user` | `{id:"",role:"",email:"",cases:[]}` | Authenticated identity + authorization role. (`cases` array appears vestigial — case data lives in `stlv.cases`.) |
| `stlv.lookupCaseByHandle` | `{}` | Reverse index handle→caseKey, rebuilt in `initCases` (`:1077-1080`). |
| `stlv.masked` | `[]` | ParcelIds to suppress from the public map (from Firestore `misc/masked`, `:1452-1459`). |
| `stlv.cloudFunctionsDomain` | `"https://us-central1-stlvacancycollaborative.cloudfunctions.net/"` | Base for all Cloud Function calls. A commented localhost-emulator URL sits beside it (`:18`), confirming a Firebase-emulator dev workflow. |
| `stlv.showPanelAfterFlyTo` / `hidePanelAfterFlyTo` | `false` | UI flags. |
| `stlv.occupiedPropertyTimelines` | `"hide"` | URL-overridable switch (below). |

Two commented score floors (`vacantBldgScoreFloor = 65`, `vacantLotScoreFloor = 35`, `:19-20`) are legacy and `undefined` at runtime (see §5.5 / §7.12).

**The `occupiedPropertyTimelines` URL switch (`:23-26`):** defaults to `"hide"`; if `window.location.search` contains `occupiedPropertyTimelines=`, the value is parsed out. It is consumed at `:4735` — for public users, the vacancy-timeline / score UI is suppressed on properties with `Vacancy == 0` (occupied) unless this flag is `"show"`. The deep-link generated at `:3810` hard-codes `?occupiedPropertyTimelines=show#<ParcelId>`, so the feature is reachable via a crafted link.

**`panoInit` (`:27-34`)** is registered here as the async `callback` for the Google Maps loader (`:91`); it constructs the Street View panorama into `#pano` (chrome-less: no address/pan controls, links enabled).

### 3.2 Page shell

The body (`homepage.html:675-838`) is a static shell the script mutates: a 40px `#header.branded` with dual title spans `.lsemBrand`/`.publicBrand` (`:678`); `#sidePanel`, `#panelTab`, `#list`, `#cases`, `#map`, `#pano`; two filter `<nav>`s keyed by a `brand` attribute — `nav.filter-group.lsemBrand` (`:715`) and `nav.filter-group.publicBrand` (`:757`); `#mainMenu` with Log in/Log out/About (`:785-791`); and the FirebaseUI mount `#firebase-outer > #firebaseui-auth-container` (`:792`). (Design system / layout detail is in §10.1.)

### 3.3 Geo-math utility helpers

| Helper | Lines | What it does | Used by |
|---|---|---|---|
| `getDistance(A,B,unit)` | `1584-1611` | Great-circle distance (spherical law of cosines); miles (default) or feet (×5280). | Radius distance test in `getItemsWithinRadius` (`:1806`). |
| `Number.prototype.toRad/toDeg` | `1613-1619` | Degree↔radian. | Bearing/destination helpers. |
| `pointFromBearingAndDist(coords,brng,dist)` | `1621-1637` | Destination point from bearing+distance (feet→km→/6371). | Bounding-box corners for spatial tile query (`:1742-1786`). |
| `withinRadius(...)` | `1639-1641` | **Empty stub**; real logic is `getItemsWithinRadius`. | — |
| `getBearing(A,B)` | `1643-1656` | Initial compass bearing A→B (0-360°). | Street View orientation (`:5112`). |
| `getCompassDirection(deg)` | `1658-1692` | Degrees → 16-point compass label. (**Defect:** `:1668` duplicates the `"ESE"` label from `:1666` — a copy-paste mislabel, not a crash.) | Human-readable direction labels. |

`getItemsWithinRadius` (`:1734+`) computes a lat/lng bounding box, derives integer "tile" keys of the form `lng-90268lat38654` (`:1746-1758`), batch-fetches nearby parcels from a Firestore collection, and filters by true distance — the shared engine under the neighborhood-context profile builders (§9.3).

### 3.4 Google Analytics (GA4)

GA4 is loaded via the standard gtag snippet (`homepage.html:92-98`): async `gtag/js?id=G-M4M4647JP5`, then `gtag('js', new Date())` and `gtag('config', 'G-M4M4647JP5')`. **Negative finding (grep-verified):** there are **no** `gtag('event', …)` or `gtag('set', …)` calls anywhere — instrumentation is config-only (automatic page-views), with zero custom interaction tracking despite the rich UI.

**Negative finding (grep-verified):** there is **no `localStorage`/`sessionStorage` usage** anywhere. Persistence is a single cookie plus URL params (see §10.4).

---

## 4. Authentication, roles & the two-tier (public vs LSEM) model

### 4.1 Firebase init & FirebaseUI sign-in flow

Firebase is initialized at `homepage.html:51-58` with the public web config (`apiKey …D0EDlV0c`, `authDomain stlvacancycollaborative.firebaseapp.com`, `databaseURL …firebaseio.com`, `projectId stlvacancycollaborative`, `appId 1:994808680795:web:…`). FirebaseUI config `stlv.uiConfig` (`:64-86`):

- `signInOptions`: only `EmailAuthProvider.PROVIDER_ID` (`:68`) — **email/password is the sole method**.
- `credentialHelper: NONE` (`:66`).
- `signInSuccessUrl` is set (`:65`) but `signInSuccessWithAuthResult` returns `false` (`:77`), suppressing FirebaseUI's auto-redirect; the SPA stays in place and reacts via the auth-state listener.
- **Email verification on new accounts:** in the success callback, if `authResult.additionalUserInfo.isNewUser`, it calls `user.sendEmailVerification()` (`:73-76`).
- `tosUrl`/`privacyPolicyUrl` are unfilled FirebaseUI sample placeholders (`'<your-tos-url>'`, `:81-85`) — **(inferred)** copied from the quickstart and never customized.

The widget is instantiated and started at `:88-89`. **Login UX gating (`:853-869`):** clicking `.login` does *not* open FirebaseUI directly — it shows an "Access Limited" dialog stating logins are "only available to Legal Services of Eastern Missouri staff and volunteers"; only `#continueToLogin` (`:864-869`) reveals the widget. `?signin` in the URL auto-opens login for signed-out users (`:1051-1054`). `.sendVerificationEmail` (`:887-894`) resends verification; `.logout` calls `firebase.auth().signOut()` (`:896-904`).

### 4.2 `getIdToken` and Cloud Function authorization

```js
stlv.getIdToken = function(){
    return firebase.auth().currentUser.getIdToken(/* forceRefresh */ true);
}
```
(`:919-921`) Returns a promise for a **force-refreshed** Firebase ID token (JWT), passed as a query param to the two Cloud Functions that must verify the caller server-side: `getAddlMenu?idToken=` (Staff-only menu HTML, `:977-987`) and `getNbrhds?idToken=` (`:6958`). **(inferred)** `forceRefresh: true` guarantees the server's `verifyIdToken` won't reject a stale credential; the ID token is the authorization proof the static client cannot fake (unlike the role it reads from RTDB purely for UI).

### 4.3 Auth-state listener, roles & the two-tier split

`firebase.auth().onAuthStateChanged` (`:936-1058`) is the central dispatcher. On sign-in it hides login UI, swaps `.login`→`.logout`, derives a `shortName` from `displayName`, and populates `stlv.user.{email,id,emailVerified}` (`:952-954`). It then:

1. **Auto-provisions `/users/{uid}`** (`:958-966`): reads the node once; if absent, writes `{email, fullName}`. So `/users` is a self-service profile store seeded on first login.
2. **Reads `/roles/{uid}`** (`:967-968`): `stlv.user.role = snapshot.val()`. This RTDB path is read-only from the client (the authorization source-of-truth, set out-of-band by an admin).

Role drives data loading and UI:

| Role (`stlv.user.role`) | Data load | Extra UI | Code |
|---|---|---|---|
| `Staff` | `loadPrivateData()` → subscribes to **all** of `/apiCases/` | `getAddlMenu?idToken=` menu items | `:969-988` |
| `Evaluator` | `loadPrivateData()` → **all** cases | — | `:969-973` |
| `Ext Firm` / `Neighborhood Client` | only if `emailVerified`: `getAssignedCases?email=&uid=` then `loadPrivateData(obj.cases)` → **only assigned** cases | if unverified, shows `emailNotVerified` message | `:989-1007` |
| `Guest` | none | counts as LSEM brand only | `:1009` |
| any of the above set | — | flips to LSEM brand | `:1009-1022` |

The admin-vs-scoped distinction is the crux: `loadPrivateData(false)` attaches a live listener on the **entire** `/apiCases/` tree (`:1083-1089`), whereas `loadPrivateData(individCases)` fetches only the case ids returned by `getAssignedCases` (`:1090-1104`). **(inferred)** This per-node read pattern implies RTDB security rules scope external/neighborhood roles to their assigned nodes.

**Brand flip (`:1009-1022`):** only a recognized LSEM role makes the app inject the ReEntries filter, add the `Cases` tab, set `stlv.brand="lsem"`, add the `.lsem` class, show `.lsemBrand`/hide `.publicBrand`, set `document.title = 'LSEM Vacancy Explorer'`, draw LSEM layers, and call `changeFavIcon()`. **A signed-in user with a null/unrecognized role stays `brand="public"`** — "public" is *not* synonymous with "anonymous." Authorization is purely client-enforced for *display*; real protection rests on Firebase security rules + Cloud Function `idToken` verification (not visible in client source).

On **sign-out** (`:1027-1057`): role cleared, `stlv.cases={}`, case markers and LSEM-only DOM removed, title reset to `'STL Vacancy Map'`, `brand="public"`, public layers redrawn, favicon reset. There are thus **three `document.title` values**: static `"STL Vacancy Explorer"` (`:5`), `"LSEM Vacancy Explorer"` (`:1018`), and `"STL Vacancy Map"` (`:1032`).

**`changeFavIcon`** (`:923-934`) points a `link[rel*='icon']` at `favicon.ico` for public or `images/lsem-site-icon-32x32.png` for LSEM, called at every brand transition (`:1021`, `:1056`).

---

## 5. Map rendering engine (Mapbox GL JS v1.12.0)

All line references are to `homepage.html`. The map is a single global `const map` created inside `map.on('load', …)`.

### 5.1 Map instance, token & base style

```js
mapboxgl.accessToken = '<MAPBOX_PUBLIC_TOKEN_redacted>';
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/godavem/ckl2xx4mk1vz417p1634xly6h', // 'mapbox://styles/godavem/cjpyvtbly3g862qmtui14qcmn',
    center: center, zoom: zoom
});
```
(`:1429-1435`) The active base style is the custom Studio style `…ckl2xx4mk1vz417p1634xly6h`; a second style `cjpyvtbly3g862qmtui14qcmn` is present but commented out. Initial `center`/`zoom` come from the saved-state cookie if present (`:1424-1427`), defaulting to zoom 16.3 / `[-90.250070, 38.668139]` (downtown St. Louis).

**Vestigial asset (FACT):** `map.loadImage('images/hashpattern.gif', …)` registers an image named `hashpattern` (`:1437-1441`) that no paint/layout expression references — **(inferred)** dead leftover of an abandoned hatched fill.

**Controls (FACT):** a Mapbox Geocoder (`:5854`, see §10.2), a `NavigationControl({showCompass:false})` (`:5996`), and an imperial `ScaleControl` (`:5999`). No GeolocateControl.

### 5.2 Sources (`addSource`) — 7 total

| Source id | Type | URL / data | source-layer | Purpose |
|---|---|---|---|---|
| `nbrhds` | geojson | local `nbrhds_4326_sm.geojson` (`:2496-2499`) | n/a | Neighborhood boundary polygons |
| `parcels` | vector | `mapbox://godavem.stlvPrclFull5` (`:2521-2524`) | `PrclFull` | Full per-parcel attribute polygons; drives all colored **fill** layers |
| `parcel_circles` | vector | `mapbox://godavem.0ljoulq8` ("Manual upload 5/8/2024"; commented alts `stlvPrclLean5`, `d76gsf1y`) (`:2527-2532`) | `stlvPrclLeanManualUpload-cvtr4h` | Lean centroid points; low-zoom **circle** proxies |
| `parcels_all` | vector | `mapbox://godavem.stlvPrclAll5` (`:2534-2537`) | `PrclAll` | **Every** parcel; boundary lines + hover/click hit-target |
| `condemned` | geojson | runtime from Firestore `parcels where Condemned==true` (`:6999-7002`) | n/a | Structural condemnations |
| `propNS` | geojson | from Firestore `parcels where PropNS==true` (`:7062-7065`) | n/a | "Prop. NS" properties |
| `povertyZoneSrc` | geojson | Firestore `misc/povertyZone` doc, JSON-parsed (`:5821-5824`) | n/a | Poverty-zone overlay |

**(inferred)** The three vector tilesets are differently-precomputed views of one parcel dataset: `PrclFull` (heavy, all attributes, polygons), `PrclAll` (geometry for every parcel for boundaries/picking), and `0ljoulq8`/`PrclLean` (light centroid points so thousands of colored dots paint cheaply when zoomed out).

### 5.3 The circle↔fill zoom crossfade idiom

Every vacancy class is drawn **twice** — a `fill` from `parcels` (`PrclFull`) and a `circle` from `parcel_circles` — swapping representation by zoom:

- **PUBLIC layers do a true crossfade.** `public_bldg` fill fades in `fill-opacity` interp `12.9→0, 13.2→1` (`:2991-2995`); `public_bldg_circle` fades out `circle-opacity` `12.9→1, 13.2→0` (`:3053-3057`).
- **LSEM layers do NOT fade the fill.** `lsem_private_vacancies` (fill) has **no `fill-opacity`** (`:2692-2700`) — always opaque; only the LSEM circles fade out (`13→1, 13.1→0`, `:2718-2722`).
- Circle radii interpolate by zoom (LSEM `9→1, 13→3` at `:2714-2717`; public bldg `10→0.5, 13→2.5` at `:3048-3052`; public lot `9→0.5, 13→2.5` at `:3160-3163`).

### 5.4 Complete layer inventory

PUBLIC = `drawPublicLayers` (`:2890-3208`); LSEM = `drawLsemLayers` (`:2611-2886`). Drawing one brand removes the other's layers (`:2613-2615`, `:2896-2898`).

| Layer id | Type | Source / src-layer | Filter (key parts) | Key paint/layout | Brand |
|---|---|---|---|---|---|
| `nbrhdHighlight` | line | `nbrhds` | `["==","NHD_NAME",nbrhd]` | yellow `rgba(255,210,28,0.6)`; width `11→1,16→9`; beforeId `road-label` | both |
| `neighborhoods` | line | `nbrhds` | none | `hsl(131,11%,37%)`; opacity `11→0.7,16→0.3`; beforeId `road-label` | both |
| `parcels_all` | fill | `parcels_all`/`PrclAll` | `minzoom:15` | `fill-color rgba(0,0,0,0.01)`; `fill-outline-color` `15→transparent,18→black`; beforeId `country-label` | both (hover + click hit-target) |
| `lsem_private_vacancies` | fill | `parcels`/`PrclFull` | non-LRA/LCRA, non-MPO owner, has bldg, `Vacancy>10 & Tax>5 & Nuisance>5` | composite-score **gray→blue** ramp | LSEM |
| `lsem_private_vacancies_circle` | circle | `parcel_circles` | same | gray→blue; radius `9→1,13→3`; opacity `13→1,13.1→0` | LSEM |
| `lsem_private_vacancies_multi` | fill | `parcels`/`PrclFull` | same but `["in","OwnerName",…mpos]` | composite-score **gray→red** ramp | LSEM |
| `lsem_private_vacancies_multi_circle` | circle | `parcel_circles` | same | red ramp | LSEM |
| `lsem_lra_vacant_bldgs` | fill | `parcels`/`PrclFull` | `(IsLra OR IsLcra) AND (BldgsRes>0 OR BldgsCom>0)` | solid `rgba(150,100,50,0.6)` brown | LSEM |
| `lsem_lra_vacant_lots` | fill | `parcels`/`PrclFull` | `(IsLra OR IsLcra) AND Type=="Empty Lot"` | `rgba(150,100,50,0.25)` light brown | LSEM |
| `lsem_private_vacant_lots` | fill | `parcels`/`PrclFull` | `!IsLra & !IsLcra & Type=="Empty Lot"` | `rgba(130,130,50,0.25)` olive | LSEM |
| `public_bldg` | fill | `parcels`/`PrclFull` | `(BldgsRes>0 OR BldgsCom>0) AND VacDesc!="Not Vacant"` + per-parcel `masked` exclusions | categorical **Reds** by certainty; `fill-opacity 12.9→0,13.2→1` | PUBLIC |
| `public_bldg_circle` | circle | `parcel_circles` | same | Reds; radius `10→0.5,13→2.5` | PUBLIC |
| `public_lot` | fill | `parcels`/`PrclFull` | `Type=="Empty Lot" AND VacDesc!="Not Vacant"` | categorical **Greens** by certainty | PUBLIC |
| `public_lot_circle` | circle | `parcel_circles` | same | Greens; radius `9→0.5,13→2.5` | PUBLIC |
| `parcels-highlighted` | fill | `parcels_all`/`PrclAll` | `["in","OwnerName",…owners]` minus current parcel | yellow `rgba(255,255,0,0.6)` | both (MPO portfolio, `:5466-5476`) |
| `condemned` | circle | `condemned` geojson | n/a | orange `rgba(255,135,0,1)`; radius `13→2…19→20`; black stroke (`:7013-7024`) | both (toggle) |
| `propNS` | symbol | `propNS` geojson | n/a | `icon-image` by `PropNSStatus` (Denied/Ineligible→denied marker); `icon-anchor:'bottom'` (`:7067-7080`) | both (toggle) |
| `povertyZone` | fill | `povertyZoneSrc` geojson | `minzoom:9` | `rgba(255,0,0,0.08)`; beforeId `country-label` (`:5825-5835`) | both (toggle) |

A 19th `addLayer` (`public_bldg_insp`, a green outline of parcels with a Housing-Conservation inspection date, `:2971-2981`) is fully commented out.

### 5.5 Data-driven styling — two coloring paradigms

This is the substantive public-vs-authenticated difference.

**PUBLIC = categorical certainty via `["case"]`.** `public_bldg` paints a ColorBrewer-style **Reds** sequence by vacancy certainty (`:2996-3036`):

```
["case",
  ["==",["get","IsLra"],true],             "rgba(193,34,38,1)",
  ["==",["get","IsLcra"],true],            "rgba(193,34,38,1)",
  [">",["get","VacRegMonths"],0],          "rgba(193,34,38,1)",
  ["==",["get","VacDesc"],"Definite"],     "rgba(193,34,38,1)",   // darkest
  ["==",["get","VacDesc"],"Very Likely"],  "rgba(235,106,79,1)",
  ["==",["get","VacDesc"],"Possible"],     "rgba(243,174,149,1)",
  ["==",["get","VacDesc"],"Indeterminant"],"rgba(251,228,218,1)", // lightest
  "rgba(0,0,255,1)"]                                              // blue fallback (filtered out)
```
`public_lot` uses identical structure but a **Greens** ramp (`112,164,130`→`223,240,229`, `:3112-3147`). LRA/LCRA-owned and registered-vacant parcels are forced to the most-certain swatch. The public map thus encodes *model confidence that a parcel is vacant* (buildings red, lots green), with no numeric score exposed.

**LSEM = continuous composite-distress ramp + owner-portfolio split.** Color is computed arithmetically from `S = Vacancy + Nuisance + Tax`, clamped to 255 via `["case", S<=255, S, 255]`, assembled into an `rgba()` string at runtime inside `["let", …]`+`["concat", …]` (`:2695-2699`):
- `lsem_private_vacancies` (single owner): `red=green=210·(255−S)/255`, `blue=210+35·(S/255)` → **gray→blue** (S=0 → `(210,210,210)`, S=255 → `(0,0,245)`).
- `lsem_private_vacancies_multi` (MPO, owner ∈ `stlv.mpos`): `red=210+35·(S/255)`, `green=blue=210·(255−S)/255` → **gray→red** `(245,0,0)`.

So authenticated users get a continuous gradient (not 4 buckets), a red-vs-blue multi-owner split, extra dedicated layers (LRA buildings/lots, private lots), and richer filters.

**Expression idioms (FACT):** there are **no `match` or `step` expressions** — categorical layers use `["case"]`; continuous ramps use arithmetic inside `["let"]`+`["concat"]` (hand-rolled color strings); native `interpolate` is used only for zoom-driven width/radius/opacity, never color.

**Vestigial score floors (FACT):** `vacantBldgScoreFloor=65` / `vacantLotScoreFloor=35` are commented out at definition (`:19-20`) and *every* usage (`:2960`, `:3030-3034`, `:3081-3088`, `:3142-3146`) sits inside `/* … */`. They are `undefined` and never read; the old continuous-`Score` color ramp they fed was superseded by the categorical `VacDesc` scheme. **Do not confuse these dead floors with the live thresholds** `Vacancy>10`, `Tax>5`, `Nuisance>5` (`:2678-2680`).

### 5.6 Filtering pipeline (`updateFilters`, `:6812-6938`)

Base per-layer filters are stored in `stlv.layerFilters[id]` at draw time. `updateFilters` rebuilds the active filter as `stlv.layerFilters[id].concat(addonArray)` and applies it with `map.setFilter` to the active brand's layers (`:6935-6938`). `addonArray` is assembled from UI checkboxes (see the full filter table in §10.8). **Privacy redaction (FACT):** parcels listed in Firestore `misc/masked` are appended as `["!=","ParcelId", id]` clauses to the public-building filter (`:2964-2968`).

### 5.7 Neighborhood highlight, condemnation & Prop. NS

`stlv.highlightNeighborhood(nbrhd, save, flyTo)` (`:2439-2488`) removes any existing `nbrhdHighlight` layer and re-adds a yellow `line` layer filtered to `["==","NHD_NAME",nbrhd]`. The current selection is recovered by reading the layer's own filter back out: `map.getLayer('nbrhdHighlight').filter[2]` (`:1464`, `:5407-5409`).

`renderCondemnationLayer` (`:6985+`) queries Firestore `parcels where Condemned==true`, builds a point FeatureCollection, and adds the orange `condemned` circle layer (toggled by `#condemned`). `renderPropNSLayer` queries `parcels where PropNS==true`, loads `images/PropNS.png`/`PropNS-denied.png`, and adds the `propNS` **symbol** layer whose icon depends on `PropNSStatus`. **(inferred)** "Prop. NS" = St. Louis **Proposition NS** ("Neighborhood Stabilization") bond/acquisition program; the code only exposes the boolean `PropNS` and the `PropNSStatus` enum.

### 5.8 Interaction model & the absence of feature-state

- **Hover popup** `identifyFeatures` (`:2571-2606`): on `mousemove` (throttled >12px), `map.queryRenderedFeatures(point, {layers:['parcels_all']})` builds an address popup from `LowAddrNum, StPreDir, StName, StType` + `PropNSStatus`, reusing one `mapboxgl.Popup`.
- **Click** handlers are bound per layer — `lsem_private_vacancies`, `…_multi`, `public_bldg`, `public_lot`, `parcels_all` (`:5618-5654`) — routing to `stlv.layerClick`. The `parcels_all` click does a Firestore `parcels/{ParcelId}` lookup to enrich the feature (`:5643-5654`).
- **HTML markers, not symbol layers,** for POIs: owner-portfolio pins (`new mapboxgl.Marker(el)`, `:5503-5513`); the selected parcel uses `.marker.selectedParcel`.
- **Feature-state (FACT — none):** there are **no** `setFeatureState`/`feature-state`/`promoteId`/`generateId` calls. All selection/highlight effects use dedicated filtered layers (`nbrhdHighlight`, `parcels-highlighted`) and DOM markers, avoiding feature-state's requirement for stable vector-tile feature ids.

### 5.9 Zoom-dependent rendering

Circle/fill crossfade at z≈13 (§5.3); `parcels_all` boundaries only `minzoom:15`; `povertyZone` `minzoom:9`; line widths/opacities interpolate by zoom; on `zoom`, popups hide and HTML owner-portfolio markers show below z15 / hide ≥z15 (`:6077-6084`).

---

## 6. Data model

### 6.1 Three overlapping stores (the key insight)

The site has **three overlapping stores of parcel data**, and the published CSV's field names are *not* the field names the running app consumes:

1. **The public CSV export** — `https://www.publicgoodness.org/stlv/csv/stl_vacancy_data.csv` (36 columns). A flat published artifact whose only in-app consumers are (a) the `multi_property_processor` build that regenerates `mpo.js` (`homepage.html:36`) and (b) the stats page; **the live map never reads it.**
2. **The Mapbox vector tilesets** (`godavem.stlvPrclAll5/Full5/Lean5`) — carry geometry plus a *renamed and extended* property set for fast client-side filtering and choropleth paint.
3. **Firestore `parcels`** — the authoritative per-parcel record the side panel pulls live (keyed by `ParcelId`), plus supporting collections.

**Proof the CSV is a sibling export, not the runtime source** — grepping each CSV column against `homepage.html`:

| Bucket | Fields | Evidence |
|---|---|---|
| CSV-only (absent from client) | `StAddrNum`, `StNameFull`, `Ward10`, `CensTract20`, `CensTract10`, `Type2`, `Vacancy2`, `VacancyCat`, `VacancyCat2`, `BurdenCat`, `VioMajor`, `OwnerChange`, `BldgAge`, `OwnerName2` | 0 grep hits |
| Renamed (concept present) | `ParcelSqFt`→`SqFt`; `Lat/Lng`→`lat/lng`; `IsLRA`→`IsLra`+`IsLcra`; `VacancyCat`→`VacDesc`; `BoardUp`→`BuildingDivisionBoardUps`/`Boardup`; `Forestry`→`ForestryType`/`ForestryMaintenance`; `CSBVacancy/CSBNuisance`→recomputed booleans | grep |
| Shared name | `ParcelId`, `Handle`, `Zip`, `Ward20`, `NhdName`, `Type`, `OwnerName`, `OwnerState`, `OwnerZip`, `Vacancy`, `Burden`, `TaxYrsDel`, `VacRegMonths`, `Condemned` | used directly |
| Live-only (richer than CSV) | `Nuisance`, `Tax`, `TaxAmt`, `ForestryAmt`, `VacBldgAmt`, `VacDesc`, `BldgsRes`, `BldgsCom`, `ResUnits`, `CompanyId`, `CompanyInactive`, `PropNS`/`PropNSStatus`, `Address`, `OwnerAddr`/`OwnerCity`, `CondemnDate`, `AnyScore` | `:2675-80`, `:3438-54`, `:6365` |

### 6.2 Full CSV schema & field meanings

The 36 published columns are `ParcelId, Handle, StAddrNum, StNameFull, Zip, Ward20, Ward10, NhdName, CensTract20, CensTract10, Lat, Lng, Type, Type2, ParcelSqFt, OwnerName, OwnerName2, OwnerState, OwnerZip, OwnerChange, BldgAge, Vacancy, VacancyCat, Vacancy2, VacancyCat2, Burden, BurdenCat, BoardUp, IsLRA, TaxYrsDel, VacRegMonths, VioMajor, CSBVacancy, CSBNuisance, Forestry, Condemned`.

- **Identity:** `ParcelId` (e.g. `22939200000`) and `Handle` (e.g. `12293000200`) are two distinct St. Louis identifiers carried side-by-side and used for *different* joins. `ParcelId` keys external city/assessor lookups (`stlcitypermits ?AsrParcelId=`, `vcpp.stldata.org/parcel_data/<ParcelId>`, `getFallbackCityData?parcelid=`, LRA "Buy Now") **and** the Firestore `parcels` doc id; it is also written to `window.location.hash` (`:3465`). `Handle` keys the *other* Firestore collections (`propertyValues.doc(handle)`, `reEntry.doc(Handle)`, `profilingBaseline.doc(handle)`) and is the case-join key (`stlv.lookupCaseByHandle`); handles are numeric for range queries.
- **Geography:** `Ward20`/`Ward10` (post-2020 20-ward vs legacy) and `CensTract20`/`CensTract10` (2020 vs 2010 tracts); the app uses only the `20` variants.
- **Classification:** `Type`/`Type2` take values like `Empty Lot`, `Single-Family`, `Multi-Unit`, `Commercial`. The decisive UI split is building-vs-lot via `props.Type == "Empty Lot"`. **(inferred)** `Type` is current land-use, `Type2` an alternate/historical class (never read client-side). Live building-type filtering uses `ResUnits`/`BldgsRes`/`BldgsCom` counts, not `Type`.
- **The two vacancy measures (CSV):** `Vacancy`/`VacancyCat` is a small integer (sample 2-3, labeled "Not Vacant") — **(inferred)** a conservative confirmed-indicator count; `Vacancy2`/`VacancyCat2` is a graduated likelihood score (sample 24-60, tiers "At risk"→"Possible") — **(inferred)** the model's vacancy-likelihood score. The **live** feature property `Vacancy` plus categorical `VacDesc` (`Definite`/`Very Likely`/`Possible`/`Indeterminant`/`Not Vacant`) sits on the *graduated* (~0-100) scale, matching CSV `Vacancy2`'s range. The CSV↔runtime lineage cannot be pinned from static files (names, scales, and category vocabularies diverge) — flagged in §13.
- **Burden/tax:** `Burden`/`BurdenCat` is a graduated public-liability score that aggregates code-violation, nuisance-abatement and an LRA "kicker", **separate** from the `Tax`/`TaxAmt`/`TaxYrsDel` family. `TaxYrsDel` (years delinquent) is bucketed live as `==1/==2/==3/>=4`.
- **Status flags:** `IsLRA`→`IsLra` (Land Reutilization Authority land bank) + `IsLcra` (Land Clearance for Redevelopment Authority) — either ⇒ "Definitely vacant" + LRA "Buy Now" link; `BoardUp` (board-up order); `VacRegMonths` (months on vacant-building registry; `>0` drives a brown color and "X" in lists); `VioMajor` (major open code violations, CSV-only); `CSBVacancy`/`CSBNuisance` (St. Louis **Citizens' Service Bureau** 311 requests categorized vacancy-vs-nuisance); `Forestry` (Forestry Division maintenance); `Condemned` (+ live `CondemnDate`).
- **Owner:** `OwnerName`/`OwnerName2`/`OwnerState`/`OwnerZip` (+ live `OwnerAddr`/`OwnerCity`). `OwnerZip` doubles as the owner-location classifier (in-city `63101-63199`, rest-of-MO, out-of-state). `OwnerChange` is the last deed-transfer date (`1969-12-31` = epoch sentinel/"never"); `BldgAge` building age in years. Live-only `CompanyId` (opencorporates id) and `CompanyInactive` (active vs dissolved business) extend owner data.

### 6.3 Firestore collections (corrected structure)

The orchestrator's facts list conflated collections with documents. The real structure:

| Firestore path | Type | Role (with citation) |
|---|---|---|
| `parcels` | collection, doc id = **ParcelId** | Primary authoritative parcel record. Read by doc (`:3361/5552/5647`), queried by `NhdName`/`Ward20` (`:6451-52`), `Condemned==true` (`:6988`), `PropNS==true` (`:7044`), `AnyScore==true` (`:3746`), `OwnerName in […]` (`:5362`). Successor of `parcels4`/`allParcels`. |
| `allParcels` | collection | **Legacy**, superseded by `parcels` (commented "Previously allParcels"). |
| `propertyValues` | collection, doc id = **Handle** | Valuation/Zillow cache `{amt, addr, handle}`; range-queried by handle (`:1959`), written on lookup (`:2035`). |
| `propertyTax4` | collection | Tax-delinquency records, queried `where('yrsDelinquent',…)` (`:2626`). |
| `reEntry` | collection, doc id = **Handle** | LSEM re-entry program list, queried by `date` range (`:2651`) and handle (`:3469`). |
| `profilingBaseline` | collection, doc id = **Handle** | Stores a `valuationProfile` per parcel (`:2104-06`). |
| `misc` | collection of **singleton docs** | `masked`→ParcelIds hidden from public map; `scores`→scoring-batch cursor `{count,lastHandle,startTime}`; `specialGroups`→curated owner/property groups; `povertyZone`→stored GeoJSON overlay; `compareData`→before/after score-comparison + percentile histograms. |
| `miscSecure` | collection (singleton doc) | `soldByLra`→JSON array of LRA-sold parcels (referenced but commented out, `:955-57`). **(inferred)** rules-gated counterpart of `misc`. |
| `parcelPoints` | collection | **New finding** (from `caseUpload.html:316`): `where("address",">=",…).orderBy("address").limit(1)` to geocode a case address → `lat/lng/handle/ZIP`. Not in the original facts list. |

So `compareData`, `masked`, `povertyZone`, `scores`, `specialGroups` are **documents inside `misc`**, and `soldByLra` a document inside `miscSecure` — not top-level collections.

### 6.4 The MPO (Multi-Property-Owner) system

`mpo.js` is a precomputed build artifact regenerated by `multi_property_processor/index.js` from `vacancy.csv` (`homepage.html:36`). It defines exactly two globals (the file is two long lines):

- **`stlv.mpos`** — a flat array of **~1,866 owner-name strings** (1,865 comma separators): every distinct owner name holding multiple vacant properties. Indices into this array are the currency of the whole system.
- **`stlv.mpoGroups`** — **568** three-letter codes (`AAA`, `AAB`, … sequential), each `{ keys: [indices into mpos], count: N }`. A group consolidates *name variants of the same real owner*. E.g. `AAA:{keys:[0,1,2],count:187}` = `["NORTHSIDE REGENERATION LLC","NORTHSIDE REGENERATION","CASS CORPORATION"]` (Paul McKee's entities, 187 parcels); `AAD:{keys:[13..25]}` collapses ~13 "CARDINAL PROPERTIES OF ST LOUIS …" misspelling/Roman-numeral variants. The `count` is **build-time only** — never read at runtime (filterMpoList recomputes live), which itself signals `mpo.js` is a precomputed snapshot.

**(inferred)** build pipeline: read CSV → tally `OwnerName` → keep owners with >1 property as `stlv.mpos` → fuzzy-match similar names into alias groups → emit `stlv.mpoGroups`.

**Runtime use** (`stlv.mpoKeys = Object.keys(stlv.mpoGroups)`, `:2255`):
- **Map filtering** (`:2667-69`, `:2733-35`): the whole `mpos` array is spliced into Mapbox filters — `nonMpoArg = ["!in","OwnerName", …all 1866]` drives `lsem_private_vacancies` (single owners); `mpoArg = ["in","OwnerName", …]` drives `lsem_private_vacancies_multi`.
- **`getGroup(owner)`** (`:2385-94`): returns the 3-letter code whose `keys` contains `mpos.indexOf(owner)`.
- **`getAliases(owner)`** (`:2396-415`): returns the other name strings in the owner's group.
- **`filterMpoList()`** (`:2281-344`): on each render, `queryRenderedFeatures` tallies visible owners, resolves groups, sums counts across aliases, picks the highest-count alias as `leadName`, sorts descending → `renderMpoList()` paints the upper-right "biggest owners in view" list.
- **`renderOtherPropertiesOwned`/`fetchAllProperties`** (`:5315-69`): clicking an owner queries Firestore `parcels.where("OwnerName","in", batchOf10)`. Northside Regeneration is hard-special-cased (1500+ properties summarized, `:5323-26`); `LRA`/`CITY OF ST. LOUIS`/`UNITED STATES OF AMERICA` are skipped.

**Observed bug (citable):** in `fetchAllProperties` `:5350`, `aliases.concat(stlv.getAliases(owner))` discards its return value (`concat` doesn't mutate), so `aliases` stays `[owner]`. The Firestore `where("OwnerName","in", ownerArray)` therefore fetches **only the exact owner string, never alias variants** — the upper-right MPO list does aggregate aliases (via `getGroup` in `filterMpoList`), but the per-owner "other properties owned" side panel does **not** expand to alias spellings.

---

## 7. Vacancy scoring & timeline engine

This subsystem recomputes a parcel's vacancy/risk profile **on demand, in the browser, from live city open-data** — it does not just read a precomputed score. The stored CSV/Firestore `Vacancy`/`Burden`/`VacancyCat` columns are the *output of a prior (Node-side) run of this same function*; the browser recomputes them to display the live breakdown.

### 7.1 Dual execution model: `web` vs `node`

`scoreAndTimeline = function(data, parcel, backDate=false, forceNode=false)` (`:3907`):
```js
var web = false;  if(typeof window === "object" && backDate === false) web = true;   // :3909
var node = false; if(typeof window !== "object" || forceNode) node = true;            // :3912
```
- **`web` (browser):** builds the visual bar charts and timeline table; numeric `score.*.total` still accumulate, so the returned `scoreReceipt` is correct.
- **`node` (batch / `forceNode`):** additionally calls `scoreImpact(...)`/`recordImpacts(...)` for a per-factor audit, and uses `FieldValue.delete()` (`:4760-4762`, a Firebase Admin SDK construct). **(inferred)** The identical function is shipped to a Node batch job that writes recomputed scores + monthly snapshots back to Firestore; `backDate` lets the batch recompute a parcel "as of" a past date to build the historical `VacTimeline`.

### 7.2 Inputs

| Input | Source | Used for |
|---|---|---|
| `parcel` | Firestore `parcels` doc / CSV: `Handle, Address, ParcelId, OwnerName, Type, lat, lng, tile` (`:3489-3501`) | identity, building-vs-lot via `Type` |
| `data` (citydata) | `https://vcpp.stldata.org/parcel_data/{ParcelId}` (`:3623`), 5 s timeout; fallback → `getFallbackCityData?parcelid=` (`:3641`) | all event/score evidence |
| `props.VacTimeline` | Firestore `parcels/{ParcelId}` (V01…V48) | historical sparkline |
| `misc/compareData` | Firestore | crime/CSB/valuation percentile ranking (separate from score) |

`data` carries arrays: `IsLra`, `IsLcra`, `VacantBuildingInfo`, `GeneralConstructionPermits`, `PlumbingMechanicalElectrical`, `TaxHistory`, `DemolitionPermits`, `CommercialOccupancyInspections`, `HCESInspections`, `ForestryMaintenance.Services`, `ServiceRequests` (CSB), `BuildingDivisionBoardUps`, `Type`. `buildScore` (`:3573`) injects four `<section>`s (`#vacancy`/`#burden`/`#nuisance`/`#tax`) + a sliding Timeline drawer, then issues the VCPP AJAX call; `fallBackData`/`getErrorMsg` implement VCPP→CloudFunction failover (flipping `stlv.vcppServiceDown`).

### 7.3 "Confirmed vacant" binary overrides

Three conditions force `obj.vacant = true` (later pinning Vacancy to 100, labeled "Definite"): LRA/LCRA ownership (`:3930`, adds a "Buy Now" link); most-recent `VacantBuildingInfo.VacancyStatus === "active"` → "On Vacant Building Registry" (`:3938-3944`); a Condemnation event (`:4351-4355`).

### 7.4 Timeline construction

`obj.timeline[]` maps each city-data array to normalized events `{date, category, type, desc, [amt|est], [vacancyIndicator], [nuisanceIndicator]}`:

| Source array | category | Notes / flags | Line |
|---|---|---|---|
| `GeneralConstructionPermits` | Permit | `est=ProjectCost` | `:3949` |
| `PlumbingMechanicalElectrical` | Permit | Plumbing/Electrical/Mechanical | `:3963` |
| `TaxHistory` (TaxBal>0) | Tax | `amt=TaxBal`; counts **consecutive** delinquent years → `taxYrsDel` | `:3985` |
| `DemolitionPermits` | Demolition | flags "result is a vacant lot" | `:4005` |
| `CommercialOccupancyInspections` | Inspection | "Commercial Occupancy" | `:4022` |
| `HCESInspections` | Inspection | "Condemnation" in desc → `vacancyIndicator="strong"`; parses violation counts | `:4039` |
| `ForestryMaintenance.Services` | Forestry | `amt=ServiceAmount` | `:4072` |
| `ServiceRequests` (CSB) | CSB | sets indicators iff `PROBLEMCODE ∈ csbVacancyIndicators/csbNuisanceIndicators` | `:4090` |
| `VacantBuildingInfo` | Vacant Bldg | registry add/update; invoices `amt=CurrentFee` | `:4108` |
| `BuildingDivisionBoardUps` | Board up | `vacancyIndicator="strong"`, `nuisanceIndicator=true`, `openings` | `:4153` |
| `obj.ResSaleDate`/`OwnerUpdate` | Ownership | "Sale of Property" → ownerChange | `:4170` |

The CSB allow-lists are `stlv.csbVacancyIndicators` (`:3505`, e.g. "Debris-Vacant Bldg","Vacnt Bldg Unsecured","WTR-VACANT-BLDG") and `csbNuisanceIndicators` (`:3506`). Events sort **newest-first** via `compare(a,b,prop)` (`:4190-4197`); exact duplicates spliced out (`:4200-4211`).

### 7.5 Scoring loop & the "open valve" model

State init (`:4214`): `score = {vacancy:{total:0,open:true,count:0}, nuisance:{…open:true}, tax, burden, boardUpCount:0, permitTotal:0, ownerChange:false, occupancyPermit:false, …}`; `month = 1000*60*60*24*30.4`. The loop walks events newest→oldest; `monthsAgo = parseInt((now - event.date)/month)` (`now` is real time unless `backDate`). **"Open valves":** `score.vacancy.open`/`nuisance.open` start `true` and are shut by the *most recent* terminating event (a recent occupancy permit closes the valve before older vacancy evidence is reached, so that evidence no longer counts):
- Occupancy/commercial permit issued → both valves closed, records `occupancyPermitAge` (`:4263-4274`).
- Demo complete / "result is a vacant lot" → both closed (`:4275-4285`).
- `inspectionComplied=true` when a Complaint/Housing-Conservation desc contains "Complied"/"Abated" (`:4258-4262`), later zeroing those vacancy contributions.
- `permitTotal` accumulates permit `est` (only while `boardUpCount===0`), used to nullify board-up scoring.

**Vacancy contribution (`:4302-4373`, while `vacancy.open`):** default `amount=25`; `"strong"` indicator → 75; Empty-Lot inspection → 0; complied complaint → 0. By class: board-up (non-lot) → diminishing returns `1/boardUpCount * amount` if `permitTotal<10000`, else 0; condemnation → `amount` with **no age decay** (sets `Condemned`); everything else → `stlv.diminish(amount, monthsAgo)`. Forestry/CSB on owner-changed parcels → 0; contributions ≤2 discarded.

**Nuisance + Burden (`:4376-4426`, while `nuisance.open`):** `amount=20`, `diminish(20, monthsAgo)`; surviving values added to **both** `score.burden.total` and `score.nuisance.total` (burden and nuisance share per-event evidence, surfaced under different brands). **(inferred bug)** the board-up branch recomputes `amount = 10 + Σ(10·0.85^k)` (`:4384-4391`) *after* `nuisanceScore` was set from 20, so that figure is never used.

**Major-violation burden (`:4429-4474`):** for `Inspection` "Complaint"/"Door to Door" with `" major "` in desc and a qualifying result, `amount = Math.log(violations)*20` (`amount=11` if 1 violation), `diminish(amount, monthsAgo/3)` (decays ~3× slower). **(inferred bug)** the `scoreImpact` labels here are transposed (`:4461`/`:4472`).

**Tax (`:4475-4514`):** `taxScore=25` flat per delinquent year → `tax.total`; `burdenScore = parseInt(4 + amt/50)` → `burden.total`. Dollar amounts (when `!ownerChange`) accrue to `scoreReceipt.TaxAmt` + 3-year `TaxAmts[]`.

**Generic fees — Forestry & Vacant-Bldg invoices (`:4516-4557`):** `amount = parseInt(1 + amt/30)`, ×1.666 for vacant-lot Forestry, then `diminish(amount, monthsAgo)`.

### 7.6 Age decay: `diminish`

```js
stlv.diminishBy = [1,1,1,0.99,0.97,0.94,0.91,0.87,0.83,0.79,0.75,0.72,0.69];   // :3507
stlv.diminish = function(amount, time, factor = 0.95){                          // :3508
    time = parseInt(time); if(time<0) time=0;
    if(time < stlv.diminishBy.length) return amount*stlv.diminishBy[time];
    else { amount *= 0.69; while(q++ < time) amount *= factor; return amount; }
};
```
First 3 months carry full weight, tapering to 0.69 at month 12; beyond the table each month ×0.95. **(inferred)** over ~48 months an event decays to ~10%, matching the 4-year sparkline.

### 7.7 Kickers, capping, verbal bands, finalization

Two flat kickers: Forestry "vacant" kicker `+75` to vacancy when `ForestryType` contains "Vacant"/"VB"/"VL" and no recent occupancy permit (`:4583-4602`); LRA/LCRA burden kicker `+70` when `IsLra||IsLcra` and `burden.total<100` (`:4604-4618`). Then per score: **cap at 100** (`:4659`), `Math.round`, verbal band:
- Vacancy: ≥70 "Very Likely", ≥30 "Possible", ≥10 "Indeterminant", else "Not Vacant".
- Burden/Nuisance/Tax: ≥90 "Extremely High" … ≥10 "Very Low", >0 "Minimal", else "Zero" (`:4665-4682`).
- Confirmed-vacant override: `obj.vacant===true` → vacancy=100, "Definite" (`:4689-4697`).

`VacDesc = vacancy.verbal` (`:4700-4703`) — **(inferred)** the categorical-vacancy field the export pipeline writes (its graduated-scale CSV analogue is `Vacancy2`/`VacancyCat2`, not the small-integer `VacancyCat`; the verbal vocabularies don't match the CSV samples — see §6.2/§13) and the value the live map filters on (`["!=","VacDesc","Not Vacant"]`, `:2954`). **Brand gating (`:4734-4752`):** public brand strips all four sections for zero-Vacancy (unless `?occupiedPropertyTimelines=show`); `lsem` drops `#burden`, public drops `#nuisance`/`#tax`; `Vacancy<30` also removes `#burden`. `AnyScore` set true if any score >0. Finally `scoreReceipt[monthStamp] = Object.assign({}, scoreReceipt)` snapshots a trimmed copy keyed `YYYY-MM` (`:4771-4783`) — the monthly snapshot that accretes into `VacTimeline` and the Stats trends.

### 7.8 `scoreImpact` / `recordImpacts` (node-only audit)

`stlv.scoreTypes` (`:3834`) and `stlv.factors` (`:3835`, e.g. CSB/Board up/Inspection/Forestry/LRA/Tax/Vacant Bldg) drive `scoreImpact(score, category, amount)` (`:3837`) which keys a running sum/count by e.g. `"vb"` (vacancy-from-board-up). `recordImpacts(type)` (`:3848`) totals each type, **proportionally scales contributing factors by `100/total` when >100** (the audit analogue of the hard cap), rounds, and folds into `stlv.impactTotals[scoreType][factor]{sum,count}` bucketed `bldg` vs `lot`.

### 7.9 `renderTimelineChart` — "Indicators Over Time"

`stlv.renderTimelineChart(tlprops)` (`:3373`) draws an SVG filled-area chart of the vacancy score over 48 months: a `<polygon>` of 48 points, x-step 4.5px, y = `48 - 48*(V/100) + 1`, fill `#a6b1ec`/stroke `#5561a0`. If all `V01..V48` equal current `Vacancy` it prints "Unchanged over last 4 years." Rendered only for non-LRA/LCRA parcels.

### 7.10 `initScoreCompare` / `runScoreCompare` — internal QA harness

A developer tool (full-screen "Properties with Vacancy Score Changes" table + dot map over `scoreCompareMap.png`) auditing recomputed vs stored scores. `runScoreCompare` (`:3738`) loops up to 250× (5 s apart), samples a random `AnyScore==true` parcel via a weighted-random address-prefix trick, recomputes with `forceNode=true`, and plots green/red/blue dots. **(inferred)** partly broken/abandoned: `:3754` references `parcel.ParcelId` where the in-scope variable is `props`, and it hardcodes the `"2021-04"` baseline.

### 7.11 Percentile ranking vs the city (`baselineCompare`)

Distinct from the vacancy score: the "Comparison to All Vacant Properties" dialog (`:6127`) ranks a property's crime/CSB/valuation profiles against all vacant properties using histograms in `misc/compareData`. `percentile = Math.round((thisParcel/total)*100)` over a 112-bin histogram (`:6187`); `getPercentileDesc` (`:6220`) maps to 13 verbal bands ("Extremely Low"…"Extremely High").

### 7.12 The score floors are dead/legacy

`vacantBldgScoreFloor=65` / `vacantLotScoreFloor=35` are commented out (`:19-20`); every reference lives inside `/* … */` (the filter at `:2957-2961`, the RGB-gradient paint at `:3030-3144`). **(inferred)** This was a prior scheme: a single composite tileset `Score` (+`Score_Tax`, not in the CSV) floored at 65/35 with a ramp normalizing `(Score − floor)` across 165. The current map colors by categorical `VacDesc` (§5.5/§7.7).

---

## 8. Backend: Cloud Functions, Firebase data flow & the LSEM case system

All findings derive solely from static client code; **no live backend store was queried.**

### 8.1 The Cloud Functions tier

All ten functions live under `stlv.cloudFunctionsDomain` (`:17`; commented localhost emulator at `:18`). Every call is a plain jQuery `$.ajax` GET with query-string params. They split by (a) auth tier and (b) whether the call site is reachable:

| Function | Call site | Params | Returns | Inferred purpose | Auth tier |
|---|---|---|---|---|---|
| `getAddlMenu` | `:981` | `idToken` | HTML | Server-rendered admin menu, gated by verifying ID token + Staff role | **idToken-verified** (only when role==Staff) |
| `getAssignedCases` | `:994` | `email`,`uid` | JSON `{cases:[…],neighborhoods:[…]}` | Case IDs/neighborhoods a non-staff user may see | **Weak identity** — raw `email`+`uid`, not a token |
| `getNbrhds` | `:6958` | `idToken` | HTML menu | Neighborhood-client menu | **idToken-verified but DEAD** (`activateNbrhdClient` invocation commented out at `:6977`; `idToken` not in scope) |
| `getNeighborhoods` | `:3319` | `lng`,`lat` | — | Point→neighborhood lookup | **DEAD** (commented out) |
| `convWGS84ToNAD83` | `:3310` | `lng`,`lat` | JSON `{x,y}` | Convert WGS84→Missouri State Plane NAD83 X/Y for the CSB form | Public |
| `getFallbackCityData` | `:3641`,`:3687` | `parcelid` | JSON citydata | Mirror/cache of vcpp on timeout | Public |
| `getOrgs` | `:3234` | `lng`,`lat` | JSON `[{id,name}]` | Point-in-polygon neighborhood-org lookup → neighborly.info links | Public |
| `getPetitionText` | `:6273` | `handle` | HTML | Legal petition text for a property | Public |
| `getSign` | `:5094` | `address` | signed URL path | Server-side URL signing of a Street View metadata request | Public |
| `getZillowInfo` | `:1697/1709/1837/1985` | `address` | XML | Proxy to legacy Zillow Zestimate API (injects ZWSID server-side) | Public |

**(inferred)** The "public" functions are open proxies/utilities; the privileged ones gate LSEM case data and rely on the server re-verifying identity, because the client-side role read is cosmetic.

### 8.2 The case data tree: `/apiCases` (RTDB)

Live LSEM cases are stored at **`/apiCases/{caseId}`** (the "api" prefix implies sync from an external case-management system, inferred). Fields observed across `drawCaseMarkers` (`:1132-1139`), `renderCaseInfo` (`:3219-3225`), `casesColumnFields` (`:6609`): `caseId, handle, parcelId, lat, lng, address, zip, neighborhood, legalCode, assignment, statusDetail, caseTitle, openDate, disposition, specialCode, source, orgContact, closeDate, partyName, docket, dateStart, dateEnd, judge, court, provided, usdValue, outcome` — plus child profile objects `crimeProfile`, `csbProfile`, `valuationProfile`.

**`loadPrivateData(individCases=false)`** (`:1061`): Staff/Evaluator → `ref('/apiCases/').on('value', …)` (`:1083`, whole-tree live listener); Ext Firm/Neighborhood Client → per-id `/apiCases/{id}` subscriptions (`:1096`). `initCases` (`:1063`) injects an "LSEM Cases" checkbox, calls `drawCaseMarkers`, and builds `stlv.lookupCaseByHandle` (`:1077-1080`). **`drawCaseMarkers`** (`:1120`) color-codes markers by legal problem code: `el.className = 'caseMarker' + (legalCode === "62" ? " code62" : "") + (legalCode === "91" ? " code91" : "")` (`:1131`). **(inferred bug)** `legalCode === "62"` is a *string* test while `caseUpload.html:423` stores `legalCode` via `parseInt(...)` as a *number* — a type mismatch that would prevent code62/code91 classes from ever applying to cases minted by that path.

### 8.3 Per-case analysis profiles & persistence

Three profile generators compute neighborhood-context statistics around a case's coordinates and route by a `destination` argument:
- **`buildCrimeProfile`** (`:2143`): radii `[500,250,125]` ft, rolling 1/2/3/5/10-yr windows → `totalCrimes/weightedScore/type1Crimes/type2Crimes` weighted by `stlv.crimeScore[]`. **(inferred minor bug)** `:2177` increments `type2Crimes` from the `type1Crimes` accumulator.
- **`buildCSBProfile`** (`:2198`): same radii/windows → `totalIncidents/visibleBlights/healthBlights`.
- **`buildValuationProfilev2`** (`:1936`): nearby `allParcels` within `[325,225,125]` ft, looked up by handle range in the `propertyValues` cache (`:1959`); cache misses call `getZillowInfo` and write the Zestimate back via `propertyValues.doc(handle).set({amt,addr,handle})` (`:2035`).

**Routing:** `"case"` → `writeProfileToCase` (RTDB `/apiCases/{id}` update with `{[profileName]:data, …timestamp}`, `:2121-2138`); `"baseline"` → `writeProfileToBaseline` (Firestore `profilingBaseline/{handle}`, **hardcodes `valuationProfile` regardless of arg**, so baselines are valuation-only, `:2101-2118`); default → `stlv.currentProfile` → `baselineComparePt2` (the public comparison dialog). `writeProfileToBaseline` conditionally calls **`stlv.autoFetchery()`** while `zillowSessionCount < 1200` (`:2110`) — a self-throttling valuation crawler **whose definition is absent from this file** (the runtime counterpart of the commented-out admin parcel-walker `getNextProp`/`resetCapture`, `:3522-3568`).

### 8.4 Presenting cases in the UI

- **`renderCaseInfo(caseId)`** (`:3215`): a compact "Case Information" block, spliced into the parcel side panel when a clicked parcel's `Handle` matches `lookupCaseByHandle` (`:3275-3287`).
- **`renderSidePanelNoHandle(caseId)`** (`:3248`): side-panel path for cases with no matching parcel in the vacancy dataset.
- **`renderCasesView`** (`:6613`): the entire "Cases" tab — a sortable 25-column table over `Object.keys(stlv.cases)`, parsing each `assignment` string `"Name(Role)"` into Primary/Paralegal/Other columns (`:6645-6663`). The `#casesViewLink` is only injected for LSEM roles (`:1012`).

### 8.5 `caseUpload.html` — legacy bulk LSEM upload

A standalone "Case Upload for LSEM" page (favicon/copy reference Legal Services of Eastern Missouri). Flow: parse a CSV (columns `Matter/Case ID#`, `Name`, `Date Opened`, `Legal Problem Code`, `Case Title`, `Case Disposition` — `stlv.fieldsToTransfer`, `:306`) → geocode each `Case Title` against Firestore **`parcelPoints`** (`:316`) → split into "with/without matching parcels" → "Upload & Sync Checked Cases" writes each row to **RTDB `/cases/{caseId}`** (`.set(newCase)` for new, `:425`; `.update({status})`, `:397`), seeding `crimeProfile/csbProfile/valuationProfile/dataSnapShot = false`.

**Critical distinction:** `caseUpload.html` writes/subscribes to **`/cases/`**, whereas the live homepage reads/writes **`/apiCases/`** exclusively. Three signals indicate `caseUpload.html` is **legacy/superseded** (inferred): (1) it loads Firebase SDK **5.8.2** vs **8.3.0** on the homepage and **7.14.0** on stats; (2) it emits ~15 fields but `renderCasesView` consumes ~25 rich fields it never produces; (3) the live data lives under *api*Cases loaded via `getAssignedCases`, consistent with a server-side LSEM sync now being the real population path. **So `caseUpload.html` does not upload into the live `/apiCases` system.**

---

## 9. External data integrations

The Cloud-Function/proxy split (below) is consistent: direct browser calls go to CORS-tolerant services or plain links; Cloud-Function proxies handle the three things the browser cannot — hiding secrets (Zillow ZWSID, the Maps URL-signing secret), bridging non-CORS upstreams, and server-side computation (WGS84→NAD83 reprojection, point-in-polygon org lookup, the city-data mirror). Several integrations are **defined but never invoked** (dead/admin tooling).

### Integration inventory (live vs dead/admin)

| Service | Where | Status | Trigger |
|---|---|---|---|
| `vcpp.stldata.org/parcel_data/` (city data aggregator) | `:3623` | **LIVE** | `buildScore` on side-panel open |
| `getFallbackCityData` CF | `:3641` | **LIVE** (fallback) | vcpp error/timeout |
| Street View metadata via `getSign` + `maps.googleapis.com` | `:5094`,`:5101` | **LIVE** | every parcel/case selection |
| Google `StreetViewPanorama` | `:28`,`:5143` | **LIVE** | clicking "view" camera link |
| OpenCorporates owner link | `:3439` | **LIVE** (link) | side panel when `CompanyId` set |
| Neighborly.info org links via `getOrgs` | `:3234`,`:3239` | **LIVE** | side panel render |
| CSB `csb-request-submit` links via `convWGS84ToNAD83` | `:3310`,`:3314` | **LIVE** | side panel render |
| stlouis-mo.gov LRA "Buy Now" | `:3934` | **LIVE** (link) | LRA-owned parcel scored |
| stlouis-mo.gov static dept links | `:813-833` | **LIVE** (markup) | always |
| `getZillowInfo` (Zillow XML) | `:1837`,`:1985` | **LIVE** (cache-miss only) | inside `buildValuationProfilev2` |
| `ip-api.com` geolocation | `:6713` | **LIVE but broken** | `locateMe` fallback (mixed-content) |
| `stlcitypermits.com GetVacantBuildingDetail` | `:1540` | **DEAD** — no callers | n/a |
| `getZillowChartUrl` (zillow GetChart embed) | `:1705` | **COMMENTED OUT** | only caller (`:3353`) commented |
| `fetchZillowPrices` | `:1694` | **DEAD** — only `console.log`s | n/a |
| `buildValuationProfile` (v1) | `:1830` | **DEAD** — superseded by v2 | n/a |
| `autoFetchery`,`runScoreCompare`,`getNextProp` | `:2110`,`:3738`,`:3526` | **ADMIN/BATCH** (undefined/commented) | offline baseline generation |

### 9.1 St. Louis city parcel data (vcpp + CF fallback)

The live city-data path is **vcpp.stldata.org**, not stlcitypermits. `buildScore` (`:3573`) issues `$.ajax({ url: "https://vcpp.stldata.org/parcel_data/" + props.ParcelId, dataType:"json", timeout:5000, success: scoreAndTimeline, error: fallBackData })` (`:3622-3635`). A guard (`:3620`) short-circuits to fallback if `stlv.vcppServiceDown` is set. `fallBackData` (`:3639`) calls `getFallbackCityData?parcelid=` (`:3641`) and on success sets `vcppServiceDown=true` (`:3645`) so the rest of the session bypasses vcpp. The direct **stlcitypermits VacantBuilding API** `getBldgDivDetails` (`:1538`, `?AsrParcelId=`) has **zero call sites** — **(inferred)** superseded by vcpp's `VacantBuildingInfo`.

### 9.2 Google Street View (two mechanisms)

`getStreetViewLink(address, zip, coordinates, location)` (`:5090`) calls `getSign?address=` (`:5094`) which returns a *signed relative URL*; the client then fetches `"https://maps.googleapis.com" + signedUrl` (`:5101`) — the **Street View Static metadata endpoint** (JSON `status`/`location`/`date`). It bails on `ZERO_RESULTS`, computes a bearing toward the parcel (`getBearing`, `:5112`), and the imagery age from `data.date`, injecting a clickable "view" camera span. **(inferred)** `getSign` exists because the Static API requires URL signing with a server-side secret. The interactive panorama (`stlv.pano = new google.maps.StreetViewPanorama(...)`, `panoInit`, `:27-34`) is initialized via the Maps JS loader (`:91`) and driven by clicking the "view" span; a Mapbox "camera" marker tracks the pano heading.

### 9.3 Zillow valuations (legacy XML via CF proxy)

The only live Zillow path is inside `buildValuationProfilev2` (`:1936`): for each nearby parcel **not** already cached in `propertyValues`, `getZillowInfo?address=` (dataType `xml`, `:1985`) is called; the XML is parsed for `zestimate > amount`, validated against the searched street number, averaged, and written back to `propertyValues.doc(handle).set(...)` (`:2035`). **(inferred)** `getZillowInfo` proxies the now-retired legacy Zillow GetSearchResults XML API (holding the ZWSID, bridging CORS); best treated as historical. The other Zillow code is inactive (`getZillowChartUrl`, `fetchZillowPrices`).

### 9.4 OpenCorporates, Neighborly, CSB/NAD83, LRA "Buy Now"

- **OpenCorporates** (`:3438-3440`): when a parcel has `CompanyId`, the owner name links to `opencorporates.com/companies/us_<OwnerState-lowercased>/<CompanyId>`. `CompanyInactive` surfaces "(Active/Inactive business)". **(inferred)** `CompanyId`/`CompanyInactive` are precomputed offline (the MPO pipeline), not fetched live.
- **Neighborly.info** (`:3232-3239`): `getOrgs?lng=&lat=` finds neighborhood orgs containing the point; each renders `https://www.neighborly.info/stl/index.html#map-<id>`.
- **CSB report-it** (`:3294-3318`): a 13-entry `stlv.reportingCodes` table; `convWGS84ToNAD83?lng=&lat=` (`:3310`) converts to State Plane X/Y, then each applicable code emits `csb-request-submit.cfm?action=providepoint&<codes>&X=&Y=`, filtered lot-vs-building. Static CSB/Forestry/Building/Assessor/LRA dept links also appear in markup (`:813-833`).
- **LRA "Buy Now"** (`:3934`): for LRA-owned parcels, a link to `lra-owned-property-search.cfm?action=detail&parcelId=<ParcelId>`.

### 9.5 ip-api.com geolocation (broken fallback)

`stlv.locateMe` (`:6696`): on `navigator.geolocation` failure, the error handler calls `$.getJSON("http://ip-api.com/json/", …)` (`:6713`). The request is **`http://` from an HTTPS page** — mixed content modern browsers block, so the IP fallback effectively fails silently; only the native geolocation path works.

### 9.6 On-demand profile builders (radius aggregation)

`stlv.getItemsWithinRadius(coords, radius, collection, …)` (`:1734`) is the shared engine: builds a bounding box, snaps to a precomputed tile grid (`lng…lat…` keys), runs `collection.where("tile","==",tile).get()` per tile (`:1774`), and keeps points passing a true `getDistance` circle test. **It reads internal Firestore collections, not external APIs.** The three builders sit on top (see §8.3); only `buildValuationProfilev2` makes an external (Zillow) call, and only on cache miss. The live UI entry is the **Compare** button → `baselineCompare(lat,lng,addr,handle)` (`:6124-6127`).

---

## 10. UI/UX: search, filters, panels, views, deep-linking & secondary pages

All line numbers refer to `homepage.html` unless a file is named.

### 10.1 Layout & design system

**Page shell (body `:675-838`).** A 40px `#header` (title + `#headerNavLeft`: Stats / Map / List / FAQ Google Doc; `#headerNavRight`: "Return to Vacancy Collaborative" → `stlvacancy.com`, hamburger `#mainMenuBtn`, `loggedInAs`). Main canvas `#map` (`top:40px`); overlays: sliding `#sidePanel` (`.parcelDetails` + `.mpoContent`), `#panelTab`, `#list`/`#cases`, `#locateMe`, two `nav.filter-group` blocks, `#pano` drawer, `#mainMenu`, FirebaseUI `#firebase-outer`, `#timelineMove`, and a `#reportingTable` flyout of hard-coded City department contacts (`:794-837`).

**Design system (CSS `:99-672`).** Montserrat (`13.5px/20px`); Material-style `.btn` (`#3f51b5` indigo, `border-radius:4px`, box-shadows); teal header (`#2e747e`); blue links (`#0071c2`→`#109bff`); vacancy palette red→peach (buildings) / green (lots) in filter-group label gradients (`:515-526`); responsive breakpoints 410/440/540/850px; a print stylesheet exporting only `.print` elements; animated hamburger, `.beak` popover tails, CSS spinner, a custom "vacancy onset" range slider. An "About" dialog (`:858-861`) credits PublicGoodness, the STL Vacancy Collaborative, the City, and LSEM.

### 10.2 Address/owner/neighborhood search

**Mapbox Geocoder** (`:5844-5854`): `country:'us'`, `trackProximity:true`, St. Louis `bbox:[-90.33112,38.53117,-90.16769,38.77602]`, `types:"address,neighborhood"`, `placeholder:"Address, owner, or neighborhood"`, `marker:false`. **Owner-name augmentation** (`:5861-5881`): the `results` handler injects an "OWNERS" section by scanning `stlv.mpos` for inputs ≥3 chars; a `mousedown` on `li.mpoResult` routes into `renderOtherPropertiesOwned` (the MPO panel, not a map flyTo). **Address resolution** (`:5887-5976`): neighborhoods are normalized to the app's canonical spelling and highlighted; addresses query Firestore `parcels.where("Address",">",addr).limit(8)`, match within 0.0001° of `result.center`, with up to two retries for **hyphenated address numbers** (e.g. `4112-14`).

**typeahead.js is vestigial:** loaded (`:39`) with `.tt-*` CSS, but no `.typeahead(`/`Bloodhound` call exists — **(inferred)** superseded by the geocoder.

### 10.3 Handle-based navigation

**`jumpToHandle(handle)`** (`:6747-6760`): Firestore `parcels.where("Handle","==",handle)` → `selectParcel(props, true)`. Invoked from the URL hash, `.otherParcel` clicks, and the geocoder path. **`selectParcel(props, flyTo)`** (`:6556-6567`): optional `map.flyTo` (offset +0.001 lng), opens the panel, drops a `selectedParcel` marker, highlights the neighborhood, fetches the Street View link, renders the panel, and calls `renderOtherPropertiesOwned`.

### 10.4 URL / hash deep-linking & state persistence

| URL form | Handler | Effect |
|---|---|---|
| `#<ParcelId>` | `:6305-6309` | If parses to int in `(10001000000, 20000000000)`, `jumpToHandle`. **(inferred latent mismatch)** the guard validates a *Handle*-shaped number, but `selectParcel` writes *ParcelId* to the hash (`:3465`). |
| `?specialGroup=` / `?specialGroups=a\|b` | `:5290-5306` | `renderSpecialGroupSidePanel`, zoom 11.3 (examples `?specialGroup=TaxSale2015`). |
| `?mpo=<ownerName>` | `:6300-6304` | `renderOtherPropertiesOwned(mpo)` (target of Stats "Top Owners" links). |
| `?nbrhd=<name>` | `:5977-5983` | `highlightNeighborhood(nbrhd, false, true)`. |
| `?list` | `:6310-6312` | Click `#listViewLink`. |
| `?autoMode=true` | `:6298-6299` | `getNextProp()` (mostly-commented QA crawler). |
| `?signin` | `:1051` | Auto-open FirebaseUI login. |
| `?occupiedPropertyTimelines=show` | `:23-25`,`:4735` | Render side panel for zero-vacancy properties. |

**Cookie state (`:1461-1521`):** `saveState()` serializes the neighborhood highlight, every non-`.noSave` filter checkbox (keyed `<brand>-<id>`), `map.getZoom()`/`getCenter()`, and timeline state into a 90-day `state` cookie via helpers `getCookie`/`setCookie` (`:1359-1375`). `loadState()` restores it (and silently restores the *other* brand's checkboxes too). `saveState` triggers are gated on `e.originalEvent.isTrusted` so programmatic `flyTo` doesn't overwrite saved state — only genuine user pans/zooms do.

### 10.5 Parcel side panel (`renderParcelSidePanel`, `:3264-3503`)

Assembled from string fragments into `#sidePanel > .parcelDetails`: a title-cased address header + "in `<NhdName>`, `<n>`th Ward"; a **Parcel Information** block (Type label, Forestry Type, title-cased Owner with abbreviation fix-ups `Lra→LRA`/`Llc→LLC`/`Boe→Board of Education`, OpenCorporates link, business-active tag, owner mailing address, `ParcelId`, `Handle`, `Sq. Feet`, `Prop. NS Status`); the **Indicators Over Time** SVG sparkline (§7.9); a **Report It** CSB deep-link list (§9.4); **within-org boundaries** (Neighborly); **Street View**; the **score breakdown** (`buildScore`, §7); and **action buttons** — Staff/Evaluator/Ext-Firm/Neighborhood-Client get **Details** (`getPetitionText?handle=`) + **Compare** (`baselineCompare`); everyone else gets **Report It**.

### 10.6 Special groups & the MPO panel

**`renderSpecialGroupSidePanel`** (`:5205-5306`): curated sets from `misc/specialGroups` (`{title, data:[handles], owed?, vacancyMax?, lots?}`), rendered as `miniPropertyBit` rows + colored latitude-sorted markers; reached via `?specialGroup=`.

**MPO panel:** `renderOtherPropertiesOwned(owner, handle)` (`:5315-5344`) short-circuits government owners and shows a "1500+ properties… View All" teaser for Northside Regeneration. `fetchAllProperties` (`:5346-5380`) batches `parcels.where("OwnerName","in", ≤10 names)` (note the alias `concat` bug, §6.4). `finishRenderMpoPanel` (`:5382-5443`) sorts rows by vacancy score, groups by neighborhood, and lazily fetches Street View for the top ~15. `highlightOnMap` (`:5445-5527`) adds the yellow `parcels-highlighted` fill layer and `mpoMarker` pins (hidden when zoom>14). `miniPropertyBit` (`:4950-4972`) renders each compact row with a stacked score `hbar` (public: Vacancy+Burden; LSEM: Vacancy+Nuisance+Tax).

### 10.7 List view (`renderListView`/`sortList`/`csvFromTable`, `:6365-6553`)

Query attribute is a neighborhood, a ward number, or `"Condemned"`. **Data source (FACT):** queries **Firestore `parcels`** directly — `where("NhdName","==",nbrhd).where("Vacancy",">",0)`, `where("Ward20","==",ward).where("Vacancy",">",0)`, or `where("Condemned","==",true)` (`:6450-6453`) — *distinct* from the city-wide CSV download (a static link to `publicgoodness.org/stlv/csv/stl_vacancy_data.csv`). Columns from parallel arrays; `listColumnLsem` masks dollar/score columns from the public brand. Rows skip `OwnerName=="LRA"`. **CSV export** (`csvFromTable`, `:6514-6526`) serializes the rendered table to a `data:text/csv` URI with a UTF-8 BOM; the download filename is `<Neighborhood|Nth_Ward>_<YYYY_MM_DD>.csv`.

### 10.8 Filter system (`updateFilters`, `:6812-6979`)

Filters append Mapbox expressions to each layer's base filter (`stlv.layerFilters[id]`) and call `map.setFilter(layer, base.concat(addonArray))`:

| Brand | Control | Field | Expression |
|---|---|---|---|
| public | City/LRA vs Private | `IsLra` | `["==","IsLra",true]` / `["!=","IsLra",true]` (`:6818-6822`) |
| public | Vacancy Onset slider | `VacBegin` | `["<=","VacBegin",month]`, `month=49-sliderVal` (`:6831-6835`) |
| LSEM | Tax Delinquent (1/2/3/4+) | `TaxYrsDel` | `["any", ["==",…,1] … [">=",…,4]]` (`:6845-6853`) |
| LSEM | Single/Multi Family | `ResUnits` | `["==","ResUnits",1]` / `[">","ResUnits",1]` (`:6855-6859`) |
| LSEM | Commercial | `BldgsCom` | `[">","BldgsCom",0]` (`:6860-6870`) |
| LSEM | Business Active/Dissolved | `CompanyInactive` | `["==","CompanyInactive",true/false]` (`:6872-6884`) |
| LSEM | Owner Location | `OwnerZip` | ZIP-range `all` clauses: city 63101-63199, MO 63005-63100 & 63200-65899, out-of-state `<63005`/`>65899` (`:6901-6923`) |
| LSEM | Vacancy Onset slider | `VacBegin` | `["<=","VacBegin",month]` (`:6926-6931`) |

Additional checkbox-driven layers outside `updateFilters`: `#parcel_lines`, `#lra`, `#lsem_private_vacant_lots`, `#propNS`, `#condemned`. Public exposes only **Buildings** (`#pub_bldg`) + **Empty Lots** (`#pub_lot`) + the City/Private sub-filter; LSEM exposes the full `#allFilters` block. The base `public_bldg` layer hides `misc/masked` parcels.

### 10.9 Geolocation & flyTo, panel mechanics

`locateMe` (§9.5). `showHideFlyTos` (`:6057-6075`) shows a "fly here" icon when a parcel is off-screen and an inline "view" link when on-screen. `openPanel`/`closePanel`/`resize` (`:1238-1345`) animate `#sidePanel` and shrink `#map` by 250px, calling `map.resize()` on each animation step.

### 10.10 Secondary page: `stats.html`

A static aggregate dashboard ("Vacant Property Explorer - Stats"). Loads jQuery 3.3.1, **Firebase 7.14.0**, Google Charts, GA4. All numbers come from **precomputed Firestore docs**, not live aggregation: `misc/nbrhdParcelCounts` (denominators) and the **`vacancyStats2`** collection (docs `All`, `topOwnersList`, `Nhd_<name>`, `Ward_<n>`, `Cen_<tract>`, `Zip_<zip>`; over-time series in the `bydate` subcollection). Displays: topline totals (Vacant Parcels / Buildings / Lots); "Last 3 Years of Costs to the City" (unpaid taxes, Forestry fees, unpaid vacant-building fines); "Neighborhoods With the Highest Relative Percentage of…" (`count/nbrhdParcelCount*100`, skipping areas <35 parcels, each linking to `index.html?nbrhd=`); Google Charts scoring breakdowns; "Private Owners With 5+ Vacant Properties" (from `topOwnersList`, names linking to `index.html?mpo=` — the integration point with the SPA's MPO panel); and "Over Time" stacked-area charts (skipping known-bad months `2021-03`, `2024-02`). `stlv.conditions` (`:416-454`) is a map of stat-name → boolean expression evaluated per parcel; the core "vacant" threshold is **score ≥ 30**. A commented-out branch (`:772-808`) reads a legacy `vacancyStats` collection.

### 10.11 Secondary page: `caseUpload.html`

Covered in §8.5 (legacy LSEM bulk-upload tool writing to RTDB `/cases/`, gated behind FirebaseUI login, Firebase SDK 5.8.2).

---

## 11. Security & data-sensitivity notes

**Public-by-design client config (NOT leaks).** Three credentials appear in the client and are public *by design*: the Firebase web `apiKey` (`homepage.html:52`), the Google Maps JS key (`:91`), and the Mapbox `pk.` token (`:1429`). A Firebase web apiKey is an app identifier, not an authorization secret — it is restricted by Firebase **security rules**; the Maps key is restricted by HTTP-referrer; the Mapbox token is a scoped public token. These should be documented as architecture, not as exposed secrets. The genuinely sensitive secrets (Zillow ZWSID, the Street View URL-signing secret) are correctly held **server-side inside Cloud Functions** (`getZillowInfo`, `getSign`).

**Sensitive legal-aid PII gated behind auth/roles.** The `/apiCases` (and legacy `/cases`) RTDB trees carry live LSEM case data: client names (`partyName`, `Name`), dispositions, legal problem codes, attorney/paralegal `assignment`, dockets, courts, judges. This case layer is grafted on top of the otherwise-public vacancy map — the public never receives case markers or the "Cases" tab; only LSEM-authenticated sessions get the `lsemCases` checkbox, markers, and case table. **(inferred)** Real enforcement is server-side: the client role read from `/roles/{uid}` only toggles UI, so actual protection must come from Firebase RTDB/Firestore **security rules** plus the Cloud Functions' `idToken` verification (`getAddlMenu`, `getNbrhds`). The per-node `/apiCases/{id}` subscription pattern for external roles strongly implies rules scope those reads to assigned nodes. Sensitive-data partitioning is also visible in Firestore: `misc/masked` (parcels hidden from the public map) and `miscSecure/soldByLra` (a rules-gated, staff-only doc, referenced but commented out at `:955`).

**Probing constraint honored.** This entire analysis is a static read of client code. We did **not** query `/apiCases`, `/cases`, `/users`, `/roles`, any Firestore collection, or any Cloud Function — doing so would expose protected client information. Inferences about server behavior are explicitly labeled.

---

## 12. How to rebuild it

A clone would need four pillars:

**(1) Data pipeline (offline, Node).** Ingest City of St. Louis open-data sources — the parcel/assessor base, the **vcpp.stldata.org** parcel-data aggregator (vacant-building registry, permits, tax history, demolition, HCES/commercial inspections, Forestry maintenance, CSB 311 service requests, board-ups), and ownership/deed data. Run the scoring engine (§7) in `node` mode (`forceNode`/`backDate`) to compute Vacancy/Burden/Nuisance/Tax + monthly `VacTimeline` snapshots, and persist them. Export:
- the flat **public CSV** (`stl_vacancy_data.csv`, 36 columns) to a static origin;
- the **Mapbox vector tilesets** in three precomputed views — `PrclFull` (all attributes, polygons), `PrclAll` (geometry for every parcel), `PrclLean`/centroids (low-zoom dots) — uploaded to a Mapbox account, plus a custom Studio base style;
- the **`mpo.js`** artifact via `multi_property_processor/index.js` (tally `OwnerName` → keep multi-owners → fuzzy-group aliases → emit `stlv.mpos` + `stlv.mpoGroups`);
- precomputed Firestore aggregates: `misc/compareData` (percentile histograms), `vacancyStats2` (+`bydate`), `misc/nbrhdParcelCounts`, `misc/specialGroups`, `misc/povertyZone`.

**(2) Firebase project.** Email/password Auth (FirebaseUI); RTDB with `/users`, `/roles`, `/apiCases`; Firestore with `parcels` (doc id ParcelId), `propertyValues`/`reEntry`/`profilingBaseline` (doc id Handle), `propertyTax4`, `misc`/`miscSecure`. Write **security rules** that (a) make the public parcel/stats data world-readable except `misc/masked` targets, (b) restrict `/apiCases` reads to Staff/Evaluator (whole tree) vs Ext-Firm/Neighborhood-Client (assigned nodes only), and (c) lock `/roles` to admin-only writes. Plus an out-of-band admin tool to assign roles and a server-side sync that populates `/apiCases` from the LSEM case-management system.

**(3) Cloud Functions** (us-central1): the ten endpoints in §8.1 — auth-gated menu generators (`getAddlMenu`, `getNbrhds`) and `getAssignedCases`; coordinate/geo utilities (`convWGS84ToNAD83`, `getOrgs`, `getNeighborhoods`); secret-holding proxies (`getZillowInfo`, `getSign`, `getFallbackCityData`); and `getPetitionText`.

**(4) The client.** A single static `index.html` bootstrapping `window.stlv`, initializing Mapbox GL JS + the geocoder, Firebase Auth/RTDB/Firestore, the brand toggle, the layer drawing functions (`drawPublicLayers`/`drawLsemLayers`), `updateFilters`, the side-panel/list/cases views, and the in-browser `scoreAndTimeline` engine for live score display. Cookie-based state + URL deep-linking; GA4 page-views.

---

## 13. Open questions & unverified inferences

- **Hosting/CDN stack** (Cloudflare → GCS) is asserted from response headers, not observable in source; the code only proves "static SPA."
- **Role assignment mechanism:** `/roles/{uid}` is read but never written client-side; how roles are set (admin tool/Cloud Function/console) is out of scope. The precise RTDB/Firestore security-rule logic is inferred from client access patterns, not observed.
- **Server-side function bodies:** the exact behavior of all ten Cloud Functions is inferred from request params and response parsing. `getAddlMenu`/`getNbrhds` return server-rendered HTML whose privileged contents we did not (and could not) retrieve.
- **CSV `Vacancy2` ↔ runtime `Vacancy`/`VacDesc` lineage:** scales align (~0-100) but names and category vocabularies diverge (CSV "At risk/Possible" vs live "Definite/Very Likely/Indeterminant"); the exact transform isn't determinable from static files (likely documented in the linked FAQ Google Doc, `:861`). The semantics of the small "Not Vacant" `Vacancy`/`VacancyCat` measure, `BldgAge` units, and the `Type` vs `Type2` distinction are also inferred.
- **Tileset attribute schema** (`PrclFull`/`PrclAll`/`PrclLean`) can only be inferred from `["get",…]`/filter usage; field names like `VacDesc` (vs CSV `VacancyCat`) appear renamed in tile-baking. The composition of the dead `Score`/`Score_Tax` tileset fields cannot be confirmed.
- **Score-persistence pipeline:** the Node writer that calls `scoreAndTimeline(forceNode/backDate)` and persists to Firestore is referenced (`FieldValue.delete()`, commented `getNextProp`/`resetCapture`) but absent; write targets and cadence are inferred. **`autoFetchery`** (the valuation crawler) is called (`:2110`) but undefined in this file.
- **Suspected latent bugs** (do not affect primary displayed scores): the unused board-up nuisance recompute (`:4384-4391`); transposed `scoreImpact` labels in the major-violation branch (`:4461`/`:4472`); `parcel.ParcelId` vs in-scope `props` in `runScoreCompare` (`:3754`); `PermitAmt` initialized but never incremented; `type2Crimes` incremented from the `type1Crimes` accumulator in `buildCrimeProfile` (`:2177`); the `concat`-discard alias bug in `fetchAllProperties` (`:5350`); the `legalCode` string-vs-number mismatch between `drawCaseMarkers` (`:1131`) and `caseUpload.html` (`:423`); and the hash deep-link `#<ParcelId>` validated against a Handle-shaped range (`:6306-6309` vs `:3465`).
- **`/cases` vs `/apiCases`:** `caseUpload.html` writes `/cases`; the live app reads `/apiCases`. Whether `/cases` is fully retired or still feeds a server-side sync is inferred from SDK age + schema mismatch; the migration path is not visible.
- **Dead/legacy code confirmed but unexercised:** `stlcitypermits` VacantBuilding API (no callers), the `http://ip-api.com` fallback (mixed-content blocked), typeahead.js (loaded, no calls — though the 7,099-line script was not read in full), the commented `vacancyStats` legacy branch in stats.html, and `getNeighborhoods`/`activateNbrhdClient` (the unfinished neighborhood-client interface; `getAssignedCases` returns an unused `neighborhoods` field).
- **External integration liveness:** whether `getZillowInfo` still returns live data (the legacy Zillow XML API was retired) and whether `getFallbackCityData` mirrors vcpp vs scrapes the city directly cannot be determined without probing the backend (out of scope).
- **Secondary-page SDK drift:** stats.html pins Firebase 7.14.0 and caseUpload.html 5.8.2 vs the SPA's 8.3.0; **(inferred)** not migrated in lockstep, no functional impact visible in static code.
