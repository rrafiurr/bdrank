import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rewardsApi, type RewardRule } from "@/lib/rewardsApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

type RuleForm = { event_type: string; points: string; daily_cap: string; lifetime_cap: string; is_active: boolean };

const emptyForm: RuleForm = { event_type: "", points: "0", daily_cap: "", lifetime_cap: "", is_active: true };

function toBody(form: RuleForm): Partial<RewardRule> {
  return {
    event_type: form.event_type.trim(),
    points: Number(form.points) || 0,
    daily_cap: form.daily_cap === "" ? null : Number(form.daily_cap),
    lifetime_cap: form.lifetime_cap === "" ? null : Number(form.lifetime_cap),
    is_active: form.is_active,
  };
}

export function RulesTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; rule?: RewardRule } | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["reward-rules"],
    queryFn: rewardsApi.rules,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reward-rules"] });

  const createMut = useMutation({
    mutationFn: (body: Partial<RewardRule>) => rewardsApi.createRule(body),
    onSuccess: () => { invalidate(); toast.success("Event type created"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<RewardRule> }) => rewardsApi.updateRule(id, body),
    onSuccess: () => { invalidate(); toast.success("Rule updated"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openCreate = () => { setForm(emptyForm); setDialog({ mode: "create" }); };
  const openEdit = (r: RewardRule) => {
    setForm({
      event_type: r.event_type,
      points: String(r.points),
      daily_cap: r.daily_cap === null ? "" : String(r.daily_cap),
      lifetime_cap: r.lifetime_cap === null ? "" : String(r.lifetime_cap),
      is_active: r.is_active,
    });
    setDialog({ mode: "edit", rule: r });
  };

  const handleSave = () => {
    const body = toBody(form);
    if (dialog?.mode === "create") createMut.mutate(body);
    else if (dialog?.rule) updateMut.mutate({ id: dialog.rule.id, body });
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4 py-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add event type
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event type</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Daily cap</TableHead>
              <TableHead>Lifetime cap</TableHead>
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
            ) : rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No event types configured.
                </TableCell>
              </TableRow>
            ) : (
              rules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.event_type}</TableCell>
                  <TableCell>{r.points}</TableCell>
                  <TableCell>{r.daily_cap ?? "—"}</TableCell>
                  <TableCell>{r.lifetime_cap ?? "—"}</TableCell>
                  <TableCell>
                    <Switch
                      checked={r.is_active}
                      onCheckedChange={(v) => updateMut.mutate({ id: r.id, body: { is_active: v } })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit
                    </Button>
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
            <DialogTitle>{dialog?.mode === "create" ? "Add event type" : "Edit rule"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Event type</Label>
              <Input
                value={form.event_type}
                onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
                placeholder="e.g. review_submitted"
                disabled={dialog?.mode === "edit"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Points</Label>
              <Input
                type="number"
                value={form.points}
                onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Daily cap <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  type="number"
                  value={form.daily_cap}
                  onChange={(e) => setForm((f) => ({ ...f, daily_cap: e.target.value }))}
                  placeholder="No limit"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Lifetime cap <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  type="number"
                  value={form.lifetime_cap}
                  onChange={(e) => setForm((f) => ({ ...f, lifetime_cap: e.target.value }))}
                  placeholder="No limit"
                />
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
            <Button onClick={handleSave} disabled={!form.event_type.trim() || isSaving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
