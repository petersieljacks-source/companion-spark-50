import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Card, SectionLabel, LiftBadge, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import { WEEK_LABELS } from "@/lib/531";
import { useAuth } from "@/lib/auth";
import type { MainLift, SuppLift } from "@/lib/531";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  const { activeProgram: prog, bodyweight, setBodyweight, updateProgram, deleteProgram, insertRestartMarker, loading } = useStore();
  const { signOut, user } = useAuth();
  const [bwInput, setBwInput] = useState(String(bodyweight));
  const [restartOpen, setRestartOpen] = useState(false);
  const [restartTMs, setRestartTMs] = useState<number[]>([]);

  if (loading) return <AppShell title="Settings"><Empty>Loading…</Empty></AppShell>;

  function openRestart() {
    if (!prog) return;
    setRestartTMs(prog.main_lifts.map((l) => l.tm));
    setRestartOpen(true);
  }
  async function confirmRestart() {
    if (!prog) return;
    const newMain: MainLift[] = prog.main_lifts.map((l, i) => ({ ...l, tm: restartTMs[i] || l.tm }));
    const newCycle = prog.cycle + 1;
    await insertRestartMarker(prog.id, newCycle, `Restarted from cycle ${prog.cycle}, ${WEEK_LABELS[prog.week]}`);
    await updateProgram(prog.id, { week: 0, day: 0, cycle: newCycle, main_lifts: newMain });
    setRestartOpen(false);
    toast.success(`Cycle ${newCycle} started. Previous data kept in History.`);
  }

  return (
    <AppShell title="Settings">
      <SectionLabel>Account</SectionLabel>
      <Card>
        <div className="text-[13px] text-muted-foreground">Signed in as</div>
        <div className="mt-0.5 truncate text-[15px]">{user?.email}</div>
        <button
          onClick={signOut}
          className="mt-3 rounded-lg border border-input bg-card px-3.5 py-1.5 text-[13px] font-medium"
        >
          Sign out
        </button>
      </Card>

      <SectionLabel>Body weight</SectionLabel>
      <Card>
        <div className="mb-2.5 text-[13px] text-muted-foreground">
          Used to calculate total load for bodyweight exercises.
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={30}
            step={0.5}
            value={bwInput}
            onChange={(e) => setBwInput(e.target.value)}
            className="w-24 rounded-lg border border-input bg-input-bg px-2 py-1.5 text-center text-sm"
          />
          <span className="text-[14px] text-muted-foreground">kg</span>
          <button
            onClick={async () => {
              const v = parseFloat(bwInput);
              if (v && v > 0) {
                await setBodyweight(v);
                toast.success(`Body weight updated to ${v} kg`);
              }
            }}
            className="ml-auto rounded-lg border border-input bg-card px-3.5 py-1.5 text-[13px] font-medium"
          >
            Save
          </button>
        </div>
      </Card>

      {prog && (
        <>
          <SectionLabel>Active — {prog.name}</SectionLabel>
          {prog.main_lifts.length > 0 && (
            <Card>
              <div className="mb-2.5 text-[13px] font-medium text-muted-foreground">Main lifts — training max</div>
              {prog.main_lifts.map((l, i) => (
                <div key={i} className="border-b border-border py-2 last:border-0">
                  {l.bodyweight ? (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 text-sm">{l.name} <LiftBadge kind="bw" /></div>
                        <span className="text-[12px] text-muted-foreground">+</span>
                        <input
                          type="number"
                          step={2.5}
                          value={l.addedLoad ?? 0}
                          onChange={async (e) => {
                            const v = parseFloat(e.target.value) || 0;
                            const newMain = prog.main_lifts.map((x, j) => j === i ? { ...x, addedLoad: v, tm: bodyweight + v } : x);
                            await updateProgram(prog.id, { main_lifts: newMain });
                          }}
                          className="w-20 rounded-lg border border-input bg-input-bg px-2 py-1 text-center text-sm"
                        />
                        <span className="text-[12px] text-muted-foreground">kg</span>
                      </div>
                      <div className="mt-1 text-[12px] text-muted-foreground">
                        TM = BW {bodyweight} + {l.addedLoad ?? 0} = {bodyweight + (l.addedLoad ?? 0)} kg
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 text-sm">{l.name}</div>
                      <input
                        type="number"
                        step={2.5}
                        value={l.tm}
                        onChange={async (e) => {
                          const v = parseFloat(e.target.value) || l.tm;
                          const newMain = prog.main_lifts.map((x, j) => j === i ? { ...x, tm: v } : x);
                          await updateProgram(prog.id, { main_lifts: newMain });
                        }}
                        className="w-20 rounded-lg border border-input bg-input-bg px-2 py-1 text-center text-sm"
                      />
                      <span className="text-[12px] text-muted-foreground">kg</span>
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}

          {prog.supp_lifts.length > 0 && (
            <Card>
              <div className="mb-2.5 text-[13px] font-medium text-muted-foreground">Supporting lifts — working load</div>
              {prog.supp_lifts.map((l, i) => (
                <div key={i} className="border-b border-border py-2 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-sm">{l.name}{l.bodyweight && <LiftBadge kind="bw" />}</div>
                    {l.bodyweight && <span className="text-[12px] text-muted-foreground">+</span>}
                    <input
                      type="number"
                      step={2.5}
                      value={l.weight}
                      onChange={async (e) => {
                        const v = parseFloat(e.target.value) || 0;
                        const newSupp: SuppLift[] = prog.supp_lifts.map((x, j) => j === i ? { ...x, weight: v } : x);
                        await updateProgram(prog.id, { supp_lifts: newSupp });
                      }}
                      className="w-20 rounded-lg border border-input bg-input-bg px-2 py-1 text-center text-sm"
                    />
                    <span className="text-[12px] text-muted-foreground">{l.bodyweight ? "kg added" : "kg"}</span>
                  </div>
                  {l.bodyweight && (
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      Total = BW {bodyweight} + {l.weight} = {bodyweight + l.weight} kg
                    </div>
                  )}
                </div>
              ))}
            </Card>
          )}

          <button
            onClick={openRestart}
            className="mx-4 my-3 block w-[calc(100%-2rem)] rounded-xl border border-input bg-card py-3 text-[15px] font-medium"
          >
            ↺ Restart cycle
          </button>

          {restartOpen && (
            <div className="mx-4">
              <div className="rounded-xl border border-border bg-secondary px-4 py-3.5">
                <div className="mb-2.5 text-[13px] text-muted-foreground">Adjust Training Maxes before restarting (optional)</div>
                {prog.main_lifts.map((l, i) => (
                  <div key={i} className="flex items-center gap-2 border-b border-border py-1.5 last:border-0">
                    <div className="flex-1 text-sm">{l.name}</div>
                    <input
                      type="number"
                      step={2.5}
                      value={restartTMs[i] ?? l.tm}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || l.tm;
                        setRestartTMs((arr) => arr.map((x, j) => j === i ? v : x));
                      }}
                      className="w-20 rounded-lg border border-input bg-input-bg px-2 py-1 text-center text-sm"
                    />
                    <span className="text-[12px] text-muted-foreground">kg</span>
                  </div>
                ))}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setRestartOpen(false)} className="flex-1 rounded-lg border border-input bg-card py-2.5 text-sm">
                    Cancel
                  </button>
                  <button onClick={confirmRestart} className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground">
                    Confirm restart
                  </button>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={async () => {
              if (confirm("Delete this program and all its data?")) {
                await deleteProgram(prog.id);
                toast.success("Program deleted");
              }
            }}
            className="mx-4 my-3 block w-[calc(100%-2rem)] rounded-xl border border-destructive/40 bg-card py-3 text-[15px] font-medium text-destructive"
          >
            Delete program
          </button>
        </>
      )}
    </AppShell>
  );
}
