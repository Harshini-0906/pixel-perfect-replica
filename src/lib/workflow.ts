// Demonstration workflow engine. Stages/rules are configurable demo values,
// NOT verified AICTE APH requirements.
export type Role = "admin" | "regional" | "scrutiny" | "committee" | "liaison";

export const ROLES: { id: Role; label: string; user: string }[] = [
  { id: "liaison", label: "Institution Liaison", user: "Priya Nair (Greenfield IT)" },
  { id: "scrutiny", label: "Scrutiny Officer", user: "Arjun Mehta" },
  { id: "regional", label: "Regional Officer", user: "Dr. Kavita Rao (South)" },
  { id: "committee", label: "Committee Member", user: "Prof. S. Iyer" },
  { id: "admin", label: "System Administrator", user: "R. Sharma (Approving Authority)" },
];

export type Stage =
  | "draft" | "submitted" | "initial_scrutiny" | "deficiency_notice" | "re_scrutiny"
  | "evc_scheduling" | "evc_inspection" | "committee_review" | "recommendation"
  | "approved" | "rejected" | "returned";

export const STAGES: { id: Stage; label: string; owner: Role | null; slaDays: number }[] = [
  { id: "draft", label: "Draft", owner: "liaison", slaDays: 30 },
  { id: "submitted", label: "Submitted", owner: "scrutiny", slaDays: 3 },
  { id: "initial_scrutiny", label: "Initial Scrutiny", owner: "scrutiny", slaDays: 7 },
  { id: "deficiency_notice", label: "Deficiency Notice", owner: "liaison", slaDays: 10 },
  { id: "re_scrutiny", label: "Re-Scrutiny", owner: "scrutiny", slaDays: 5 },
  { id: "evc_scheduling", label: "EVC Scheduling", owner: "regional", slaDays: 5 },
  { id: "evc_inspection", label: "EVC Inspection", owner: "regional", slaDays: 10 },
  { id: "committee_review", label: "Committee Review", owner: "committee", slaDays: 7 },
  { id: "recommendation", label: "Awaiting Decision", owner: "admin", slaDays: 5 },
  { id: "approved", label: "Approved", owner: null, slaDays: 0 },
  { id: "rejected", label: "Rejected", owner: null, slaDays: 0 },
  { id: "returned", label: "Returned", owner: null, slaDays: 0 },
];

export const stageInfo = (s: Stage) => STAGES.find((x) => x.id === s)!;
export const FINAL: Stage[] = ["approved", "rejected", "returned"];

export const CATEGORIES = [
  { id: "new", label: "Establishment of New Institution", evc: true },
  { id: "eoa", label: "Extension of Approval (EoA)", evc: false },
  { id: "course", label: "Introduction of New Courses", evc: true },
  { id: "intake", label: "Increase / Reduction in Intake", evc: false },
  { id: "closure", label: "Closure of Institution / Courses", evc: false },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const categoryLabel = (c: CategoryId) => CATEGORIES.find((x) => x.id === c)!.label;

export const DOC_TYPES = [
  { id: "land", label: "Land Ownership / Lease Deed", mandatory: true },
  { id: "building", label: "Building Completion Certificate", mandatory: true },
  { id: "fire", label: "Fire Safety NOC", mandatory: true },
  { id: "finance", label: "Audited Financial Statement", mandatory: true },
  { id: "affiliation", label: "University Affiliation Consent", mandatory: true },
  { id: "undertaking", label: "Affidavit / Undertaking", mandatory: false },
] as const;
export type DocTypeId = (typeof DOC_TYPES)[number]["id"];

/** Allowed transitions: from -> to with the role permitted to perform it. */
export const TRANSITIONS: { from: Stage; to: Stage; role: Role; action: string }[] = [
  { from: "draft", to: "submitted", role: "liaison", action: "Submit application" },
  { from: "returned", to: "submitted", role: "liaison", action: "Resubmit application" },
  { from: "submitted", to: "initial_scrutiny", role: "scrutiny", action: "Start scrutiny" },
  { from: "initial_scrutiny", to: "deficiency_notice", role: "scrutiny", action: "Issue deficiency notice" },
  { from: "re_scrutiny", to: "deficiency_notice", role: "scrutiny", action: "Issue deficiency notice" },
  { from: "deficiency_notice", to: "re_scrutiny", role: "liaison", action: "Submit deficiency response" },
  { from: "initial_scrutiny", to: "evc_scheduling", role: "scrutiny", action: "Complete scrutiny" },
  { from: "re_scrutiny", to: "evc_scheduling", role: "scrutiny", action: "Complete scrutiny" },
  { from: "initial_scrutiny", to: "committee_review", role: "scrutiny", action: "Complete scrutiny" },
  { from: "re_scrutiny", to: "committee_review", role: "scrutiny", action: "Complete scrutiny" },
  { from: "evc_scheduling", to: "evc_inspection", role: "regional", action: "Schedule EVC" },
  { from: "evc_inspection", to: "committee_review", role: "regional", action: "Record EVC report" },
  { from: "committee_review", to: "recommendation", role: "committee", action: "Record recommendation" },
  { from: "recommendation", to: "approved", role: "admin", action: "Approve" },
  { from: "recommendation", to: "rejected", role: "admin", action: "Reject" },
  { from: "recommendation", to: "returned", role: "admin", action: "Return to institution" },
];

export interface Doc {
  type: DocTypeId;
  fileName?: string;
  size?: number;
  validUntil?: string; // ISO date
  status: "missing" | "uploaded" | "verified" | "flagged";
  ai?: { confidence: number; notes: string[] };
}
export interface Deficiency {
  id: string;
  docType?: DocTypeId;
  description: string;
  dueDate: string;
  status: "open" | "responded" | "resolved";
  response?: string;
  raisedAt: string;
}
export interface HistoryItem { at: string; by: string; role: Role; from?: Stage; to?: Stage; note: string }
export interface Application {
  id: string;
  institutionId: string;
  category: CategoryId;
  year: string;
  courses: string;
  intake: number;
  stage: Stage;
  stageEnteredAt: string;
  createdAt: string;
  region: string;
  docs: Doc[];
  deficiencies: Deficiency[];
  evc?: { date?: string; team?: string; report?: string; outcome?: "satisfactory" | "unsatisfactory" };
  committee?: { recommendation: "approve" | "reject" | "return"; remarks: string; by: string };
  remarks: { at: string; by: string; text: string }[];
  decision?: { outcome: "approved" | "rejected" | "returned"; by: string; at: string; note: string };
  escalated?: boolean;
  history: HistoryItem[];
}

export function evcRequired(app: Pick<Application, "category">) {
  return CATEGORIES.find((c) => c.id === app.category)!.evc;
}

export function dueDate(app: Application) {
  const sla = stageInfo(app.stage).slaDays;
  return new Date(new Date(app.stageEnteredAt).getTime() + sla * 864e5);
}
export function daysLeft(app: Application, now = Date.now()) {
  return Math.ceil((dueDate(app).getTime() - now) / 864e5);
}

/** Validate a transition. Returns an error string, or null if allowed. */
export function validateTransition(app: Application, to: Stage, role: Role): string | null {
  const t = TRANSITIONS.find((x) => x.from === app.stage && x.to === to);
  if (!t) return `Invalid transition: ${stageInfo(app.stage).label} → ${stageInfo(to).label}`;
  if (t.role !== role) return `Only a ${ROLES.find((r) => r.id === t.role)!.label} can perform this step`;
  if (to === "submitted") {
    const missing = DOC_TYPES.filter((d) => d.mandatory && app.docs.find((x) => x.type === d.id)?.status === "missing");
    if (missing.length) return `Missing mandatory documents: ${missing.map((m) => m.label).join(", ")}`;
  }
  if (to === "deficiency_notice" && !app.deficiencies.some((d) => d.status === "open"))
    return "Raise at least one deficiency before issuing a notice";
  if (to === "re_scrutiny" && app.deficiencies.some((d) => d.status === "open"))
    return "Respond to every open deficiency first";
  if (to === "evc_scheduling" || to === "committee_review") {
    if (app.stage !== "evc_inspection") {
      if (app.deficiencies.some((d) => d.status !== "resolved")) return "All deficiencies must be resolved";
      if (app.docs.some((d) => d.status === "flagged")) return "Flagged documents must be verified or raised as deficiencies";
      if (to === "evc_scheduling" && !evcRequired(app)) return "EVC not required for this category";
      if (to === "committee_review" && evcRequired(app)) return "EVC is required for this category";
    } else if (!app.evc?.report) return "EVC report must be recorded";
  }
  if (to === "evc_inspection" && !(app.evc?.date && app.evc?.team)) return "Inspection date and team are required";
  if (to === "recommendation" && !app.committee) return "Committee recommendation required";
  return null;
}

/** Simulated AI document check (rule-based, labelled as simulated). */
export function aiVerify(doc: Doc, now = Date.now()): Doc {
  if (!doc.fileName) return { ...doc, status: "missing", ai: undefined };
  const notes: string[] = [];
  let confidence = 0.94;
  if (!doc.validUntil && doc.type !== "land" && doc.type !== "undertaking") {
    notes.push("Validity date not detected"); confidence = 0.62;
  } else if (doc.validUntil && new Date(doc.validUntil).getTime() < now) {
    notes.push(`Certificate expired on ${doc.validUntil}`); confidence = 0.97;
  } else if (doc.validUntil && new Date(doc.validUntil).getTime() < now + 60 * 864e5) {
    notes.push("Expires within 60 days");
  }
  if (!/\.(pdf|jpe?g|png)$/i.test(doc.fileName)) notes.push("Unsupported format");
  const flagged = notes.some((n) => /expired|Unsupported|not detected/.test(n));
  return { ...doc, status: flagged ? "flagged" : "uploaded", ai: { confidence, notes: notes.length ? notes : ["Fields extracted, no anomalies"] } };
}
