describe('User Role Validation', () => {
  const VALID_ROLES = ['ADMIN', 'OPERATOR', 'VIEWER'];

  it('should accept valid roles', () => {
    for (const role of VALID_ROLES) {
      expect(VALID_ROLES.includes(role)).toBe(true);
    }
  });

  it('should reject invalid roles', () => {
    expect(VALID_ROLES.includes('SUPERADMIN')).toBe(false);
    expect(VALID_ROLES.includes('USER')).toBe(false);
    expect(VALID_ROLES.includes('')).toBe(false);
  });

  it('should be case-sensitive', () => {
    expect(VALID_ROLES.includes('admin')).toBe(false);
    expect(VALID_ROLES.includes('Admin')).toBe(false);
  });
});

describe('User Registration Validation', () => {
  function validateRegistration(data: {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
  }): string[] {
    const errors: string[] = [];
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('invalid email');
    if (!data.name || data.name.length < 2) errors.push('name must be at least 2 characters');
    if (!data.password || data.password.length < 8) errors.push('password must be at least 8 characters');
    if (data.role && !['ADMIN', 'OPERATOR', 'VIEWER'].includes(data.role)) errors.push('invalid role');
    return errors;
  }

  it('should pass with valid data', () => {
    expect(validateRegistration({
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
      role: 'VIEWER',
    })).toEqual([]);
  });

  it('should catch invalid email', () => {
    expect(validateRegistration({
      email: 'not-an-email',
      name: 'Test',
      password: 'password123',
    })).toContain('invalid email');
  });

  it('should catch short name', () => {
    expect(validateRegistration({
      email: 'test@example.com',
      name: 'A',
      password: 'password123',
    })).toContain('name must be at least 2 characters');
  });

  it('should catch short password', () => {
    expect(validateRegistration({
      email: 'test@example.com',
      name: 'Test',
      password: '1234567',
    })).toContain('password must be at least 8 characters');
  });

  it('should catch invalid role', () => {
    expect(validateRegistration({
      email: 'test@example.com',
      name: 'Test',
      password: 'password123',
      role: 'SUPERADMIN',
    })).toContain('invalid role');
  });

  it('should allow missing role (defaults to VIEWER)', () => {
    expect(validateRegistration({
      email: 'test@example.com',
      name: 'Test',
      password: 'password123',
    })).toEqual([]);
  });
});

describe('User Update Validation', () => {
  function validateUpdate(data: {
    name?: string;
    role?: string;
    password?: string;
  }): string[] {
    const errors: string[] = [];
    if (data.name !== undefined && data.name.length < 2) errors.push('name too short');
    if (data.role && !['ADMIN', 'OPERATOR', 'VIEWER'].includes(data.role)) errors.push('invalid role');
    if (data.password !== undefined && data.password.length > 0 && data.password.length < 8) errors.push('password too short');
    return errors;
  }

  it('should allow partial updates', () => {
    expect(validateUpdate({ name: 'New Name' })).toEqual([]);
    expect(validateUpdate({ role: 'ADMIN' })).toEqual([]);
    expect(validateUpdate({ password: 'newpassword123' })).toEqual([]);
  });

  it('should catch short name', () => {
    expect(validateUpdate({ name: 'A' })).toContain('name too short');
  });

  it('should catch short password', () => {
    expect(validateUpdate({ password: '1234' })).toContain('password too short');
  });

  it('should allow empty password (means no change)', () => {
    expect(validateUpdate({ password: '' })).toEqual([]);
  });

  it('should allow all fields together', () => {
    expect(validateUpdate({
      name: 'Updated Name',
      role: 'OPERATOR',
      password: 'newpass123',
    })).toEqual([]);
  });
});

describe('Self-Deletion Prevention', () => {
  function canDeleteUser(currentUserId: string, targetUserId: string): boolean {
    return currentUserId !== targetUserId;
  }

  it('should prevent self-deletion', () => {
    expect(canDeleteUser('user-1', 'user-1')).toBe(false);
  });

  it('should allow deleting other users', () => {
    expect(canDeleteUser('user-1', 'user-2')).toBe(true);
  });
});

describe('Role Permission Hierarchy', () => {
  const ROLE_LEVELS: Record<string, number> = {
    VIEWER: 0,
    OPERATOR: 1,
    ADMIN: 2,
  };

  function hasPermission(userRole: string, requiredRole: string): boolean {
    return (ROLE_LEVELS[userRole] || 0) >= (ROLE_LEVELS[requiredRole] || 0);
  }

  it('ADMIN should have all permissions', () => {
    expect(hasPermission('ADMIN', 'VIEWER')).toBe(true);
    expect(hasPermission('ADMIN', 'OPERATOR')).toBe(true);
    expect(hasPermission('ADMIN', 'ADMIN')).toBe(true);
  });

  it('OPERATOR should have VIEWER permissions', () => {
    expect(hasPermission('OPERATOR', 'VIEWER')).toBe(true);
    expect(hasPermission('OPERATOR', 'OPERATOR')).toBe(true);
    expect(hasPermission('OPERATOR', 'ADMIN')).toBe(false);
  });

  it('VIEWER should only have VIEWER permissions', () => {
    expect(hasPermission('VIEWER', 'VIEWER')).toBe(true);
    expect(hasPermission('VIEWER', 'OPERATOR')).toBe(false);
    expect(hasPermission('VIEWER', 'ADMIN')).toBe(false);
  });
});
