import { z } from 'zod';

// Validation schemas (mirroring routes/serverGroups.ts)
const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

const moveServersSchema = z.object({
  serverIds: z.array(z.string().uuid()).min(1),
  groupId: z.string().uuid().nullable(),
});

describe('Server Group Validation', () => {
  describe('createGroupSchema', () => {
    it('should accept valid group', () => {
      const result = createGroupSchema.safeParse({
        name: 'Production Servers',
        description: 'All production infrastructure',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sortOrder).toBe(0);
      }
    });

    it('should accept group with parent', () => {
      const result = createGroupSchema.safeParse({
        name: 'Web Servers',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
        sortOrder: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const result = createGroupSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('should reject name over 100 chars', () => {
      const result = createGroupSchema.safeParse({ name: 'x'.repeat(101) });
      expect(result.success).toBe(false);
    });

    it('should reject non-UUID parentId', () => {
      const result = createGroupSchema.safeParse({
        name: 'Test',
        parentId: 'not-uuid',
      });
      expect(result.success).toBe(false);
    });

    it('should accept null parentId (root group)', () => {
      const result = createGroupSchema.safeParse({
        name: 'Root Group',
        parentId: null,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative sortOrder', () => {
      const result = createGroupSchema.safeParse({
        name: 'Test',
        sortOrder: -1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('moveServersSchema', () => {
    it('should accept valid move request', () => {
      const result = moveServersSchema.safeParse({
        serverIds: ['550e8400-e29b-41d4-a716-446655440000'],
        groupId: '660e8400-e29b-41d4-a716-446655440000',
      });
      expect(result.success).toBe(true);
    });

    it('should accept null groupId (move to ungrouped)', () => {
      const result = moveServersSchema.safeParse({
        serverIds: ['550e8400-e29b-41d4-a716-446655440000'],
        groupId: null,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty serverIds array', () => {
      const result = moveServersSchema.safeParse({
        serverIds: [],
        groupId: null,
      });
      expect(result.success).toBe(false);
    });

    it('should accept multiple server IDs', () => {
      const result = moveServersSchema.safeParse({
        serverIds: [
          '550e8400-e29b-41d4-a716-446655440000',
          '660e8400-e29b-41d4-a716-446655440001',
          '770e8400-e29b-41d4-a716-446655440002',
        ],
        groupId: '880e8400-e29b-41d4-a716-446655440003',
      });
      expect(result.success).toBe(true);
    });
  });
});

describe('Circular Reference Detection', () => {
  // Mirrors the circular reference check in serverGroups.ts update handler
  interface Group {
    id: string;
    parentId: string | null;
  }

  function wouldCreateCycle(groupId: string, newParentId: string | null, allGroups: Group[]): boolean {
    if (!newParentId) return false;
    if (newParentId === groupId) return true;

    let currentId: string | null = newParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) return true; // already a cycle in data
      if (currentId === groupId) return true;
      visited.add(currentId);

      const parent = allGroups.find(g => g.id === currentId);
      currentId = parent?.parentId ?? null;
    }

    return false;
  }

  it('should detect direct self-reference', () => {
    const groups: Group[] = [{ id: 'A', parentId: null }];
    expect(wouldCreateCycle('A', 'A', groups)).toBe(true);
  });

  it('should detect indirect cycle', () => {
    // A -> B -> C, trying to set C.parent = A (would create C -> A -> B -> C)
    // Actually: trying to set A.parent = C (would create A -> C -> ... -> A if C is child of A)
    const groups: Group[] = [
      { id: 'A', parentId: null },
      { id: 'B', parentId: 'A' },
      { id: 'C', parentId: 'B' },
    ];
    // Setting A's parent to C: C's ancestor chain goes C -> B -> A, which hits A
    expect(wouldCreateCycle('A', 'C', groups)).toBe(true);
  });

  it('should allow valid parent assignment', () => {
    const groups: Group[] = [
      { id: 'A', parentId: null },
      { id: 'B', parentId: null },
      { id: 'C', parentId: 'B' },
    ];
    // Setting A's parent to C is fine (no cycle)
    expect(wouldCreateCycle('A', 'C', groups)).toBe(false);
  });

  it('should allow setting parent to null', () => {
    const groups: Group[] = [
      { id: 'A', parentId: 'B' },
      { id: 'B', parentId: null },
    ];
    expect(wouldCreateCycle('A', null, groups)).toBe(false);
  });
});

describe('Tree Building', () => {
  interface GroupNode {
    id: string;
    name: string;
    parentId: string | null;
    children: GroupNode[];
  }

  function buildTree(groups: Omit<GroupNode, 'children'>[]): GroupNode[] {
    const map = new Map<string, GroupNode>();
    const roots: GroupNode[] = [];

    for (const g of groups) {
      map.set(g.id, { ...g, children: [] });
    }

    for (const node of map.values()) {
      if (node.parentId && map.has(node.parentId)) {
        map.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  }

  it('should build flat list as all roots', () => {
    const tree = buildTree([
      { id: '1', name: 'A', parentId: null },
      { id: '2', name: 'B', parentId: null },
    ]);
    expect(tree.length).toBe(2);
    expect(tree[0].children.length).toBe(0);
  });

  it('should nest children correctly', () => {
    const tree = buildTree([
      { id: '1', name: 'Parent', parentId: null },
      { id: '2', name: 'Child', parentId: '1' },
      { id: '3', name: 'Grandchild', parentId: '2' },
    ]);
    expect(tree.length).toBe(1);
    expect(tree[0].children.length).toBe(1);
    expect(tree[0].children[0].children.length).toBe(1);
    expect(tree[0].children[0].children[0].name).toBe('Grandchild');
  });

  it('should handle orphaned nodes as roots', () => {
    const tree = buildTree([
      { id: '1', name: 'Child', parentId: 'nonexistent' },
    ]);
    expect(tree.length).toBe(1);
  });

  it('should handle empty input', () => {
    const tree = buildTree([]);
    expect(tree.length).toBe(0);
  });
});
