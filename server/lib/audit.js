import { AuditLog } from '../models/index.js';
import { clientIp, userAgent } from './http.js';

// Record a privileged / security-relevant action. Never throws.
export async function audit(req, action, { targetType, targetId, targetRef, details, actor } = {}) {
  const o = actor || req?.official;
  try {
    await AuditLog.create({
      actorType: o ? 'official' : req?.citizen ? 'citizen' : 'system',
      actorId: o?._id || req?.citizen?._id,
      actorName: o?.name || (req?.citizen ? `Citizen ${req.citizen.phone?.slice(-4) ? '••' + req.citizen.phone.slice(-4) : ''}` : 'System'),
      actorRole: o?.role || (req?.citizen ? 'citizen' : 'system'),
      action,
      targetType,
      targetId: targetId ? String(targetId) : undefined,
      targetRef,
      details,
      ip: req ? clientIp(req) : undefined,
      ua: req ? userAgent(req) : undefined,
    });
  } catch (err) {
    console.error('  ! audit log write failed:', err.message);
  }
}
