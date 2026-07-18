import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rewardsApi, type RewardLevel } from "@/lib/rewardsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

type LevelForm = { name: string; min_points: string; icon: string; color: string; is_active: boolean };

const emptyForm: LevelForm = { name: "", min_points: "0", icon: "", color: "#f59e0b", is_active: true };

function toBody(form: LevelForm): Partial<RewardLevel> {
  return {
    name: form.name.trim(),
    min_points: Number(form.min_points) || 0,
    icon: form.icon.trim(),
    color: form.color.trim(),
    is_active: form.is_active,
  };
}

export function LevelsTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; level?: RewardLevel } | null>(null);
  const [form, setForm] = useState<LevelForm>(emptyForm);

  const { data: levels = [], isLoading } = useQuery({
    queryKey: ["reward-levels"],
    queryFn: rewardsApi.levels,
  });
  const sorted = [...levels].sort((a, b) => a.min_points - b.min_points);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reward-levels"] });

  const createMut = useMutation({
    mutationFn: (body: Partial<RewardLevel>) => rewardsApi.createLevel(body),
    onSuccess: () => { invalidate(); toast.success("Level created"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<RewardLevel> }) => rewardsApi.updateLevel(id, body),
    onSuccess: () => { invalidate(); toast.success("Level updated"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => rewardsApi.deleteLevel(id),
    onSuccess: () => { invalidate(); toast.success("Level deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openCreate = () => { setForm(emptyForm); setDialog({ mode: "create" }); };
  const openEdit = (l: RewardLevel) => {
    setForm({ name: l.name, min_points: String(l.min_points), icon: l.icon, color: l.color, is_active: l.is_active });
    setDialog({ mode: "edit", level: l });
  };

  const handleSave = () => {
    const body = toBody(form);
    if (dialog?.mode === "create") createMut.mutate(body);
    else if (dialog?.level) updateMut.mutate({ id: dialog.level.id, body });
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4 py-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add level
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Min points</TableHead>
              <TableHead>Icon</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
              ))
            ) : sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No levels configured.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.name}</TableCell>
                  <TableCell>{l.min_points}</TableCell>
                  <TableCell className="text-lg">{l.icon}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="h-4 w-4 rounded-full border border-border shrink-0"
                        style={{ backgroundColor: l.color }}
                      />
                      <span className="text-xs text-muted-foreground">{l.color}</span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={l.is_active}
                      onCheckedChange={(v) => updateMut.mutate({ id: l.id, body: { is_active: v } })}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => openEdit(l)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete level</AlertDialogTitle>
                            <AlertDialogDescription>
                              Delete "{l.name}"? This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive hover:bg-destructive/90"
                              onClick={() => deleteMut.mutate(l.id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "Add level" : "Edit level"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Gold"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Minimum points</Label>
              <Input
                type="number"
                value={form.min_points}
                onChange={(e) => setForm((f) => ({ ...f, min_points: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Icon</Label>
                <Input
                  value={form.icon}
                  onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                  placeholder="e.g. 🥇"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex items-center gap-2">
                  <span
                    className="h-8 w-8 shrink-0 rounded-full border border-border"
                    style={{ backgroundColor: form.color || "transparent" }}
                  />
                  <Input
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                    placeholder="#f59e0b"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || isSaving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
