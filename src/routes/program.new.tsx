import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card, SectionLabel, LiftBadge } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import type { MainLift, SuppLift } from "@/lib/531";

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
  const { createProgram, editProgram, programs, bodyweight } = useStore();
  const editing = editId ? programs.find((p) => p.id === editId) : null;
  const isEdit = !!editing;

  const [name, setName] = useState("");
  const [variant, setVariant] = useState("Classic 5/3/1");
  const [round, setRound] = useState(2.5);
  const [mainLifts, setMainLifts] = useState<MainLift[]>([]);
  const [suppLifts, setSuppLifts] = useState<SuppLift[]>([]);
  const [originalMainSig, setOriginalMainSig] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);
  const [newMainName, setNewMainName] = useState("");
  const [newMainBW, setNewMainBW] = useState(false);
  const [newSuppName, setNewSuppName] = useState("");
  const [newSuppBW, setNewSuppBW] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    if (editId && editing) {
      setName(editing.name);
      setVariant(editing.variant);
      setRound(Number(editing.round));
      setMainLifts(editing.main_lifts as MainLift[]);
      setSuppLifts(editing.supp_lifts as SuppLift[]);
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
    setSuppLifts((arr) => [...arr, { name: n, bodyweight: newSuppBW, weight: 0 }]);
    setNewSuppName(""); setNewSuppBW(false);
  }

  async function submit() {
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
      });
      toast.success("Program created");
    }
    navigate({ to: "/" });
  }

  const mainChanged = isEdit && hydrated && mainSignature(mainLifts) !== originalMainSig;

  return (
    <AppShell title={isEdit ? "Edit program" : "New program"} hideTabBar back={() => navigate({ to: "/" })}>
      <Card>
        <Field label="Program name">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My 5/3/1"
            className="mt-1.5 w-full rounded-lg border border-input bg-input-bg px-3 py-2 text-[15px]"
          />
        </Field>
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
      </Card>

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
                      step={2.5}
                      value={l.addedLoad ?? 0}
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
                    step={2.5}
                    value={l.tm}
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
                  step={2.5}
                  value={l.weight}
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

      <button
        onClick={submit}
        className="mx-4 my-3 block w-[calc(100%-2rem)] rounded-xl bg-primary py-3 text-[15px] font-semibold text-primary-foreground"
      >
        {isEdit ? "Save changes" : "Create program"}
      </button>
    </AppShell>
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
