import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const TENANT_ARCHIVED_MESSAGE =
  "This site has been archived. You can sign out and ask your administrator to restore it, or choose another site.";

export const SUPER_ADMIN_WRITE_FORBIDDEN_MESSAGE =
  "You’re signed in as a platform administrator, which can only view school data. To add or change topics, students, quizzes, or uploads, sign out and sign in with a school administrator account for that site.";

export const SUPER_ADMIN_WRITE_FORBIDDEN_CODE = "SUPER_ADMIN_READ_ONLY";

export const SUPER_VIEW_CONTEXT_REQUIRED_CODE = "SUPER_VIEW_CONTEXT_REQUIRED";

export const VOLUNTEER_FORBIDDEN_MESSAGE =
  "That action needs a school administrator. Volunteers can present lessons, run quizzes, and manage the leaderboard for the selected class—ask an admin if you need topics or settings changed.";

export const VOLUNTEER_FORBIDDEN_CODE = "VOLUNTEER_FORBIDDEN";

export const SUPER_ADMIN_ROUTE_MESSAGE =
  "That area is only for platform super administrators. Sign out and use “Platform (super admin)” on the login page, or go back to the main app.";

export const SUPER_ADMIN_ROUTE_CODE = "SUPER_ADMIN_ONLY";

export const UNAUTHORIZED_MESSAGE = "Please sign in again to continue.";
export const UNAUTHORIZED_CODE = "UNAUTHORIZED";

export const CONTEXT_REQUIRED_MESSAGE =
  "Choose a class and subject first. Open Class & subject in the menu, then try again.";

export const SUPER_VIEW_CONTEXT_MESSAGE =
  "Choose a school site, class, and subject first. Open Class & subject in the menu (platform view is read-only).";

export type ScopedUser = {
  id: string;
  name: string;
  role: string;
  tenantId: string;
  tenantSlug: string;
  classId?: string | null;
  subjectId?: string | null;
  /** SUPER_ADMIN only: which school tenant to browse (read). */
  superViewTenantId?: string | null;
  superViewTenantSlug?: string | null;
};

export type ScopedSession = Omit<Session, "user"> & { user: ScopedUser };

export async function requireAuth(): Promise<
  { ok: true; session: ScopedSession } | { ok: false; res: NextResponse }
> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.tenantId) {
    return {
      ok: false,
      res: NextResponse.json({ error: UNAUTHORIZED_MESSAGE, code: UNAUTHORIZED_CODE }, { status: 401 }),
    };
  }

  const tenant = await prisma.tenant.findFirst({
    where: { id: u.tenantId, deletedAt: null },
    select: { id: true },
  });
  if (!tenant) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: TENANT_ARCHIVED_MESSAGE, code: "TENANT_ARCHIVED" },
        { status: 403 }
      ),
    };
  }

  return { ok: true, session: session as ScopedSession };
}

/** Authenticated users including SUPER_ADMIN (for school data routes). */
export async function requireAuthForSchool(): Promise<
  { ok: true; session: ScopedSession } | { ok: false; res: NextResponse }
> {
  return requireAuth();
}

/** Block SUPER_ADMIN on mutating school/classroom APIs (read-only browse). */
export function forbidSuperAdminSchoolWrite(session: ScopedSession): NextResponse | null {
  if (session.user.role === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: SUPER_ADMIN_WRITE_FORBIDDEN_MESSAGE, code: SUPER_ADMIN_WRITE_FORBIDDEN_CODE },
      { status: 403 }
    );
  }
  return null;
}

export function requireAdmin(session: ScopedSession): NextResponse | null {
  if (session.user.role === "SUPER_ADMIN") {
    return NextResponse.json(
      { error: SUPER_ADMIN_WRITE_FORBIDDEN_MESSAGE, code: SUPER_ADMIN_WRITE_FORBIDDEN_CODE },
      { status: 403 }
    );
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: VOLUNTEER_FORBIDDEN_MESSAGE, code: VOLUNTEER_FORBIDDEN_CODE },
      { status: 403 }
    );
  }
  return null;
}

export function requireSuperAdmin(session: ScopedSession): NextResponse | null {
  if (session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json(
      { error: SUPER_ADMIN_ROUTE_MESSAGE, code: SUPER_ADMIN_ROUTE_CODE },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Tenant id for /api/me/classes and /api/me/subjects.
 * SUPER_ADMIN must set superViewTenantId (Class & subject page).
 */
export function schoolCatalogTenantId(session: ScopedSession): string | null {
  if (session.user.role === "SUPER_ADMIN") {
    const t = session.user.superViewTenantId;
    return typeof t === "string" && t.length > 0 ? t : null;
  }
  return session.user.tenantId;
}

export function requireTeachingContext(session: ScopedSession):
  | { ok: true; tenantId: string; classId: string; subjectId: string }
  | { ok: false; res: NextResponse } {
  if (session.user.role === "SUPER_ADMIN") {
    const tid = session.user.superViewTenantId;
    const { classId, subjectId } = session.user;
    if (!tid || typeof tid !== "string" || !classId || !subjectId) {
      return {
        ok: false,
        res: NextResponse.json(
          { error: SUPER_VIEW_CONTEXT_MESSAGE, code: SUPER_VIEW_CONTEXT_REQUIRED_CODE },
          { status: 400 }
        ),
      };
    }
    return { ok: true, tenantId: tid, classId, subjectId };
  }
  const { tenantId, classId, subjectId } = session.user;
  if (!classId || !subjectId) {
    return {
      ok: false,
      res: NextResponse.json(
        { error: CONTEXT_REQUIRED_MESSAGE, code: "CONTEXT_REQUIRED" },
        { status: 400 }
      ),
    };
  }
  return { ok: true, tenantId, classId, subjectId };
}

export async function getTopicInTenant(tenantId: string, topicId: string) {
  return prisma.topic.findFirst({
    where: {
      id: topicId,
      tenantId,
      subject: { deletedAt: null },
    },
  });
}

/** Topic by id for read: SUPER_ADMIN may load any non-platform school topic. */
export async function getTopicForSchoolRead(session: ScopedSession, topicId: string) {
  if (session.user.role === "SUPER_ADMIN") {
    return prisma.topic.findFirst({
      where: {
        id: topicId,
        tenant: { isPlatform: false, deletedAt: null },
        subject: { deletedAt: null },
      },
    });
  }
  return getTopicInTenant(session.user.tenantId, topicId);
}

/**
 * Authorization helper for read endpoints: a topic is visible in `classId`
 * iff its subject is linked to that class via SubjectClass.
 */
export async function topicVisibleInClass(topicId: string, classId: string) {
  const row = await prisma.topic.findFirst({
    where: {
      id: topicId,
      subject: {
        deletedAt: null,
        classLinks: {
          some: { classId, schoolClass: { deletedAt: null } },
        },
      },
    },
    select: { id: true },
  });
  return Boolean(row);
}

export async function verifyClassInTenant(tenantId: string, classId: string) {
  const row = await prisma.schoolClass.findFirst({
    where: { id: classId, tenantId, deletedAt: null },
  });
  return row;
}

export async function verifySubjectInTenant(tenantId: string, subjectId: string) {
  const row = await prisma.subject.findFirst({
    where: { id: subjectId, tenantId, deletedAt: null },
  });
  return row;
}

/**
 * Common Pool gate: returns true only if the subject has been linked to the
 * class via SubjectClass for this tenant. Topic creation and the per-class
 * subject picker depend on this check.
 */
export async function verifySubjectLinkedToClass(
  tenantId: string,
  subjectId: string,
  classId: string
) {
  const row = await prisma.subjectClass.findFirst({
    where: {
      tenantId,
      subjectId,
      classId,
      subject: { deletedAt: null },
      schoolClass: { deletedAt: null },
    },
    select: { id: true },
  });
  return Boolean(row);
}
