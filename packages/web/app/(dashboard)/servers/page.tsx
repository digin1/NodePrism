'use client';

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { serverApi, serverGroupApi, maintenanceApi, ServerGroup, MaintenanceWindow } from '@/lib/api';
import { ServerTypeBadge, isServerTypeTag } from '@/components/icons/ServerTypeIcons';

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
  tags?: string[];
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
  const [tagFilter, setTagFilter] = useState('');
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

  // Bulk tag state
  const [selectedServers, setSelectedServers] = useState<Set<string>>(new Set());
  const [showBulkTagModal, setShowBulkTagModal] = useState(false);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove'>('add');
  const [bulkTagSuggestions, setBulkTagSuggestions] = useState<string[]>([]);
  const bulkTagInputRef = useRef<HTMLInputElement>(null);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [bulkMoveGroupId, setBulkMoveGroupId] = useState<string | null>(null);

  const { data: servers, isLoading } = useQuery({
    queryKey: ['servers', { search, status: statusFilter, environment: envFilter, tag: tagFilter }],
    queryFn: () => serverApi.list({
      search: search || undefined,
      status: statusFilter || undefined,
      environment: envFilter || undefined,
      tag: tagFilter || undefined,
    }),
  });

  const { data: allTags } = useQuery({
    queryKey: ['serverTags'],
    queryFn: () => serverApi.tags(),
  });

  const { data: groups } = useQuery({
    queryKey: ['serverGroups'],
    queryFn: () => serverGroupApi.list(),
  });

  const { data: activeMaintenanceWindows } = useQuery({
    queryKey: ['activeMaintenanceWindows'],
    queryFn: () => maintenanceApi.list({ active: 'true' }),
    refetchInterval: 60000,
  });

  const maintenanceServerIds = new Set(
    (activeMaintenanceWindows as MaintenanceWindow[] | undefined)?.map(w => w.serverId) || []
  );

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

  const updateServerMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      serverApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['serverTags'] });
    },
  });

  const bulkTagMutation = useMutation({
    mutationFn: (data: { serverIds: string[]; addTags?: string[]; removeTags?: string[] }) =>
      serverApi.bulkTags(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['serverTags'] });
      setShowBulkTagModal(false);
      setSelectedServers(new Set());
      setBulkTagInput('');
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (serverIds: string[]) => serverApi.bulkDelete(serverIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['serverGroups'] });
      queryClient.invalidateQueries({ queryKey: ['serverTags'] });
      setSelectedServers(new Set());
    },
  });

  const bulkMoveMutation = useMutation({
    mutationFn: ({ serverIds, groupId }: { serverIds: string[]; groupId: string | null }) =>
      serverGroupApi.moveServers(serverIds, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['serverGroups'] });
      setSelectedServers(new Set());
      setShowBulkMoveModal(false);
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

  const toggleServerSelection = (serverId: string) => {
    setSelectedServers(prev => {
      const next = new Set(prev);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!serverList) return;
    if (selectedServers.size === serverList.length) {
      setSelectedServers(new Set());
    } else {
      setSelectedServers(new Set(serverList.map(s => s.id)));
    }
  };

  const removeTagFromServer = (serverId: string, tag: string) => {
    const server = serverList?.find(s => s.id === serverId);
    if (!server) return;
    const newTags = (server.tags || []).filter(t => t !== tag);
    updateServerMutation.mutate({ id: serverId, data: { tags: newTags } });
  };

  const handleBulkTagSubmit = () => {
    const tags = bulkTagInput.split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length === 0 || selectedServers.size === 0) return;
    bulkTagMutation.mutate({
      serverIds: Array.from(selectedServers),
      addTags: bulkTagMode === 'add' ? tags : undefined,
      removeTags: bulkTagMode === 'remove' ? tags : undefined,
    });
  };

  const handleBulkTagInputChange = (value: string) => {
    setBulkTagInput(value);
    const lastTag = value.split(',').pop()?.trim().toLowerCase() || '';
    if (lastTag && allTags) {
      setBulkTagSuggestions(allTags.filter(t => t.toLowerCase().includes(lastTag) && !value.split(',').map(v => v.trim()).includes(t)));
    } else {
      setBulkTagSuggestions([]);
    }
  };

  const applySuggestion = (tag: string) => {
    const parts = bulkTagInput.split(',');
    parts[parts.length - 1] = tag;
    setBulkTagInput(parts.join(', ') + ', ');
    setBulkTagSuggestions([]);
    bulkTagInputRef.current?.focus();
  };

  // Get servers for a specific group
  const getServersInGroup = (groupId: string) =>
    serverList?.filter(s => s.groupId === groupId || s.group?.id === groupId) || [];

  // Get ungrouped servers
  const ungroupedServers = serverList?.filter(s => !s.groupId && !s.group) || [];

  const renderServerRow = (server: Server) => (
    <TableRow key={server.id}>
      <TableCell className="w-8">
        <input
          type="checkbox"
          checked={selectedServers.has(server.id)}
          onChange={() => toggleServerSelection(server.id)}
          className="rounded border-gray-300"
        />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Link href={`/servers/${server.id}`} className="font-medium hover:underline">
            {server.hostname}
          </Link>
          {server.tags?.filter(isServerTypeTag).map(tag => (
            <ServerTypeBadge key={tag} type={tag} />
          ))}
        </div>
      </TableCell>
      <TableCell className="font-mono text-sm">{server.ipAddress}</TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Badge variant={statusColors[server.status] || 'secondary'}>
            {server.status}
          </Badge>
          {maintenanceServerIds.has(server.id) && (
            <Badge variant="warning" className="text-xs">Maint</Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{server.environment}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          {server.tags?.filter(t => !isServerTypeTag(t)).map(tag => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400"
            >
              {tag}
              <button
                onClick={(e) => { e.stopPropagation(); removeTagFromServer(server.id, tag); }}
                className="ml-0.5 hover:text-blue-900"
              >
                x
              </button>
            </span>
          ))}
          {(!server.tags || server.tags.filter(t => !isServerTypeTag(t)).length === 0) && (
            <span className="text-muted-foreground text-xs">-</span>
          )}
        </div>
      </TableCell>
      <TableCell>{server.agents?.length || 0}</TableCell>
      <TableCell>
        {server._count?.alerts && server._count.alerts > 0 ? (
          <Badge variant="danger">{server._count.alerts}</Badge>
        ) : (
          <span className="text-muted-foreground">0</span>
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
            className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10"
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
          className={`flex items-center gap-2 px-4 py-3 hover:bg-muted/50 border-b cursor-pointer`}
          style={{ paddingLeft: `${16 + depth * 24}px` }}
        >
          <button
            onClick={() => toggleGroup(group.id)}
            className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground"
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
          <span className="font-medium flex-1" onClick={() => toggleGroup(group.id)}>
            {group.name}
          </span>
          <span className="text-sm text-muted-foreground mr-2">
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
              className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-500/10"
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
          <h2 className="text-2xl font-bold">Servers</h2>
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
            <div className="w-full sm:w-40 sm:shrink-0">
              <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Status</option>
                <option value="ONLINE">Online</option>
                <option value="OFFLINE">Offline</option>
                <option value="WARNING">Warning</option>
                <option value="CRITICAL">Critical</option>
              </Select>
            </div>
            <div className="w-full sm:w-40 sm:shrink-0">
              <Select value={envFilter} onChange={(e) => setEnvFilter(e.target.value)}>
                <option value="">All Environments</option>
                <option value="PRODUCTION">Production</option>
                <option value="STAGING">Staging</option>
                <option value="DEVELOPMENT">Development</option>
              </Select>
            </div>
            <div className="w-full sm:w-40 sm:shrink-0">
              <Select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                <option value="">All Tags</option>
                {allTags?.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </Select>
            </div>
            <div className="flex gap-1 border rounded-lg p-1 sm:shrink-0">
              <button
                className={`px-3 py-1 rounded text-sm transition-colors ${viewMode === 'groups' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                onClick={() => setViewMode('groups')}
              >
                Groups
              </button>
              <button
                className={`px-3 py-1 rounded text-sm transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedServers.size > 0 && (
        <div className="flex items-center gap-4 p-3 bg-blue-500/10 dark:bg-blue-500/20 border border-blue-500/20 rounded-lg">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-400">
            {selectedServers.size} server{selectedServers.size !== 1 ? 's' : ''} selected
          </span>
          <Button size="sm" variant="outline" onClick={() => setShowBulkTagModal(true)}>
            Manage Tags
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setBulkMoveGroupId(null); setShowBulkMoveModal(true); }}>
            Move to Group
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 dark:text-red-400 border-red-500/20 hover:bg-red-500/10"
            onClick={() => {
              if (confirm(`Delete ${selectedServers.size} server${selectedServers.size !== 1 ? 's' : ''}? This cannot be undone.`)) {
                bulkDeleteMutation.mutate(Array.from(selectedServers));
              }
            }}
          >
            Delete Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedServers(new Set())}>
            Clear Selection
          </Button>
        </div>
      )}

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
              <h3 className="mt-2 text-sm font-medium">No servers</h3>
              <p className="mt-1 text-sm text-muted-foreground">Get started by adding a new server.</p>
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
                  <TableHead className="w-8">
                    <input
                      type="checkbox"
                      checked={serverList.length > 0 && selectedServers.size === serverList.length}
                      onChange={toggleSelectAll}
                      className="rounded border-gray-300"
                    />
                  </TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Tags</TableHead>
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
                  <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b">
                    <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
                    </svg>
                    <span className="font-medium text-muted-foreground">Ungrouped</span>
                    <span className="text-sm text-muted-foreground">{ungroupedServers.length} server{ungroupedServers.length !== 1 ? 's' : ''}</span>
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
                  <p>No groups created yet. Click &quot;New Group&quot; to organize your servers.</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={resetGroupModal}>
          <div className="bg-card rounded-lg shadow-xl border p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">
              {editingGroup ? 'Edit Group' : 'Create Group'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Name</label>
                <Input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g., Production US-East"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Description</label>
                <Input
                  value={groupDescription}
                  onChange={(e) => setGroupDescription(e.target.value)}
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Parent Group</label>
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
          <div className="bg-card rounded-lg shadow-xl border p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Move Server</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Move <strong>{movingServer.hostname}</strong> to a group
            </p>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Target Group</label>
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

      {/* Bulk Tag Modal */}
      {showBulkTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBulkTagModal(false)}>
          <div className="bg-card rounded-lg shadow-xl border p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Bulk Tag Operations</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {selectedServers.size} server{selectedServers.size !== 1 ? 's' : ''} selected
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted-foreground mb-1">Operation</label>
                <div className="flex gap-2">
                  <button
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${bulkTagMode === 'add' ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400' : 'border-border text-muted-foreground'}`}
                    onClick={() => setBulkTagMode('add')}
                  >
                    Add Tags
                  </button>
                  <button
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${bulkTagMode === 'remove' ? 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400' : 'border-border text-muted-foreground'}`}
                    onClick={() => setBulkTagMode('remove')}
                  >
                    Remove Tags
                  </button>
                </div>
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-muted-foreground mb-1">
                  Tags (comma-separated)
                </label>
                <Input
                  ref={bulkTagInputRef}
                  value={bulkTagInput}
                  onChange={(e) => handleBulkTagInputChange(e.target.value)}
                  placeholder="e.g., web, production, us-east"
                  autoFocus
                />
                {bulkTagSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-card border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {bulkTagSuggestions.slice(0, 8).map(tag => (
                      <button
                        key={tag}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => applySuggestion(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowBulkTagModal(false)}>Cancel</Button>
              <Button
                onClick={handleBulkTagSubmit}
                disabled={!bulkTagInput.trim() || bulkTagMutation.isPending}
              >
                {bulkTagMutation.isPending ? 'Applying...' : `${bulkTagMode === 'add' ? 'Add' : 'Remove'} Tags`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Move Modal */}
      {showBulkMoveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowBulkMoveModal(false)}>
          <div className="bg-card rounded-lg shadow-xl border p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">Move Servers to Group</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {selectedServers.size} server{selectedServers.size !== 1 ? 's' : ''} selected
            </p>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1">Target Group</label>
              <Select
                value={bulkMoveGroupId || ''}
                onChange={(e) => setBulkMoveGroupId(e.target.value || null)}
              >
                <option value="">Ungrouped</option>
                {flatGroups?.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Select>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setShowBulkMoveModal(false)}>Cancel</Button>
              <Button
                onClick={() => bulkMoveMutation.mutate({ serverIds: Array.from(selectedServers), groupId: bulkMoveGroupId })}
                disabled={bulkMoveMutation.isPending}
              >
                {bulkMoveMutation.isPending ? 'Moving...' : 'Move'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
