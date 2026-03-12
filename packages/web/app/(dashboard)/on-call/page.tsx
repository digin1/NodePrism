'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ModalPanel, ModalTitle } from '@/components/ui/modal';
import { PageHeader, SummaryStat } from '@/components/ui/page-header';
import { EmptyState, LoadingState } from '@/components/ui/state-panel';
import { onCallApi, userApi, UserInfo } from '@/lib/api';

interface OnCallRotation {
  id: string;
  scheduleId: string;
  userId: string;
  startTime: string;
  endTime: string;
  user?: { id: string; name: string; email: string } | null;
  schedule?: { id: string; name: string; timezone: string } | null;
}

interface OnCallSchedule {
  id: string;
  name: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
  _count?: { rotations: number };
  rotations?: OnCallRotation[];
}

const defaultForm = { name: '', timezone: 'UTC' };

const defaultRotationForm = { userId: '', startTime: '', endTime: '' };

export default function OnCallPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(defaultForm);
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);
  const [rotationForm, setRotationForm] = useState(defaultRotationForm);
  const [showRotationForm, setShowRotationForm] = useState(false);

  const { data: schedules, isLoading } = useQuery({
    queryKey: ['onCallSchedules'],
    queryFn: () => onCallApi.list(),
  });

  const { data: currentOnCall } = useQuery({
    queryKey: ['onCallCurrent'],
    queryFn: () => onCallApi.current(),
  });

  const { data: selectedDetail } = useQuery({
    queryKey: ['onCallSchedule', selectedSchedule],
    queryFn: () => onCallApi.get(selectedSchedule!),
    enabled: !!selectedSchedule,
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => userApi.list(),
  });

  const createMutation = useMutation({
    mutationFn: () => onCallApi.create({ name: formData.name, timezone: formData.timezone }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onCallSchedules'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error('No schedule selected');
      return onCallApi.update(editingId, { name: formData.name, timezone: formData.timezone });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onCallSchedules'] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => onCallApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onCallSchedules'] });
      if (selectedSchedule) {
        setSelectedSchedule(null);
      }
    },
  });

  const addRotationMutation = useMutation({
    mutationFn: () => {
      if (!selectedSchedule) throw new Error('No schedule selected');
      return onCallApi.addRotation(selectedSchedule, {
        userId: rotationForm.userId,
        startTime: rotationForm.startTime,
        endTime: rotationForm.endTime,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onCallSchedule', selectedSchedule] });
      queryClient.invalidateQueries({ queryKey: ['onCallCurrent'] });
      setRotationForm(defaultRotationForm);
      setShowRotationForm(false);
    },
  });

  const removeRotationMutation = useMutation({
    mutationFn: (rotationId: string) => onCallApi.removeRotation(rotationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onCallSchedule', selectedSchedule] });
      queryClient.invalidateQueries({ queryKey: ['onCallCurrent'] });
    },
  });

  function resetForm() {
    setShowForm(false);
    setEditingId(null);
    setFormData(defaultForm);
  }

  function startEdit(schedule: OnCallSchedule) {
    setFormData({ name: schedule.name, timezone: schedule.timezone });
    setEditingId(schedule.id);
    setShowForm(true);
  }

  const scheduleList = schedules as OnCallSchedule[] | undefined;
  const currentList = currentOnCall as OnCallRotation[] | undefined;
  const detail = selectedDetail as OnCallSchedule | undefined;
  const userList = users as UserInfo[] | undefined;

  const currentOnCallUserIds = useMemo(() => new Set(currentList?.map((r) => r.userId) || []), [currentList]);

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString();
  }

  function isRotationActive(rotation: OnCallRotation) {
    const now = Date.now();
    return new Date(rotation.startTime).getTime() <= now && new Date(rotation.endTime).getTime() >= now;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations"
        title="On-Call Schedules"
        description="Manage on-call rotations and see who is currently on call."
      >
        <Button onClick={() => { resetForm(); setShowForm(true); }}>
          <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create Schedule
        </Button>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryStat label="Total Schedules" value={scheduleList?.length || 0} tone="primary" />
        <SummaryStat
          label="Currently On Call"
          value={currentList?.length || 0}
          tone="success"
        />
        <SummaryStat
          label="Total Rotations"
          value={scheduleList?.reduce((acc, s) => acc + (s._count?.rotations || 0), 0) || 0}
        />
      </div>

      {/* Currently On Call */}
      {currentList && currentList.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Currently On Call</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {currentList.map((rotation) => (
                <div
                  key={rotation.id}
                  className="flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/5 p-3"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/15 text-green-500">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{rotation.user?.name || rotation.userId}</p>
                    <p className="text-xs text-muted-foreground truncate">{rotation.schedule?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Until {formatDateTime(rotation.endTime)}
                    </p>
                  </div>
                  <Badge variant="success">Active</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Modal */}
      <Modal open={showForm} onClose={() => resetForm()}>
        <ModalPanel className="max-w-lg" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-5">
            <ModalTitle>{editingId ? 'Edit Schedule' : 'Create On-Call Schedule'}</ModalTitle>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Name <span className="text-red-400">*</span>
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Platform Team On-Call"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground block mb-1">
                  Timezone
                </label>
                <Select
                  value={formData.timezone}
                  onChange={(e) => setFormData((d) => ({ ...d, timezone: e.target.value }))}
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">America/New_York</option>
                  <option value="America/Chicago">America/Chicago</option>
                  <option value="America/Denver">America/Denver</option>
                  <option value="America/Los_Angeles">America/Los_Angeles</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Berlin">Europe/Berlin</option>
                  <option value="Asia/Tokyo">Asia/Tokyo</option>
                  <option value="Asia/Shanghai">Asia/Shanghai</option>
                  <option value="Australia/Sydney">Australia/Sydney</option>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button
                onClick={() => (editingId ? updateMutation.mutate() : createMutation.mutate())}
                disabled={!formData.name || createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving...' : editingId ? 'Update' : 'Create'}
              </Button>
            </div>
            {(createMutation.isError || updateMutation.isError) && (
              <p className="text-sm text-red-400">
                {(createMutation.error as any)?.response?.data?.error ||
                  (updateMutation.error as any)?.response?.data?.error ||
                  'An error occurred.'}
              </p>
            )}
          </div>
        </ModalPanel>
      </Modal>

      {/* Schedule List */}
      {isLoading ? (
        <LoadingState rows={4} />
      ) : !scheduleList?.length ? (
        <EmptyState
          title="No on-call schedules"
          description="Create an on-call schedule to manage rotation assignments."
          icon={
            <svg className="h-12 w-12 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Schedule List Panel */}
          <Card>
            <CardHeader>
              <CardTitle>Schedules</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/40">
                {scheduleList.map((schedule) => {
                  const hasActiveOnCall = currentList?.some((r) => r.schedule?.id === schedule.id);
                  return (
                    <div
                      key={schedule.id}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors hover:bg-accent/30 ${selectedSchedule === schedule.id ? 'bg-accent/40' : ''}`}
                      onClick={() => setSelectedSchedule(schedule.id)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{schedule.name}</p>
                          {hasActiveOnCall && <Badge variant="success">On Call</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {schedule.timezone} -- {schedule._count?.rotations || 0} rotations
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); startEdit(schedule); }}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete schedule "${schedule.name}"?`)) deleteMutation.mutate(schedule.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Rotation Detail Panel */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {detail ? `Rotations: ${detail.name}` : 'Select a Schedule'}
                </CardTitle>
                {detail && (
                  <Button variant="outline" size="sm" onClick={() => setShowRotationForm(true)}>
                    + Add Rotation
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!detail ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Select a schedule to view and manage its rotations.
                </p>
              ) : !detail.rotations?.length ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No rotations defined. Add a rotation to assign on-call personnel.
                </p>
              ) : (
                <div className="space-y-3">
                  {/* Visual Timeline */}
                  <div className="space-y-2">
                    {detail.rotations.map((rotation) => {
                      const active = isRotationActive(rotation);
                      return (
                        <div
                          key={rotation.id}
                          className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${
                            active
                              ? 'border-green-500/30 bg-green-500/5'
                              : 'border-border/70 bg-background/50'
                          }`}
                        >
                          <div className={`flex h-8 w-8 items-center justify-center rounded-full ${active ? 'bg-green-500/15 text-green-500' : 'bg-muted/30 text-muted-foreground'}`}>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{rotation.user?.name || rotation.userId}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDateTime(rotation.startTime)} - {formatDateTime(rotation.endTime)}
                            </p>
                          </div>
                          {active && <Badge variant="success">Active</Badge>}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 flex-shrink-0"
                            onClick={() => {
                              if (confirm('Remove this rotation?')) removeRotationMutation.mutate(rotation.id);
                            }}
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Add Rotation Form */}
              {showRotationForm && detail && (
                <div className="mt-4 rounded-xl border border-border/70 bg-background/50 p-4 space-y-4">
                  <h4 className="text-sm font-semibold">Add Rotation</h4>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">User</label>
                    <Select
                      value={rotationForm.userId}
                      onChange={(e) => setRotationForm((d) => ({ ...d, userId: e.target.value }))}
                    >
                      <option value="">Select user...</option>
                      {userList?.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.email})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">Start Time</label>
                      <Input
                        type="datetime-local"
                        value={rotationForm.startTime}
                        onChange={(e) => setRotationForm((d) => ({ ...d, startTime: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground block mb-1">End Time</label>
                      <Input
                        type="datetime-local"
                        value={rotationForm.endTime}
                        onChange={(e) => setRotationForm((d) => ({ ...d, endTime: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => addRotationMutation.mutate()}
                      disabled={!rotationForm.userId || !rotationForm.startTime || !rotationForm.endTime || addRotationMutation.isPending}
                    >
                      {addRotationMutation.isPending ? 'Adding...' : 'Add Rotation'}
                    </Button>
                    <Button variant="ghost" onClick={() => { setShowRotationForm(false); setRotationForm(defaultRotationForm); }}>
                      Cancel
                    </Button>
                  </div>
                  {addRotationMutation.isError && (
                    <p className="text-sm text-red-400">
                      {(addRotationMutation.error as any)?.response?.data?.error || 'An error occurred.'}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
