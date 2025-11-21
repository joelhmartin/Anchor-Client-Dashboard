export function requireRole(roles = []) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Login required' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: 'Insufficient permissions' });
    next();
  };
}

export const isAdmin = requireRole(['admin']);
export const isAdminOrEditor = requireRole(['admin', 'editor']);
