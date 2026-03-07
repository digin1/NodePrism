'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { serverApi, serverGroupApi, ServerGroup } from '@/lib/api';

const statusColors: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  ONLINE: 'success',
  WARNING: 'warning',
  CRITICAL: 'danger',
  OFFLINE: 'secondary',
};

interface Server {
  id: string;
  hostname: string;
  ipAddress: string;
  status: string;
  environment: string;
  groupId?: string | null;
  group?: { id: string; name: string } | null;
  agents?: Array<{ id: string }>;
  _count?: { alerts: number };
}

export default function ServersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [envFilter, setEnvFilter] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'groups'>('groups');

  // Group management state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ServerGroup | null>(null);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [groupParentId, setGroupParentId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Move server state
  const [movingServer, setMovingServer] = useState<Server | null>(null);
  const [moveTargetGroupId, setMoveTargetGroupId] = useState<string | null>(null);

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers', { search, status: statusFilter, environment: envFilter }],
    queryFn: () => serverApi.list({ search: search || undefined, status: statusFilter || undefined, environment: envFilter || undefined }),
  });

  const { data: groups } = useQuery({
    queryKey: ['serverGroups'],
    queryFn: () => serverGroupApi.list(),
  });

  const { data: flatGroups } = useQuery({
    queryKey: ['serverGroups', 'flat'],
    queryFn: () => serverGroupApi.list(true),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serverApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['servers'] }),
  });

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; description?: string; parentId?: string | null }) =>
      serverGroupApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serverGroups'] });
      resetGroupModal();
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ name: string; description: string; parentId: string | null }> }) =>
      serverGroupApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serverGroups'] });
      resetGroupModal();
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: string) => serverGroupApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serverGroups'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const moveServerMutation = useMutation({
    mutationFn: ({ serverIds, groupId }: { serverIds: string[]; groupId: string | null }) =>
      serverGroupApi.moveServers(serverIds, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['serverGroups'] });
      setMovingServer(null);
    },
  });

  const serverList = servers as Server[] | undefined;

  const resetGroupModal = () => {
    setShowGroupModal(false);
    setEditingGroup(null);
    setGroupName('');
    setGroupDescription('');
    setGroupParentId(null);
  };

  const openCreateGroup = (parentId?: string | null) => {
    setEditingGroup(null);
    setGroupName('');
    setGroupDescription('');
    setGroupParentId(parentId ?? null);
    setShowGroupModal(true);
  };

  const openEditGroup = (group: ServerGroup) => {
    setEditingGroup(group);
    setGroupName(group.name);
    setGroupDescription(group.description || '');
    setGroupParentId(group.parentId ?? null);
    setShowGroupModal(true);
  };

  const handleSaveGroup = () => {
    if (!groupName.trim()) return;
    if (editingGroup) {
      updateGroupMutation.mutate({
        id: editingGroup.id,
        data: { name: groupName, description: groupDescription || undefined, parentId: groupParentId },
      });
    } else {
      createGroupMutation.mutate({
        name: groupName,
        description: groupDescription || undefined,
        parentId: groupParentId,
      });
    }
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  // Get servers for a specific group
  const getServersInGroup = (groupId: string) =>
    serverList?.filter(s => s.groupId === groupId || s.group?.id === groupId) || [];

  // Get ungrouped servers
  const ungroupedServers = serverList?.filter(s => !s.groupId && !s.group) || [];

  const renderServerRow = (server: Server) => (
    <TableRow key={server.id}>
      <TableCell>
        <Link href={`/servers/${server.id}`} className="font-medium hover:underline">
          {server.hostname}
        </Link>
      </TableCell>
      <TableCell className="font-mono text-sm">{server.ipAddress}</TableCell>
      <TableCell>
        <Badge variant={statusColors[server.status] || 'secondary'}>
          {server.status}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{server.environment}</Badge>
      </TableCell>
      <TableCell>{server.agents?.length || 0}</TableCell>
      <TableCell>
        {server._count?.alerts && server._count.alerts > 0 ? (
          <Badge variant="danger">{server._count.alerts}</Badge>
        ) : (
          <span className="text-gray-400">0</span>
        )}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Link href={`/servers/${server.id}`}>
            <Button size="sm" variant="ghost">View</Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setMovingServer(server);
              setMoveTargetGroupId(server.groupId || null);
            }}
          >
            Move
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={() => {
              if (confirm('Are you sure you want to delete this server?')) {
                deleteMutation.mutate(server.id);
              }
            }}
          >
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );

  const renderGroupNode = (group: ServerGroup, depth: number = 0) => {
    const isExpanded = expandedGroups.has(group.id);
    const groupServers = getServersInGroup(group.id);
    const serverCount = group._count?.servers || groupServers.length;
    const hasChildren = (group.children && group.children.length > 0) || serverCount > 0;

    return (
      <div key={group.id}>
        {/* Group Header */}
        <div
          className={`flex items-center gap-2 px-4 py-3 hover:bg-gray-50 border-b cursor-pointer`}
          style={{ paddingLeft: `${16 + depth * 24}px` }}
        >
          <button
            onClick={() => toggleGroup(group.id)}
            className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            {hasChildren ? (
              <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            ) : (
              <span className="w-4" />
            )}
          </button>
          <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
          <span className="font-medium text-gray-900 flex-1" onClick={() => toggleGroup(group.id)}>
            {group.name}
          </span>
          <span className="text-sm text-gray-500 mr-2">
            {serverCount} server{serverCount !== 1 ? 's' : ''}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openCreateGroup(group.id); }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </Button>
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEditGroup(group); }}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`Delete group "${group.name}"? Servers will become ungrouped.`)) {
                  deleteGroupMutation.mutate(group.id);
                }
              }}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </Button>
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div>
            {/* Child Groups */}
            {group.children?.map(child => renderGroupNode(child, depth + 1))}

            {/* Servers in group */}
            {groupServers.length > 0 && (
              <div style={{ paddingLeft: `${depth * 24}px` }}>
                <Table>
                  <TableBody>
                    {groupServers.map(renderServerRow)}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Servers</h2>
          <p className="text-muted-foreground">Manage your monitored servers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openCreateGroup()}>
            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            New Group
          </Button>
          <Link href="/servers/new">
            <Button>
              <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Server
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-0">
              <Input
                placeholder="Search by hostname or IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="w-full sm:w-48 sm:shrink-0">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Status</option>
                <option value="ONLINE">Online</option>
                <option value="OFFLINE">Offline</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </div>
            <div className="w-full sm:w-48 sm:shrink-0">
              <Select value={envFilter} onChange={(e) => setEnvFilter(e.target.value)}>
                <option value="">All Environments</option>
                <option value="PRODUCTION">Production</option>
                <option value="STAGING">Staging</option>
                <option value="DEVELOPMENT">Development</option>
              </Select>
            </div>
            <div className="flex gap-1 border rounded-lg p-1 sm:shrink-0">
              <button
                className={`px-3 py-1 rounded text-sm ${viewMode === 'groups' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setViewMode('groups')}
              >
                Groups
              </button>
              <button
                className={`px-3 py-1 rounded text-sm ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Server List / Group View */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {isLoading ? 'Loading...' : `${serverList?.length || 0} Servers`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !serverList?.length ? (
            <div className="text-center py-12">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No servers</h3>
              <p className="mt-1 text-sm text-gray-500">Get started by adding a new server.</p>
              <div className="mt-6">
                <Link href="/servers/new">
                  <Button>Add Server</Button>
                </Link>
              </div>
            </div>
          ) : viewMode === 'list' ? (
            /* Flat List View */
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hostname</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Agents</TableHead>
                  <TableHead>Alerts</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {serverList?.map(renderServerRow)}
              </TableBody>
            </Table>
          ) : (
            /* Group Tree View */
            <div>
              {/* Render groups */}
              {groups?.map(group => renderGroupNode(group))}

              {/* Ungrouped servers */}
              {ungroupedServers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b">
                    <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                    </svg>
                    <span className="font-medium text-gray-500">Ungrouped</span>
                    <span className="text-sm text-gray-400">{ungroupedServers.length} server{ungroupedServers.length !== 1 ? 's' : ''}</span>
                  </div>
                  <Table>
                    <TableBody>
                      {ungroupedServers.map(renderServerRow)}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* No groups message */}
              {(!groups || groups.length === 0) && ungroupedServers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <p>No groups created yet. Click "New Group" to organize your servers.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={resetGroupModal}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">
              {editingGroup ? 'Edit Group' : 'Create Group'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., Production US-East"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Input
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Group</label>
                <Select
                  value={groupParentId || ''}
                  onChange={(e) => setGroupParentId(e.target.value || null)}
                >
                  <option value="">None (top level)</option>
                  {flatGroups
                    ?.filter(g => g.id !== editingGroup?.id)
                    .map(g => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={resetGroupModal}>Cancel</Button>
              <Button onClick={handleSaveGroup} disabled={!groupName.trim()}>
                {editingGroup ? 'Save' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Move Server Modal */}
      {movingServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMovingServer(null)}>
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Move Server</h3>
            <p className="text-sm text-gray-500 mb-4">
              Move <strong>{movingServer.hostname}</strong> to a group
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Target Group</label>
              <Select
                value={moveTargetGroupId || ''}
                onChange={(e) => setMoveTargetGroupId(e.target.value || null)}
              >
                <option value="">Ungrouped</option>
                {flatGroups?.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setMovingServer(null)}>Cancel</Button>
              <Button
                onClick={() => {
                  moveServerMutation.mutate({
                    serverIds: [movingServer.id],
                    groupId: moveTargetGroupId,
                  });
                }}
              >
                Move
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
