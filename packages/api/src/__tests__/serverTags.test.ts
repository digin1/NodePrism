describe('Tag Validation', () => {
  it('should reject empty tags', () => {
    const tags = ['web', '', 'production'].filter(t => t.length > 0);
    expect(tags).toEqual(['web', 'production']);
  });

  it('should deduplicate tags', () => {
    const tags = ['web', 'production', 'web', 'db'];
    const unique = [...new Set(tags)];
    expect(unique).toEqual(['web', 'production', 'db']);
  });

  it('should handle case-insensitive dedup when normalized', () => {
    const tags = ['Web', 'web', 'PRODUCTION', 'production'];
    const normalized = [...new Set(tags.map(t => t.toLowerCase()))];
    expect(normalized).toEqual(['web', 'production']);
  });
});

describe('Tag Filtering', () => {
  const servers = [
    { id: '1', hostname: 'web-1', tags: ['web', 'production', 'us-east'] },
    { id: '2', hostname: 'web-2', tags: ['web', 'production', 'us-west'] },
    { id: '3', hostname: 'db-1', tags: ['database', 'production'] },
    { id: '4', hostname: 'dev-1', tags: ['web', 'development'] },
    { id: '5', hostname: 'bare', tags: [] },
  ];

  it('should filter by single tag', () => {
    const filtered = servers.filter(s => s.tags.includes('web'));
    expect(filtered.map(s => s.hostname)).toEqual(['web-1', 'web-2', 'dev-1']);
  });

  it('should filter by tag that matches one server', () => {
    const filtered = servers.filter(s => s.tags.includes('database'));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].hostname).toBe('db-1');
  });

  it('should return empty for non-existent tag', () => {
    const filtered = servers.filter(s => s.tags.includes('nonexistent'));
    expect(filtered).toHaveLength(0);
  });

  it('should not match servers with no tags', () => {
    const filtered = servers.filter(s => s.tags.includes('web'));
    expect(filtered.find(s => s.id === '5')).toBeUndefined();
  });
});

describe('Unique Tag Extraction', () => {
  const servers = [
    { tags: ['web', 'production'] },
    { tags: ['web', 'staging'] },
    { tags: ['database', 'production'] },
    { tags: [] },
  ];

  it('should extract all unique tags', () => {
    const tagSet = new Set<string>();
    for (const s of servers) {
      for (const t of s.tags) tagSet.add(t);
    }
    const tags = Array.from(tagSet).sort();
    expect(tags).toEqual(['database', 'production', 'staging', 'web']);
  });

  it('should return empty array when no servers have tags', () => {
    const empty = [{ tags: [] as string[] }, { tags: [] as string[] }];
    const tagSet = new Set<string>();
    for (const s of empty) {
      for (const t of s.tags) tagSet.add(t);
    }
    expect(Array.from(tagSet)).toEqual([]);
  });
});

describe('Bulk Tag Operations', () => {
  function applyBulkTags(
    servers: { id: string; tags: string[] }[],
    addTags: string[],
    removeTags: string[]
  ) {
    return servers.map(server => {
      let tags = [...server.tags];
      for (const tag of addTags) {
        if (!tags.includes(tag)) tags.push(tag);
      }
      tags = tags.filter(t => !removeTags.includes(t));
      return { ...server, tags };
    });
  }

  it('should add tags to multiple servers', () => {
    const servers = [
      { id: '1', tags: ['web'] },
      { id: '2', tags: ['database'] },
    ];
    const result = applyBulkTags(servers, ['production', 'us-east'], []);
    expect(result[0].tags).toEqual(['web', 'production', 'us-east']);
    expect(result[1].tags).toEqual(['database', 'production', 'us-east']);
  });

  it('should not duplicate existing tags', () => {
    const servers = [{ id: '1', tags: ['web', 'production'] }];
    const result = applyBulkTags(servers, ['web', 'staging'], []);
    expect(result[0].tags).toEqual(['web', 'production', 'staging']);
  });

  it('should remove tags from multiple servers', () => {
    const servers = [
      { id: '1', tags: ['web', 'production', 'deprecated'] },
      { id: '2', tags: ['database', 'deprecated'] },
    ];
    const result = applyBulkTags(servers, [], ['deprecated']);
    expect(result[0].tags).toEqual(['web', 'production']);
    expect(result[1].tags).toEqual(['database']);
  });

  it('should handle add and remove simultaneously', () => {
    const servers = [{ id: '1', tags: ['web', 'staging'] }];
    const result = applyBulkTags(servers, ['production'], ['staging']);
    expect(result[0].tags).toEqual(['web', 'production']);
  });

  it('should handle removing non-existent tags gracefully', () => {
    const servers = [{ id: '1', tags: ['web'] }];
    const result = applyBulkTags(servers, [], ['nonexistent']);
    expect(result[0].tags).toEqual(['web']);
  });

  it('should handle empty server list', () => {
    const result = applyBulkTags([], ['web'], []);
    expect(result).toEqual([]);
  });
});

describe('Tag Autocomplete', () => {
  const allTags = ['web', 'database', 'production', 'staging', 'development', 'us-east', 'us-west', 'eu-central'];

  function getTagSuggestions(input: string, currentTags: string[]): string[] {
    const q = input.trim().toLowerCase();
    if (!q) return [];
    return allTags.filter(t => t.toLowerCase().includes(q) && !currentTags.includes(t));
  }

  it('should suggest matching tags', () => {
    expect(getTagSuggestions('web', [])).toEqual(['web']);
    expect(getTagSuggestions('us', [])).toEqual(['us-east', 'us-west']);
  });

  it('should exclude already-applied tags', () => {
    expect(getTagSuggestions('web', ['web'])).toEqual([]);
    expect(getTagSuggestions('us', ['us-east'])).toEqual(['us-west']);
  });

  it('should be case-insensitive', () => {
    expect(getTagSuggestions('WEB', [])).toEqual(['web']);
    expect(getTagSuggestions('Prod', [])).toEqual(['production']);
  });

  it('should return empty for no matches', () => {
    expect(getTagSuggestions('xyz', [])).toEqual([]);
  });

  it('should match partial strings', () => {
    expect(getTagSuggestions('duct', [])).toEqual(['production']);
    expect(getTagSuggestions('base', [])).toEqual(['database']);
  });
});

describe('Tag Input Parsing', () => {
  function parseTagInput(input: string): string[] {
    return input.split(',').map(t => t.trim()).filter(Boolean);
  }

  it('should parse comma-separated tags', () => {
    expect(parseTagInput('web, production, us-east')).toEqual(['web', 'production', 'us-east']);
  });

  it('should handle single tag', () => {
    expect(parseTagInput('web')).toEqual(['web']);
  });

  it('should handle extra whitespace', () => {
    expect(parseTagInput('  web ,  production  , us-east  ')).toEqual(['web', 'production', 'us-east']);
  });

  it('should filter empty entries', () => {
    expect(parseTagInput('web,,production,,')).toEqual(['web', 'production']);
  });

  it('should handle empty input', () => {
    expect(parseTagInput('')).toEqual([]);
  });
});
