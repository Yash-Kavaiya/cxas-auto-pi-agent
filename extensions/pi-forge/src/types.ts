export type Phase =
  | "intake" | "clarify" | "build" | "test" | "evaluate" | "improve" | "deliver" | "done";

export const PHASES: Phase[] = [
  "intake", "clarify", "build", "test", "evaluate", "improve", "deliver", "done",
];

export type GateId = "G1" | "G2" | "G3";
export const GATE_IDS: GateId[] = ["G1", "G2", "G3"];

export type GateStatus = "not_reached" | "pending" | "approved" | "rejected";
export type Verdict = "approve" | "iterate";
export type PhaseStatus = "not_started" | "in_progress" | "blocked_on_gate" | "done";
export type GateKind = "confirm" | "select";
export type ProjectType = "general" | "cxas";

export interface GateRecord {
  status: GateStatus;
  verdict?: Verdict;
  decidedBy?: string;
  channel?: string;
  at?: string;
  note?: string;
}

export interface TransitionDef {
  from: Phase;
  to: Phase;
  gate?: GateId;
  kind?: GateKind;
  requiresVerdict?: Verdict;
}

export const TRANSITIONS: TransitionDef[] = [
  { from: "intake",   to: "clarify" },
  { from: "clarify",  to: "build",   gate: "G1", kind: "confirm" },
  { from: "build",    to: "test" },
  { from: "test",     to: "evaluate" },
  { from: "evaluate", to: "improve", gate: "G2", kind: "select", requiresVerdict: "iterate" },
  { from: "evaluate", to: "deliver", gate: "G2", kind: "select", requiresVerdict: "approve" },
  { from: "improve",  to: "build" },
  { from: "deliver",  to: "done",    gate: "G3", kind: "confirm" },
];

export interface HistoryEntry {
  from: Phase;
  to: Phase;
  at: string;
  gate?: GateId;
  verdict?: Verdict;
}

export interface ForgeState {
  schemaVersion: number;
  project: {
    id: string;
    name: string;
    slug: string;
    type: ProjectType;
    created: string;
    repoRoot: string;
  };
  phase: { current: Phase; status: PhaseStatus; enteredAt: string };
  gates: Record<GateId, GateRecord>;
  improve: { iteration: number; maxIterations: number };
  routing: { overrides: Record<string, string> };
  artifacts: Record<string, string>;
  history: HistoryEntry[];
}
