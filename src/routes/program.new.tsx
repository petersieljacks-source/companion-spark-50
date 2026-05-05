import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card, SectionLabel, LiftBadge } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import type {
  MainLift,
  SuppLift,
  ProgramKind,
  CustomSession,
  CustomExercise,
  ProgressionRule,
} from "@/lib/531";
import { defaultExercise, newId, computeSupersetLabels, nextSupersetLetter } from "@/lib/custom";

const searchSchema = z.object({
  edit: z.string().optional(),
});

export const Route = createFileRoute("/program/new")({
  component: NewProgram,
  validateSearch: searchSchema,
});

function NewProgram() {
  const navigate = useNavigate();
  const { edit: editId } = Route.useSearch();
  const { createProgram, editProgram, updateProgram, programs, bodyweight } = useStore();
  const editing = editId ? programs.find((p) => p.id === editId) : null;
  const isEdit = !!editing;

  const [kind, setKind] = useState<ProgramKind>("wendler531");
  const [name, setName] = useState("");
  const [variant, setVariant] = useState("Classic 5/3/1");
  const [round, setRound] = useState(2.5);
  const [mainLifts, setMainLifts] = useState<MainLift[]>([]);
  const [suppLifts, setSuppLifts] = useState<SuppLift[]>([]);
  const [originalMainSig, setOriginalMainSig] = useState<string>("");

  // Custom-program state
  const [defaultRule, setDefaultRule] = useState<ProgressionRule>("linear");
  const [defaultIncrement, setDefaultIncrement] = useState<number>(2.5);
  const [sessions, setSessions] = useState<CustomSession[]>([]);

  const [hydrated, setHydrated] = useState(false);
  const [newMainName, setNewMainName] = useState("");
  const [newMainBW, setNewMainBW] = useState(false);
  const [newSuppName, setNewSuppName] = useState("");
  const [newSuppBW, setNewSuppBW] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    if (editId && editing) {
      setKind((editing.kind as ProgramKind) ?? "wendler531");
      setName(editing.name);
      setVariant(editing.variant);
      setRound(Number(editing.round));
      setMainLifts(editing.main_lifts as MainLift[]);
      setSuppLifts(editing.supp_lifts as SuppLift[]);
      setSessions((editing.sessions as CustomSession[]) ?? []);
      setDefaultRule((editing.default_rule as ProgressionRule) ?? "linear");
      setDefaultIncrement(Number(editing.default_increment ?? 2.5));
      setOriginalMainSig(mainSignature(editing.main_lifts as MainLift[]));
      setHydrated(true);
    } else if (!editId) {
      setHydrated(true);
    }
  }, [editId, editing, hydrated]);

  function mainSignature(lifts: MainLift[]) {
    return lifts
      .map((l) => `${l.name.trim().toLowerCase()}|${l.bodyweight ? 1 : 0}`)
      .join("›");
  }

  function addMain() {
    const n = newMainName.trim();
    if (!n) return;
    setMainLifts((arr) => [
      ...arr,
      { name: n, bodyweight: newMainBW, tm: newMainBW ? bodyweight : 100, addedLoad: 0 },
    ]);
    setNewMainName(""); setNewMainBW(false);
  }
  function addSupp() {
    const n = newSuppName.trim();
    if (!n) return;
    setSuppLifts((arr) => [
      ...arr,
      { name: n, bodyweight: newSuppBW, weight: 0, rep_targets: [10, 10, 10], increment: 2.5 },
    ]);
    setNewSuppName(""); setNewSuppBW(false);
  }

  // Custom-session helpers
  function defaultSessionName(idx: number, total: number) {
    if (total === 2) return idx === 0 ? "Lower" : "Upper";
    if (total === 3) return ["Push", "Pull", "Legs"][idx] ?? `Session ${idx + 1}`;
    if (total === 4) return ["Lower A", "Upper A", "Lower B", "Upper B"][idx] ?? `Session ${idx + 1}`;
    return `Session ${idx + 1}`;
  }
  function isDefaultName(name: string) {
    return (
      name === "" ||
      /^Session \d+$/.test(name) ||
      ["Lower", "Upper", "Push", "Pull", "Legs", "Lower A", "Upper A", "Lower B", "Upper B"].includes(name)
    );
  }
  function addSession() {
    setSessions((arr) => {
      const next = [...arr, { id: newId(), name: "", exercises: [], runs: 0 }];
      return next.map((s, i) =>
        isDefaultName(s.name) ? { ...s, name: defaultSessionName(i, next.length) } : s,
      );
    });
  }
  function applyPreset(preset: "upper-lower" | "ppl" | "4day") {
    const names =
      preset === "upper-lower"
        ? ["Lower", "Upper"]
        : preset === "ppl"
          ? ["Push", "Pull", "Legs"]
          : ["Lower A", "Upper A", "Lower B", "Upper B"];
    setSessions(names.map((n) => ({ id: newId(), name: n, exercises: [], runs: 0 })));
  }
  function removeSession(id: string) {
    setSessions((arr) => arr.filter((s) => s.id !== id));
  }
  function renameSession(id: string, name: string) {
    setSessions((arr) => arr.map((s) => (s.id === id ? { ...s, name } : s)));
  }
  function addExercise(sessionId: string, group: string | null = null) {
    setSessions((arr) =>
      arr.map((s) =>
        s.id === sessionId
          ? { ...s, exercises: [...s.exercises, { ...defaultExercise(defaultRule, defaultIncrement), group }] }
          : s,
      ),
    );
  }
  function addSuperset(sessionId: string) {
    setSessions((arr) =>
      arr.map((s) => {
        if (s.id !== sessionId) return s;
        const letter = nextSupersetLetter(s.exercises);
        return {
          ...s,
          exercises: [
            ...s.exercises,
            { ...defaultExercise(defaultRule, defaultIncrement), group: letter },
            { ...defaultExercise(defaultRule, defaultIncrement), group: letter },
          ],
        };
      }),
    );
  }
  function updateExercise(sessionId: string, exId: string, patch: Partial<CustomExercise>) {
    setSessions((arr) =>
      arr.map((s) =>
        s.id === sessionId
          ? { ...s, exercises: s.exercises.map((e) => (e.id === exId ? { ...e, ...patch } : e)) }
          : s,
      ),
    );
  }
  function removeExercise(sessionId: string, exId: string) {
    setSessions((arr) =>
      arr.map((s) =>
        s.id === sessionId ? { ...s, exercises: s.exercises.filter((e) => e.id !== exId) } : s,
      ),
    );
  }

  async function submit() {
    if (kind === "wendler531") {
      if (!mainLifts.length && !suppLifts.length) {
        toast.error("Add at least one lift.");
        return;
      }
      if (isEdit && editing) {
        const willRestart = mainSignature(mainLifts) !== originalMainSig;
        await editProgram(editing.id, {
          name: name.trim() || editing.name,
          variant,
          round,
          main_lifts: mainLifts,
          supp_lifts: suppLifts,
        });
        toast.success(willRestart ? "Program updated — cycle restarted" : "Program updated");
      } else {
        await createProgram({
          name: name.trim() || "My Program",
          variant,
          round,
          main_lifts: mainLifts,
          supp_lifts: suppLifts,
          kind: "wendler531",
        });
        toast.success("Program created");
      }
    } else {
      // custom
      if (!sessions.length || sessions.every((s) => s.exercises.length === 0)) {
        toast.error("Add at least one session with at least one exercise.");
        return;
      }
      // strip empty exercises (no name)
      const cleanSessions = sessions
        .map((s) => ({ ...s, exercises: s.exercises.filter((e) => e.name.trim().length > 0) }))
        .filter((s) => s.exercises.length > 0);
      if (!cleanSessions.length) {
        toast.error("Each exercise needs a name.");
        return;
      }
      if (isEdit && editing) {
        await updateProgram(editing.id, {
          name: name.trim() || editing.name,
          round,
          sessions: cleanSessions,
          default_rule: defaultRule,
          default_increment: defaultIncrement,
        });
        toast.success("Custom program updated");
      } else {
        await createProgram({
          name: name.trim() || "My Custom Program",
          variant: "Custom",
          round,
          main_lifts: [],
          supp_lifts: [],
          kind: "custom",
          sessions: cleanSessions,
          default_rule: defaultRule,
          default_increment: defaultIncrement,
        });
        toast.success("Custom program created");
      }
    }
    navigate({ to: "/" });
  }

  const mainChanged = isEdit && hydrated && kind === "wendler531" && mainSignature(mainLifts) !== originalMainSig;

  return (
    <AppShell title={isEdit ? "Edit program" : "New program"} hideTabBar back={() => navigate({ to: "/" })}>
      {!isEdit && (
        <>
          <SectionLabel>Program type</SectionLabel>
          <div className="px-4">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setKind("wendler531")}
                className={`rounded-xl border px-3 py-3 text-left ${
                  kind === "wendler531" ? "border-foreground bg-info-bg" : "border-border bg-card"
                }`}
              >
                <div className="text-[14px] font-semibold">5/3/1</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">Jim Wendler 4-week cycles</div>
              </button>
              <button
                onClick={() => setKind("custom")}
                className={`rounded-xl border px-3 py-3 text-left ${
                  kind === "custom" ? "border-foreground bg-info-bg" : "border-border bg-card"
                }`}
              >
                <div className="text-[14px] font-semibold">Custom</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">Your own sessions + progression</div>
              </button>
            </div>
          </div>
        </>
      )}

      <Card>
        <Field label="Program name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "custom" ? "e.g. Upper / Lower" : "e.g. My 5/3/1"}
            className="mt-1.5 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[15px]"
          />
        </Field>
        {kind === "wendler531" && (
          <Field label="Variant">
            <select
              value={variant}
              onChange={(e) => setVariant(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[15px]"
            >
              <option>Classic 5/3/1</option>
              <option>5/3/1 with BBB</option>
              <option>5/3/1 with FSL</option>
              <option>5/3/1 for Beginners</option>
              <option>Leader/Anchor</option>
            </select>
          </Field>
        )}
        <Field label="Weight rounding">
          <select
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
            className="mt-1.5 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[15px]"
          >
            <option value={2.5}>2.5 kg</option>
            <option value={1.25}>1.25 kg</option>
            <option value={5}>5 kg</option>
          </select>
        </Field>
        {kind === "custom" && (
          <>
            <Field label="Default progression rule">
              <select
                value={defaultRule}
                onChange={(e) => setDefaultRule(e.target.value as ProgressionRule)}
                className="mt-1.5 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[15px]"
              >
                <option value="linear">Linear (+kg if all reps hit)</option>
                <option value="double">Double progression (reps then weight)</option>
                <option value="percentage">Percentage of 1RM</option>
                <option value="manual">Manual (no auto-update)</option>
              </select>
            </Field>
            <Field label="Default increment (kg)">
              <input
                type="number"
                inputMode="decimal"
                step={0.5}
                value={defaultIncrement}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setDefaultIncrement(parseFloat(e.target.value) || 0)}
                className="mt-1.5 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[15px]"
              />
            </Field>
          </>
        )}
      </Card>

      {kind === "wendler531" ? (
        <>
          <SectionLabel>Main lifts (5/3/1)</SectionLabel>
          {mainChanged && (
            <div className="mx-4 mb-2 rounded-lg border border-warning bg-warning-bg px-3 py-2 text-[12px] text-warning">
              Main lifts changed — saving will restart the cycle (history is kept).
            </div>
          )}
          <Card>
            {mainLifts.length === 0 ? (
              <div className="py-1 text-[13px] text-muted-foreground">Add main lifts below</div>
            ) : (
              mainLifts.map((l, i) => (
                <div key={i} className="border-b border-border py-2 last:border-0">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {l.name} {l.bodyweight && <LiftBadge kind="bw" />}
                    </div>
                    <button onClick={() => setMainLifts((a) => a.filter((_, j) => j !== i))} className="text-lg text-destructive">×</button>
                  </div>
                  {l.bodyweight ? (
                    <>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="flex-1 text-[13px] text-muted-foreground">BW ({bodyweight} kg) + added</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step={2.5}
                          value={l.addedLoad ?? 0}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value) || 0;
                            setMainLifts((arr) => arr.map((x, j) => j === i ? { ...x, addedLoad: v, tm: bodyweight + v } : x));
                          }}
                          className="w-20 rounded-lg border border-input bg-input-bg px-2 py-1 text-center text-sm"
                        />
                        <span className="text-[12px] text-muted-foreground">kg</span>
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground">
                        TM = {bodyweight} + {l.addedLoad ?? 0} = <strong className="text-foreground">{bodyweight + (l.addedLoad ?? 0)} kg</strong>
                      </div>
                    </>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex-1 text-[13px] text-muted-foreground">Training max</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={2.5}
                        value={l.tm}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value) || 100;
                          setMainLifts((arr) => arr.map((x, j) => j === i ? { ...x, tm: v } : x));
                        }}
                        className="w-20 rounded-lg border border-input bg-input-bg px-2 py-1 text-center text-sm"
                      />
                      <span className="text-[12px] text-muted-foreground">kg</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </Card>
          <AddRow
            name={newMainName} setName={setNewMainName}
            bw={newMainBW} setBw={setNewMainBW}
            onAdd={addMain}
            placeholder="e.g. Squat"
          />

          <SectionLabel>Supporting lifts (8–10 reps)</SectionLabel>
          <Card>
            {suppLifts.length === 0 ? (
              <div className="py-1 text-[13px] text-muted-foreground">Add supporting lifts below</div>
            ) : (
              suppLifts.map((l, i) => (
                <div key={i} className="border-b border-border py-2 last:border-0">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">
                      {l.name} {l.bodyweight && <LiftBadge kind="bw" />}
                    </div>
                    <button onClick={() => setSuppLifts((a) => a.filter((_, j) => j !== i))} className="text-lg text-destructive">×</button>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="flex-1 text-[13px] text-muted-foreground">
                      {l.bodyweight ? `BW (${bodyweight} kg) + added` : "Starting weight"}
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step={2.5}
                      value={l.weight}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        setSuppLifts((arr) => arr.map((x, j) => j === i ? { ...x, weight: v } : x));
                      }}
                      className="w-20 rounded-lg border border-input bg-input-bg px-2 py-1 text-center text-sm"
                    />
                    <span className="text-[12px] text-muted-foreground">kg</span>
                  </div>
                  {l.bodyweight && (
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      Total = {bodyweight} + {l.weight} = <strong className="text-foreground">{bodyweight + l.weight} kg</strong>
                    </div>
                  )}
                  <div className="mt-2.5">
                    <div className="mb-1 text-[12px] text-muted-foreground">Rep target per set</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[0, 1, 2].map((s) => {
                        const targets = l.rep_targets ?? [10, 10, 10];
                        return (
                          <div key={s} className="flex items-center gap-1">
                            <span className="text-[11px] text-muted-foreground">S{s + 1}</span>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={1}
                              value={targets[s] ?? 10}
                              onFocus={(e) => e.currentTarget.select()}
                              onChange={(e) => {
                                const v = Math.max(1, parseInt(e.target.value) || 1);
                                setSuppLifts((arr) => arr.map((x, j) => {
                                  if (j !== i) return x;
                                  const next = [...(x.rep_targets ?? [10, 10, 10])];
                                  next[s] = v;
                                  return { ...x, rep_targets: next };
                                }));
                              }}
                              className="w-full rounded-lg border border-input bg-input-bg px-1.5 py-1 text-center text-sm"
                            />
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <span>Load bump (when all targets hit):</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={0.5}
                        min={0}
                        value={l.increment ?? 2.5}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => {
                          const v = Math.max(0, parseFloat(e.target.value) || 0);
                          setSuppLifts((arr) => arr.map((x, j) => j === i ? { ...x, increment: v } : x));
                        }}
                        className="w-16 rounded-lg border border-input bg-input-bg px-1.5 py-0.5 text-center text-[12px]"
                      />
                      <span>kg</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </Card>
          <AddRow
            name={newSuppName} setName={setNewSuppName}
            bw={newSuppBW} setBw={setNewSuppBW}
            onAdd={addSupp}
            placeholder="e.g. Pull-up"
          />
        </>
      ) : (
        <>
          <SectionLabel>Sessions</SectionLabel>
          {sessions.length === 0 && (
            <>
              <div className="px-4 pb-2 text-[12px] text-muted-foreground">
                Pick a template or add sessions one at a time.
              </div>
              <div className="px-4 pb-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applyPreset("upper-lower")}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-[12px] font-medium"
                >
                  Lower / Upper (2)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("ppl")}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-[12px] font-medium"
                >
                  Push / Pull / Legs (3)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("4day")}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-[12px] font-medium"
                >
                  4-day Upper/Lower
                </button>
              </div>
            </>
          )}
          {sessions.map((s) => (
            <div key={s.id} className="mx-4 my-3 rounded-xl border border-border bg-card px-3.5 py-3">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={s.name}
                  onChange={(e) => renameSession(s.id, e.target.value)}
                  className="flex-1 rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-[14px] font-medium"
                />
                <button
                  onClick={() => {
                    if (confirm(`Remove session "${s.name}"?`)) removeSession(s.id);
                  }}
                  className="text-lg text-destructive"
                  aria-label="Remove session"
                >
                  ×
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {s.exercises.length === 0 && (
                  <div className="py-1 text-[12px] text-muted-foreground">No exercises yet.</div>
                )}
                {(() => {
                  const labels = computeSupersetLabels(s.exercises);
                  return s.exercises.map((ex) => (
                    <ExerciseEditor
                      key={ex.id}
                      exercise={ex}
                      bodyweight={bodyweight}
                      label={labels[ex.id]}
                      onChange={(patch) => updateExercise(s.id, ex.id, patch)}
                      onRemove={() => removeExercise(s.id, ex.id)}
                    />
                  ));
                })()}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => addExercise(s.id)}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-[12px] font-medium"
                >
                  + Add exercise
                </button>
                <button
                  onClick={() => addSuperset(s.id)}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-[12px] font-medium"
                >
                  + New superset
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={addSession}
            className="mx-4 mb-2 mt-1 block w-[calc(100%-2rem)] rounded-xl border border-dashed border-input bg-card py-2.5 text-[14px] font-medium text-muted-foreground"
          >
            + Add session
          </button>
        </>
      )}

      <button
        onClick={submit}
        className="mx-4 my-3 block w-[calc(100%-2rem)] rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground"
      >
        {isEdit ? "Save changes" : "Create program"}
      </button>
    </AppShell>
  );
}

function ExerciseEditor({
  exercise,
  bodyweight,
  onChange,
  onRemove,
}: {
  exercise: CustomExercise;
  bodyweight: number;
  onChange: (patch: Partial<CustomExercise>) => void;
  onRemove: () => void;
}) {
  const isRange = exercise.reps_high !== exercise.reps_low;
  return (
    <div className="rounded-lg border border-border bg-secondary px-3 py-2.5">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={exercise.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Bench press"
          className="flex-1 rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-[14px]"
        />
        <label className="flex items-center gap-1 whitespace-nowrap text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={exercise.bodyweight}
            onChange={(e) => onChange({ bodyweight: e.target.checked })}
          />
          BW
        </label>
        <button onClick={onRemove} className="text-lg text-destructive" aria-label="Remove exercise">×</button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <NumberField label="Sets" value={exercise.sets} step={1} min={1} onChange={(v) => onChange({ sets: Math.max(1, Math.round(v)) })} />
        <NumberField
          label={isRange ? "Reps low" : "Reps"}
          value={exercise.reps_low}
          step={1}
          min={1}
          onChange={(v) => {
            const n = Math.max(1, Math.round(v));
            onChange({ reps_low: n, reps_high: Math.max(n, exercise.reps_high) });
          }}
        />
        <NumberField
          label="Reps high"
          value={exercise.reps_high}
          step={1}
          min={exercise.reps_low}
          onChange={(v) => onChange({ reps_high: Math.max(exercise.reps_low, Math.round(v)) })}
        />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <NumberField
          label={exercise.bodyweight ? `+ kg over BW (${bodyweight})` : "Working weight (kg)"}
          value={exercise.weight}
          step={2.5}
          min={0}
          onChange={(v) => onChange({ weight: v })}
        />
        <div>
          <label className="text-[11px] text-muted-foreground">Progression</label>
          <select
            value={exercise.rule}
            onChange={(e) => onChange({ rule: e.target.value as ProgressionRule })}
            className="mt-1 w-full rounded-lg border border-input bg-input-bg px-2 py-1.5 text-[13px]"
          >
            <option value="linear">Linear</option>
            <option value="double">Double</option>
            <option value="percentage">% of 1RM</option>
            <option value="manual">Manual</option>
          </select>
        </div>
      </div>

      {exercise.rule === "percentage" && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <NumberField
            label="1RM (kg)"
            value={exercise.one_rm ?? 0}
            step={2.5}
            min={0}
            onChange={(v) => onChange({ one_rm: v })}
          />
          <NumberField
            label="% of 1RM"
            value={Math.round(((exercise.pct ?? 0.7) * 100))}
            step={1}
            min={0}
            onChange={(v) => onChange({ pct: Math.max(0, v) / 100 })}
          />
        </div>
      )}

      {exercise.rule !== "manual" && exercise.rule !== "percentage" && (
        <div className="mt-2">
          <NumberField
            label="Increment per progression (kg)"
            value={exercise.increment}
            step={0.5}
            min={0}
            onChange={(v) => onChange({ increment: v })}
          />
        </div>
      )}

      <label className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
        <input
          type="checkbox"
          checked={exercise.amrap_last}
          onChange={(e) => onChange({ amrap_last: e.target.checked })}
        />
        Last set is AMRAP (as many reps as possible)
      </label>
    </div>
  );
}

function NumberField({
  label, value, step, min, onChange,
}: { label: string; value: number; step: number; min?: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-[11px] text-muted-foreground">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          onChange(isFinite(v) ? v : 0);
        }}
        className="mt-1 w-full rounded-lg border border-input bg-input-bg px-2 py-1.5 text-center text-[13px]"
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <label className="text-[13px] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function AddRow({
  name, setName, bw, setBw, onAdd, placeholder,
}: {
  name: string; setName: (v: string) => void;
  bw: boolean; setBw: (v: boolean) => void;
  onAdd: () => void; placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pb-1">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-input bg-input-bg px-3 py-2 text-[15px]"
      />
      <label className="flex items-center gap-1 whitespace-nowrap text-[13px] text-muted-foreground">
        <input type="checkbox" checked={bw} onChange={(e) => setBw(e.target.checked)} /> BW
      </label>
      <button onClick={onAdd} className="rounded-lg border border-input bg-card px-3.5 py-1.5 text-[13px] font-medium">
        Add
      </button>
    </div>
  );
}
