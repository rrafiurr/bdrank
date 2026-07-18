import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { rewardsApi, type RewardCampaign, type RewardGoal } from "@/lib/rewardsApi";
import { uploadImage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Plus, Pencil, Trash2, Megaphone, ImagePlus, Users, Target } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// datetime-local <-> ISO helpers
// ---------------------------------------------------------------------------

// Converts an ISO timestamp into the value shape <input type="datetime-local">
// expects ("YYYY-MM-DDTHH:mm"), using local time components so the displayed
// value matches what the browser rendered for the visitor's timezone.
function isoToLocalInput(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

function formatWindow(startsAt: string, endsAt: string): string {
  const fmt = (s: string) => {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };
  return `${fmt(startsAt)} → ${fmt(endsAt)}`;
}

// ---------------------------------------------------------------------------
// Campaign form
// ---------------------------------------------------------------------------

type CampaignForm = {
  name: string;
  description: string;
  image_url: string;
  starts_at: string; // datetime-local value
  ends_at: string; // datetime-local value
  is_active: boolean;
};

const emptyCampaignForm: CampaignForm = {
  name: "",
  description: "",
  image_url: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

// Builds the COMPLETE campaign body expected by the admin PUT/POST endpoints.
// These endpoints perform a full-overwrite update (they don't merge partial
// bodies), so every field must always be present — never send a partial object.
function campaignBody(form: CampaignForm): Partial<RewardCampaign> {
  return {
    name: form.name.trim(),
    description: form.description,
    image_url: form.image_url,
    starts_at: localInputToIso(form.starts_at),
    ends_at: localInputToIso(form.ends_at),
    is_active: form.is_active,
  };
}

function fullCampaignBody(c: RewardCampaign, overrides: Partial<RewardCampaign> = {}): Partial<RewardCampaign> {
  return {
    name: c.name,
    description: c.description,
    image_url: c.image_url,
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    is_active: c.is_active,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Goal form
// ---------------------------------------------------------------------------

type GoalForm = {
  name: string;
  threshold_points: string;
  reward_points: string;
  reward_item_id: string; // "none" sentinel for null
  sort_order: string;
};

const emptyGoalForm: GoalForm = {
  name: "",
  threshold_points: "",
  reward_points: "",
  reward_item_id: "none",
  sort_order: "0",
};

// Builds the COMPLETE goal body expected by the admin PUT/POST endpoints —
// full-overwrite update, so every field must always be present. reward_item_id
// must serialize as a number or null, never the raw Select string value.
function goalBody(form: GoalForm): Partial<RewardGoal> {
  return {
    name: form.name.trim(),
    threshold_points: Number(form.threshold_points) || 0,
    reward_points: Number(form.reward_points) || 0,
    reward_item_id: form.reward_item_id === "none" || form.reward_item_id === "" ? null : Number(form.reward_item_id),
    sort_order: Number(form.sort_order) || 0,
  };
}

// ---------------------------------------------------------------------------
// Main tab: campaign list + create/edit
// ---------------------------------------------------------------------------

export function CampaignsTab() {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "create" | "edit"; campaign?: RewardCampaign } | null>(null);
  const [form, setForm] = useState<CampaignForm>(emptyCampaignForm);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["reward-campaigns"],
    queryFn: rewardsApi.campaigns,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["reward-campaigns"] });

  const createMut = useMutation({
    mutationFn: (body: Partial<RewardCampaign>) => rewardsApi.createCampaign(body),
    onSuccess: () => { invalidate(); toast.success("Campaign created"); setDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<RewardCampaign> }) => rewardsApi.updateCampaign(id, body),
    onSuccess: (_, vars) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["reward-campaign", vars.id] });
      toast.success("Campaign updated");
      if (dialog?.mode === "edit" && dialog.campaign?.id === vars.id) setDialog(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => rewardsApi.deleteCampaign(id),
    onSuccess: () => { invalidate(); toast.success("Campaign deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openCreate = () => { setForm(emptyCampaignForm); setDialog({ mode: "create" }); };
  const openEdit = (c: RewardCampaign) => {
    setForm({
      name: c.name,
      description: c.description,
      image_url: c.image_url || "",
      starts_at: isoToLocalInput(c.starts_at),
      ends_at: isoToLocalInput(c.ends_at),
      is_active: c.is_active,
    });
    setDialog({ mode: "edit", campaign: c });
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    if (!form.starts_at || !form.ends_at) {
      toast.error("Start and end dates are required");
      return;
    }
    const startsIso = localInputToIso(form.starts_at);
    const endsIso = localInputToIso(form.ends_at);
    if (!(new Date(endsIso).getTime() > new Date(startsIso).getTime())) {
      toast.error("End date must be after start date");
      return;
    }
    const body = campaignBody(form);
    if (dialog?.mode === "create") createMut.mutate(body);
    else if (dialog?.campaign) updateMut.mutate({ id: dialog.campaign.id, body });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file);
      setForm((f) => ({ ...f, image_url: url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Image upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div className="space-y-4 py-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          New campaign
        </Button>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Window</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Goals</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}><Skeleton className="h-5 w-full" /></TableCell>
                </TableRow>
              ))
            ) : campaigns.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                  <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No campaigns yet.
                </TableCell>
              </TableRow>
            ) : (
              campaigns.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatWindow(c.starts_at, c.ends_at)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={c.is_active}
                      onCheckedChange={(v) => updateMut.mutate({ id: c.id, body: fullCampaignBody(c, { is_active: v }) })}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{c.goals?.length ?? 0}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setDetailId(c.id)}>
                        <Target className="h-3.5 w-3.5 mr-1" />
                        Manage
                      </Button>
                      <button onClick={() => openEdit(c)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete campaign</AlertDialogTitle>
                            <AlertDialogDescription>
                              Delete "{c.name}"? This also removes its goals. This cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteMut.mutate(c.id)}>
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

      {/* Create/edit dialog */}
      <Dialog open={!!dialog} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{dialog?.mode === "create" ? "New campaign" : "Edit campaign"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Campaign name" />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe the campaign…"
                rows={3}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Image</Label>
              <div className="flex items-center gap-3">
                {form.image_url ? (
                  <img src={form.image_url} alt="" className="h-14 w-14 rounded-md object-cover border border-border" />
                ) : (
                  <div className="h-14 w-14 rounded-md border border-dashed border-border flex items-center justify-center">
                    <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? "Uploading…" : form.image_url ? "Change image" : "Upload image"}
                </Button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Starts at</Label>
                <Input
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Ends at</Label>
                <Input
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!form.name.trim() || uploading || isSaving}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Campaign detail: goal editor + participants */}
      {detailId != null && <CampaignDetailDialog campaignId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign detail dialog: goal editor + participants
// ---------------------------------------------------------------------------

function CampaignDetailDialog({ campaignId, onClose }: { campaignId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [view, setView] = useState<"goals" | "participants">("goals");
  const [goalDialog, setGoalDialog] = useState<{ mode: "create" | "edit"; goal?: RewardGoal } | null>(null);
  const [goalForm, setGoalForm] = useState<GoalForm>(emptyGoalForm);

  const { data: campaign, isLoading } = useQuery({
    queryKey: ["reward-campaign", campaignId],
    queryFn: () => rewardsApi.campaign(campaignId),
  });

  const { data: items = [] } = useQuery({
    queryKey: ["reward-items"],
    queryFn: rewardsApi.items,
  });
  const activeItems = items.filter((i) => i.is_active);

  const goals = [...(campaign?.goals ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  const invalidateDetail = () => qc.invalidateQueries({ queryKey: ["reward-campaign", campaignId] });

  const createGoalMut = useMutation({
    mutationFn: (body: Partial<RewardGoal>) => rewardsApi.createGoal(campaignId, body),
    onSuccess: () => { invalidateDetail(); toast.success("Goal created"); setGoalDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const updateGoalMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<RewardGoal> }) => rewardsApi.updateGoal(campaignId, id, body),
    onSuccess: () => { invalidateDetail(); toast.success("Goal updated"); setGoalDialog(null); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const deleteGoalMut = useMutation({
    mutationFn: (id: number) => rewardsApi.deleteGoal(campaignId, id),
    onSuccess: () => { invalidateDetail(); toast.success("Goal deleted"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const openCreateGoal = () => {
    setGoalForm({ ...emptyGoalForm, sort_order: String(goals.length) });
    setGoalDialog({ mode: "create" });
  };
  const openEditGoal = (g: RewardGoal) => {
    setGoalForm({
      name: g.name,
      threshold_points: String(g.threshold_points),
      reward_points: String(g.reward_points),
      reward_item_id: g.reward_item_id == null ? "none" : String(g.reward_item_id),
      sort_order: String(g.sort_order),
    });
    setGoalDialog({ mode: "edit", goal: g });
  };

  const handleSaveGoal = () => {
    if (!goalForm.name.trim()) return;
    const body = goalBody(goalForm);
    if (!((body.threshold_points ?? 0) > 0)) {
      toast.error("Threshold points must be greater than 0");
      return;
    }
    if (!((body.reward_points ?? 0) > 0 || body.reward_item_id != null)) {
      toast.error("Set a reward: reward points or a reward item");
      return;
    }
    if (goalDialog?.mode === "create") createGoalMut.mutate(body);
    else if (goalDialog?.goal) updateGoalMut.mutate({ id: goalDialog.goal.id, body });
  };

  const isSavingGoal = createGoalMut.isPending || updateGoalMut.isPending;

  return (
    <>
      <Dialog open onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isLoading ? "Loading…" : campaign?.name ?? "Campaign"}</DialogTitle>
          </DialogHeader>

          <div className="flex gap-2 border-b border-border pb-3">
            <button
              onClick={() => setView("goals")}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${view === "goals" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              Goals
            </button>
            <button
              onClick={() => setView("participants")}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${view === "participants" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
            >
              <Users className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
              Participants
            </button>
          </div>

          {view === "goals" ? (
            <div className="space-y-3 py-2">
              <div className="flex justify-end">
                <Button size="sm" onClick={openCreateGoal}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  Add goal
                </Button>
              </div>
              {isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : goals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No goals configured for this campaign.</p>
              ) : (
                <div className="border border-border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Threshold</TableHead>
                        <TableHead>Reward</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {goals.map((g) => {
                        const rewardItem = g.reward_item_id != null ? items.find((i) => i.id === g.reward_item_id) : undefined;
                        return (
                          <TableRow key={g.id}>
                            <TableCell>{g.sort_order}</TableCell>
                            <TableCell className="font-medium">{g.name}</TableCell>
                            <TableCell>{g.threshold_points} pts</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {[
                                g.reward_points > 0 ? `${g.reward_points} pts` : null,
                                rewardItem ? rewardItem.name : null,
                              ]
                                .filter(Boolean)
                                .join(" + ") || "—"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 justify-end">
                                <button onClick={() => openEditGoal(g)} className="p-1.5 text-muted-foreground hover:text-foreground transition-colors">
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <button className="p-1.5 text-muted-foreground hover:text-destructive transition-colors">
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete goal</AlertDialogTitle>
                                      <AlertDialogDescription>Delete "{g.name}"? This cannot be undone.</AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => deleteGoalMut.mutate(g.id)}>
                                        Delete
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : (
            <ParticipantsView campaignId={campaignId} goals={campaign?.goals ?? []} />
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Goal create/edit dialog */}
      <Dialog open={!!goalDialog} onOpenChange={(v) => !v && setGoalDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{goalDialog?.mode === "create" ? "Add goal" : "Edit goal"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={goalForm.name} onChange={(e) => setGoalForm((f) => ({ ...f, name: e.target.value }))} placeholder="Goal name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Threshold points</Label>
                <Input
                  type="number"
                  value={goalForm.threshold_points}
                  onChange={(e) => setGoalForm((f) => ({ ...f, threshold_points: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={goalForm.sort_order}
                  onChange={(e) => setGoalForm((f) => ({ ...f, sort_order: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reward points</Label>
              <Input
                type="number"
                value={goalForm.reward_points}
                onChange={(e) => setGoalForm((f) => ({ ...f, reward_points: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Reward item <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Select value={goalForm.reward_item_id} onValueChange={(v) => setGoalForm((f) => ({ ...f, reward_item_id: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {activeItems.map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">A goal needs a positive threshold and either reward points or a reward item.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalDialog(null)}>Cancel</Button>
            <Button onClick={handleSaveGoal} disabled={!goalForm.name.trim() || isSavingGoal}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// Participants view
// ---------------------------------------------------------------------------

function ParticipantsView({ campaignId, goals }: { campaignId: number; goals: RewardGoal[] }) {
  const { data: participants = [], isLoading } = useQuery({
    queryKey: ["reward-participants", campaignId],
    queryFn: () => rewardsApi.participants(campaignId),
  });

  const goalName = (id: number | null) => {
    if (id == null) return "—";
    return goals.find((g) => g.id === id)?.name ?? "—";
  };

  return (
    <div className="py-2">
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : participants.length === 0 ? (
        <div className="text-center text-muted-foreground py-8">
          <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No participants yet.</p>
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Redeemed goal</TableHead>
                <TableHead>Redeemed at</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((p) => (
                <TableRow key={p.user_id}>
                  <TableCell className="font-medium">{p.email}</TableCell>
                  <TableCell className="capitalize">{p.status}</TableCell>
                  <TableCell>{goalName(p.redeemed_goal_id)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.redeemed_at ? new Date(p.redeemed_at).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
