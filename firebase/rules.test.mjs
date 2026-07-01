// Firestore security-rules tests — the SERVER half of the case-tier invariant
// (docs/FIREBASE-SECURITY.md). Proves the rules themselves reject reads that shouldn't
// be issuable, independent of any client. Runs against the Firestore emulator via
// `@firebase/rules-unit-testing`; the emulator needs Java, so this is CI-gated
// (.github/workflows/ci.yml → `rules` job). Locally: `npm run test:rules` (needs the
// Firebase emulator + `npm i --no-save firebase-tools @firebase/rules-unit-testing firebase`).
//
// Not picked up by `npm test` (vitest only globs src/**/*.test.ts + scripts/**/*.test.mjs).
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";

const PROJECT = "demo-stlv";
const CASES = "apiCases";
let env;

before(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
  });
  // Seed two cases assigned to different emails, bypassing rules.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${CASES}/c1`), {
      caseId: "c1", assigneeEmails: ["firm@example.org"], neighborhood: "The Ville",
    });
    await setDoc(doc(db, `${CASES}/c2`), {
      caseId: "c2", assigneeEmails: ["other@example.org"], neighborhood: "Penrose",
    });
  });
});

after(async () => { await env?.cleanup(); });

// authenticatedContext(uid, tokenOptions) — tokenOptions land on the auth token as
// custom claims (role) + standard fields (email, email_verified).
const dbFor = (uid, claims) => env.authenticatedContext(uid, claims).firestore();
const staff = () => dbFor("s1", { role: "Staff", email: "staff@example.org", email_verified: true });
const evaluator = () => dbFor("e1", { role: "Evaluator", email: "eval@example.org", email_verified: true });
const firm = () => dbFor("f1", { role: "Ext Firm", email: "firm@example.org", email_verified: true });
const firmUnverified = () => dbFor("f2", { role: "Ext Firm", email: "firm@example.org", email_verified: false });
const guest = () => dbFor("g1", { role: "Guest", email: "guest@example.org", email_verified: true });
const anon = () => env.unauthenticatedContext().firestore();

test("Staff can list the whole apiCases collection", async () => {
  const snap = await assertSucceeds(getDocs(collection(staff(), CASES)));
  assert.equal(snap.size, 2);
});

test("Evaluator can list the whole collection too", async () => {
  await assertSucceeds(getDocs(collection(evaluator(), CASES)));
});

test("Ext Firm is DENIED an unconstrained list of the collection", async () => {
  await assertFails(getDocs(collection(firm(), CASES)));
});

test("Ext Firm may run the array-contains(own email) query and sees only its cases", async () => {
  const snap = await assertSucceeds(
    getDocs(query(collection(firm(), CASES), where("assigneeEmails", "array-contains", "firm@example.org")))
  );
  assert.equal(snap.size, 1);
  assert.equal(snap.docs[0].id, "c1");
});

test("Ext Firm is DENIED a query filtered on someone else's email", async () => {
  await assertFails(
    getDocs(query(collection(firm(), CASES), where("assigneeEmails", "array-contains", "other@example.org")))
  );
});

test("Ext Firm can get its own case doc but not another's", async () => {
  await assertSucceeds(getDoc(doc(firm(), `${CASES}/c1`)));
  await assertFails(getDoc(doc(firm(), `${CASES}/c2`)));
});

test("an UNVERIFIED Ext Firm is denied even the constrained query", async () => {
  await assertFails(
    getDocs(query(collection(firmUnverified(), CASES), where("assigneeEmails", "array-contains", "firm@example.org")))
  );
});

test("Guest is denied any case read", async () => {
  await assertFails(getDocs(collection(guest(), CASES)));
  await assertFails(getDoc(doc(guest(), `${CASES}/c1`)));
});

test("an unauthenticated client is denied", async () => {
  await assertFails(getDocs(collection(anon(), CASES)));
  await assertFails(getDoc(doc(anon(), `${CASES}/c1`)));
});

test("no client (even Staff) may write a case", async () => {
  await assertFails(setDoc(doc(staff(), `${CASES}/c3`), { caseId: "c3", assigneeEmails: [] }));
});

test("users may touch only their own profile doc", async () => {
  const a = dbFor("uidA", { email: "a@example.org", email_verified: true });
  await assertSucceeds(setDoc(doc(a, "users/uidA"), { fullName: "A" }));
  await assertSucceeds(getDoc(doc(a, "users/uidA")));
  await assertFails(getDoc(doc(a, "users/uidB")));
  await assertFails(setDoc(doc(a, "users/uidB"), { fullName: "hijack" }));
});
