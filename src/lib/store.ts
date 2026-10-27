import { useSyncExternalStore } from "react";
import {
  CATEGORIES, DOC_TYPES, ROLES, STAGES, TRANSITIONS, aiVerify, stageInfo, validateTransition,
  type Application, type CategoryId, type Doc, type Role, type Stage,
} from "./workflow";

export interface Institution { id: string; name: string; type: string; state: string; district: string; region: string; email: string; phone: string; university: string; management: string }
export interface Notification { id: string; to: Role; text: string; appId?: string; at: string; read: boolean; kind: "info" | "warning" | "success" }
export interface State { role: Role; year: string; institutions: Institution[]; apps: Application[]; notifications: Notification[]; settingsLog: { at: string; by: string; note: string }[] }

const KEY = "approvalflow-demo-v1";

// ---------- deterministic seed ----------
function rng(seed: number) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }
const iso = (t: number) => new Date(t).toISOString();
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

const REGIONS = [
  { r: "South", states: [["Tamil Nadu", "Chennai"], ["Karnataka", "Bengaluru"], ["Kerala", "Kochi"]] },
  { r: "West", states: [["Maharashtra", "Pune"], ["Gujarat", "Ahmedabad"]] },
  { r: "North", states: [["Punjab", "Mohali"], ["Haryana", "Gurugram"], ["Delhi", "New Delhi"]] },
  { r: "East", states: [["West Bengal", "Kolkata"], ["Odisha", "Bhubaneswar"]] },
  { r: "Central", states: [["Madhya Pradesh", "Bhopal"], ["Chhattisgarh", "Raipur"]] },
];
const NAMES = ["Greenfield Institute of Technology", "Sapphire College of Engineering", "Vidyadhara Polytechnic", "Riverside School of Management", "Northstar Institute of Pharmacy", "Lotus Valley Engineering College", "Meridian Technical Academy", "Coastal Institute of Architecture", "Aravali College of Technology", "Deccan Institute of Applied Sciences", "Silverline Polytechnic", "Brahmaputra Engineering College", "Konark Institute of Technology", "Narmada School of Computing", "Indus Valley Institute of Design", "Satpura College of Engineering", "Horizon Business School", "Kaveri Institute of Hotel Management", "Summit Institute of Technology", "Evergreen Pharmacy College", "Bluewave Maritime Institute", "Kalinga Institute of Polytechnic"];
const COURSES = ["B.Tech CSE, ECE", "B.Tech Mechanical", "MBA", "B.Pharm", "Diploma Civil", "M.Tech AI & DS", "B.Arch", "MCA", "BHMCT", "B.Tech EEE, IT"];

function makeDocs(r: () => number, now: number, opts: { expiredBuilding?: boolean; incomplete?: boolean } = {}): Doc[] {
  return DOC_TYPES.map((d, i) => {
    if (opts.incomplete && i > 3) return { type: d.id, status: "missing" } as Doc;
    const offset = opts.expiredBuilding && d.id === "building" ? -40 : d.id === "fire" && r() < 0.25 ? 20 + Math.floor(r() * 30) : 200 + Math.floor(r() * 700);
    return aiVerify({ type: d.id, fileName: `${d.id}_certificate.pdf`, size: 300_000 + Math.floor(r() * 2e6), validUntil: d.id === "land" || d.id === "undertaking" ? undefined : day(now + offset * 864e5), status: "uploaded" }, now);
  });
}

export function seed(now = Date.now()): State {
  const r = rng(42);
  const institutions: Institution[] = NAMES.map((name, i) => {
    const reg = REGIONS[i % REGIONS.length];
    const [state, district] = reg.states[i % reg.states.length];
    return { id: `INS-${1001 + i}`, name, type: i % 3 === 0 ? "Engineering" : i % 3 === 1 ? "Management" : "Polytechnic", state, district, region: reg.r, email: `admin@${name.split(" ")[0].toLowerCase()}.edu.in`, phone: `+91 98${String(40000000 + i * 7919).slice(0, 8)}`, university: `${state} Technical University`, management: i % 2 ? "Private Self-financing" : "Trust / Society" };
  });
  institutions[0] = { ...institutions[0], region: "South", state: "Tamil Nadu", district: "Coimbatore" };

  const apps: Application[] = [];
  const flowStages: Stage[] = ["submitted", "initial_scrutiny", "deficiency_notice", "re_scrutiny", "evc_scheduling", "evc_inspection", "committee_review", "recommendation", "approved", "approved", "rejected", "returned", "draft"];
  for (let i = 0; i < 54; i++) {
    const inst = institutions[1 + (i % (institutions.length - 1))];
    const cat = CATEGORIES[i % CATEGORIES.length].id as CategoryId;
    let stage = flowStages[Math.floor(r() * flowStages.length)];
    if (!CATEGORIES.find((c) => c.id === cat)!.evc && stage.startsWith("evc")) stage = "committee_review";
    const created = now - (20 + Math.floor(r() * 120)) * 864e5;
    const entered = now - Math.floor(r() * 14) * 864e5;
    const id = `AF-2026-${String(10100 + i)}`;
    const app: Application = {
      id, institutionId: inst.id, category: cat, year: "2026-27", courses: COURSES[i % COURSES.length], intake: 60 + Math.floor(r() * 6) * 30,
      stage, stageEnteredAt: iso(entered), createdAt: iso(created), region: inst.region,
      docs: makeDocs(r, now, { incomplete: stage === "draft" }), deficiencies: [], remarks: [],
      history: [{ at: iso(created), by: "Liaison", role: "liaison", to: "draft", note: "Application created" }],
    };
    if (stage !== "draft") app.history.push({ at: iso(created + 2 * 864e5), by: "Liaison", role: "liaison", from: "draft", to: "submitted", note: "Submitted" });
    if (["deficiency_notice", "re_scrutiny", "evc_scheduling", "evc_inspection", "committee_review", "recommendation", "approved", "rejected"].includes(stage) && r() < 0.6) {
      const st = stage === "deficiency_notice" ? "open" : stage === "re_scrutiny" ? "responded" : "resolved";
      app.deficiencies.push({ id: `DF-${i}`, docType: "fire", description: "Fire Safety NOC copy is illegible; upload a clear scan.", dueDate: day(entered + 10 * 864e5), status: st, raisedAt: iso(entered - 864e5), response: st !== "open" ? "Clear scan uploaded." : undefined });
    }
    // flagged docs only allowed in scrutiny stages
    if (!["submitted", "initial_scrutiny", "draft"].includes(stage)) app.docs = app.docs.map((d) => (d.status === "flagged" ? { ...d, status: "verified" } : d.status === "uploaded" ? { ...d, status: "verified" } : d));
    if (["evc_inspection", "committee_review", "recommendation", "approved", "rejected"].includes(stage) && cat !== "eoa" && cat !== "intake" && cat !== "closure")
      app.evc = { date: day(entered + 3 * 864e5), team: "Dr. A. Kumar, Er. L. Das", report: stage === "evc_inspection" ? undefined : "Infrastructure verified against submission.", outcome: stage === "evc_inspection" ? undefined : "satisfactory" };
    if (["recommendation", "approved", "rejected"].includes(stage)) app.committee = { recommendation: stage === "rejected" ? "reject" : "approve", remarks: "Reviewed scrutiny and EVC findings.", by: "Prof. S. Iyer" };
    if (["approved", "rejected", "returned"].includes(stage)) app.decision = { outcome: stage as "approved", by: "R. Sharma", at: iso(entered), note: "Decision recorded by approving authority." };
    if (stage !== "draft" && stage !== "submitted") app.history.push({ at: iso(entered), by: "System", role: "admin", to: stage, note: `Moved to ${stageInfo(stage).label}` });
    apps.push(app);
  }
  // Overdue task for escalation demo
  const od = apps.find((a) => a.stage === "initial_scrutiny") ?? apps[0];
  od.stage = "initial_scrutiny"; od.stageEnteredAt = iso(now - 12 * 864e5); od.region = "South";

  // Greenfield demo application — draft ready to submit, building certificate expired
  apps.unshift({
    id: "AF-2026-10001", institutionId: institutions[0].id, category: "new", year: "2026-27", courses: "B.Tech CSE, ECE, Mechanical", intake: 180,
    stage: "draft", stageEnteredAt: iso(now - 864e5), createdAt: iso(now - 864e5), region: "South",
    docs: makeDocs(rng(7), now, { expiredBuilding: true }).map((d) => (d.status === "flagged" && d.type !== "building" ? { ...d, status: "uploaded" } : d)),
    deficiencies: [], remarks: [], history: [{ at: iso(now - 864e5), by: "Priya Nair", role: "liaison", to: "draft", note: "Draft created (demo scenario)" }],
  });

  const notifications: Notification[] = [
    { id: "n1", to: "liaison", text: "Welcome! Your Greenfield draft AF-2026-10001 is ready to submit.", appId: "AF-2026-10001", at: iso(now - 864e5), read: false, kind: "info" },
    { id: "n2", to: "regional", text: `Task for ${od.id} is approaching SLA breach.`, appId: od.id, at: iso(now - 2 * 36e5), read: false, kind: "warning" },
    { id: "n3", to: "scrutiny", text: "5 new applications assigned for scrutiny.", at: iso(now - 5 * 36e5), read: false, kind: "info" },
    { id: "n4", to: "committee", text: "Committee meeting agenda updated for this week.", at: iso(now - 26 * 36e5), read: false, kind: "info" },
    { id: "n5", to: "admin", text: "Rule set v1.2 (demo) activated.", at: iso(now - 50 * 36e5), read: true, kind: "success" },
  ];
  return { role: "liaison", year: "2026-27", institutions, apps, notifications, settingsLog: [] };
}

// ---------- store ----------
let state: State | null = null;
const listeners = new Set<() => void>();
function load(): State {
  if (state) return state;
  try { const raw = localStorage.getItem(KEY); if (raw) return (state = JSON.parse(raw)); } catch { /* ignore */ }
  return (state = seed());
}
function set(next: State) { state = next; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ } listeners.forEach((l) => l()); }
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

export function useStore(): State | null {
  return useSyncExternalStore(subscribe, () => load(), () => null);
}
export const getState = () => load();

const userOf = (role: Role) => ROLES.find((r) => r.id === role)!.user;
const nid = () => Math.random().toString(36).slice(2, 9);

export function notify(s: State, to: Role, text: string, appId?: string, kind: Notification["kind"] = "info"): Notification[] {
  return [{ id: nid(), to, text, appId, at: new Date().toISOString(), read: false, kind }, ...s.notifications];
}

export const actions = {
  setRole(role: Role) { set({ ...load(), role }); },
  setYear(year: string) { set({ ...load(), year }); },
  reset() { state = null; localStorage.removeItem(KEY); set(seed()); },
  markRead(id?: string) { const s = load(); set({ ...s, notifications: s.notifications.map((n) => (!id || n.id === id) && n.to === s.role ? { ...n, read: true } : n) }); },
  logSetting(note: string) { const s = load(); set({ ...s, settingsLog: [{ at: new Date().toISOString(), by: userOf(s.role), note }, ...s.settingsLog] }); },

  /** Update app data (not stage) with an audit entry. */
  update(id: string, fn: (a: Application) => Application, note: string, notifyTo?: { role: Role; text: string; kind?: Notification["kind"] }) {
    const s = load();
    let notifications = s.notifications;
    const apps = s.apps.map((a) => {
      if (a.id !== id) return a;
      const n = fn(a);
      return { ...n, history: [...n.history, { at: new Date().toISOString(), by: userOf(s.role), role: s.role, note }] };
    });
    if (notifyTo) notifications = notify({ ...s, notifications }, notifyTo.role, notifyTo.text, id, notifyTo.kind);
    set({ ...s, apps, notifications });
  },

  /** Validated stage transition. Throws on invalid. */
  transition(id: string, to: Stage, note = "") {
    const s = load();
    const app = s.apps.find((a) => a.id === id)!;
    const err = validateTransition(app, to, s.role);
    if (err) throw new Error(err);
    const t = TRANSITIONS.find((x) => x.from === app.stage && x.to === to)!;
    const now = new Date().toISOString();
    const next: Application = { ...app, stage: to, stageEnteredAt: now, escalated: false, history: [...app.history, { at: now, by: userOf(s.role), role: s.role, from: app.stage, to, note: note || t.action }] };
    let ns = s.notifications;
    const owner = STAGES.find((x) => x.id === to)!.owner;
    if (owner && owner !== s.role) ns = notify({ ...s, notifications: ns }, owner, `${id} moved to ${stageInfo(to).label} — action required.`, id);
    if (to === "deficiency_notice") ns = notify({ ...s, notifications: ns }, "liaison", `Deficiency notice issued for ${id}. Please respond before the deadline.`, id, "warning");
    if (["approved", "rejected", "returned"].includes(to)) {
      next.decision = { outcome: to as "approved", by: userOf(s.role), at: now, note };
      next.history.push({ at: now, by: "System", role: "admin", note: "Decision communicated to institution (simulated email/SMS)" });
      ns = notify({ ...s, notifications: ns }, "liaison", `Final decision for ${id}: ${stageInfo(to).label.toUpperCase()}.`, id, to === "approved" ? "success" : "warning");
    }
    set({ ...s, apps: s.apps.map((a) => (a.id === id ? next : a)), notifications: ns });
  },

  createApp(app: Application) { const s = load(); set({ ...s, apps: [app, ...s.apps] }); },
  escalate(id: string) {
    actions.update(id, (a) => ({ ...a, escalated: true }), "Escalated to Regional Officer (SLA breached)", { role: "regional", text: `ESCALATION: ${id} has breached its stage deadline.`, kind: "warning" });
  },
};
