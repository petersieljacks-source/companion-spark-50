import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Archive, ArchiveRestore, Trash2, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card, SectionLabel, Empty } from "@/components/ui-bits";
import { useStore } from "@/lib/store";
import type { Program, WorkoutLog } from "@/lib/531";

export const Route = createFileRoute("/programs")({
  component: ProgramsPage,
});

function ProgramsPage() {
  const navigate = useNavigate();
  const {
    programs,
    logs,
    loading,
    setActiveProgram,
    archiveProgram,
    unarchiveProgram,
    deleteProgram,
  } = useStore();

  const active = programs.find((p) => p.active && !p.archived) ?? null;
  const livePrograms = programs.filter((p) => !p.archived);
  const archivedPrograms = programs.filter((p) => p.archived);

  if (loading) return <AppShell title="Programs"><Empty>Loading…</Empty></AppShell>;

  async function handleSwitch(p: Program) {
    if (p.id === active?.id) return;
    await setActiveProgram(p.id);
    toast.success(`Switched to "${p.name}"`);
    navigate({ to: "/" });
  }

  async function handleDelete(p: Program) {
    if (p.active && !p.archived) {
      toast.error("Switch to another program before deleting this one.");
      return;
    }
    const logCount = logs.filter((l) => l.program_id === p.id).length;
    const ok = confirm(
      `Permanently delete "${p.name}"?\n\nThis also removes ${logCount} workout log${logCount === 1 ? "" : "s"} for this program.\n\nTo keep your history, use Archive instead.`,
    );
    if (!ok) return;
    await deleteProgram(p.id);
    toast.success("Program deleted");
  }

  return (
    <AppShell title="Programs">
      <div className="flex justify-end px-4 pt-2">
        <Link
          to="/program/new"
          className="rounded-lg border border-input bg-card px-3.5 py-1.5 text-[13px] font-medium"
        >
          <Plus className="mr-1 inline h-3.5 w-3.5" /> New Program
        </Link>
      </div>

      <SectionLabel>Your programs</SectionLabel>
      {livePrograms.length === 0 ? (
        <Empty>No programs yet. Create your first one.</Empty>
      ) : (
        <div className="px-1">
          {livePrograms.map((p) => (
            <ProgramRow
              key={p.id}
              prog={p}
              logs={logs}
              isActive={p.id === active?.id}
              onSwitch={() => handleSwitch(p)}
              onArchive={async () => {
                if (p.active) {
                  toast.error("Switch to another program before archiving this one.");
                  return;
                }
                await archiveProgram(p.id);
                toast.success("Program archived");
              }}
              onDelete={() => handleDelete(p)}
            />
          ))}
        </div>
      )}

      {archivedPrograms.length > 0 && (
        <>
          <SectionLabel>Archived</SectionLabel>
          <div className="px-1">
            {archivedPrograms.map((p) => (
              <ProgramRow
                key={p.id}
                prog={p}
                logs={logs}
                isActive={false}
                archived
                onSwitch={() => handleSwitch(p)}
                onUnarchive={async () => {
                  await unarchiveProgram(p.id);
                  toast.success("Program unarchived");
                }}
                onDelete={() => handleDelete(p)}
              />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

function ProgramRow({
  prog,
  logs,
  isActive,
  archived,
  onSwitch,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  prog: Program;
  logs: WorkoutLog[];
  isActive: boolean;
  archived?: boolean;
  onSwitch: () => void;
  onArchive?: () => void;
  onUnarchive?: () => void;
  onDelete: () => void;
}) {
  const stats = useMemo(() => {
    const ours = logs.filter((l) => l.program_id === prog.id);
    const sessions = ours.filter((l) => l.type === "main" || l.type === "supp" || l.type === "custom");
    const last = ours.reduce<string | null>((acc, l) => (acc && acc > l.date ? acc : l.date), null);
    return {
      total: sessions.length,
      lastDate: last ? new Date(last).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null,
    };
  }, [logs, prog.id]);

  const isCustom = prog.kind === "custom";
  const subtitle = isCustom
    ? `Custom · ${(prog.sessions ?? []).length} session${(prog.sessions ?? []).length === 1 ? "" : "s"}`
    : `5/3/1 · ${prog.variant} · Cycle ${prog.cycle}`;

  return (
    <Card className={isActive ? "!border-info" : ""}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="truncate text-[15px] font-semibold">{prog.name}</div>
            {isActive && (
              <span className="rounded-full bg-info-bg px-1.5 py-0.5 text-[10px] font-semibold text-info">
                ACTIVE
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {stats.total} session{stats.total === 1 ? "" : "s"} logged
            {stats.lastDate ? ` · last ${stats.lastDate}` : " · never trained"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!isActive && (
          <button
            onClick={onSwitch}
            className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground"
          >
            <Check className="h-3.5 w-3.5" /> {archived ? "Restore & switch" : "Switch to this"}
          </button>
        )}
        <Link
          to="/program/new"
          search={{ edit: prog.id }}
          className="flex items-center gap-1 rounded-lg border border-input bg-card px-3 py-1.5 text-[12px] font-medium"
        >
          <Pencil className="h-3.5 w-3.5" /> Edit
        </Link>
        {archived ? (
          <button
            onClick={onUnarchive}
            className="flex items-center gap-1 rounded-lg border border-input bg-card px-3 py-1.5 text-[12px] font-medium"
          >
            <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
          </button>
        ) : (
          !isActive && (
            <button
              onClick={onArchive}
              className="flex items-center gap-1 rounded-lg border border-input bg-card px-3 py-1.5 text-[12px] font-medium"
            >
              <Archive className="h-3.5 w-3.5" /> Archive
            </button>
          )
        )}
        <button
          onClick={onDelete}
          disabled={isActive}
          className="ml-auto flex items-center gap-1 rounded-lg border border-destructive/40 bg-card px-3 py-1.5 text-[12px] font-medium text-destructive disabled:opacity-40"
        >
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </button>
      </div>
    </Card>
  );
}
