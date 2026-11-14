import { z } from "zod";
import type { Database } from "./db";
import type { User } from "./auth";
import { readJson, rateLimit } from "./http";
import { AppError, notFound } from "./errors";
import {
  employeeSchema,
  workspaceBusinessSchema,
  ownerProfileSchema,
  onboardingSchema,
  documentSchema,
} from "@/domain/workspace";
import { dateSchema } from "@/domain/contracts";
import { readContractUpload } from "@/integrations/contract-reader";
import * as service from "./workspace";
import {
  dispatchWorkspaceNotifications,
  notificationInbox,
  reassessWorkspaces,
} from "./workspace-notifications";

const uuid = (v: string) => z.uuid().parse(v);
export async function workspaceApi(req: Request, db: Database, user: User, path: string[]) {
  const key = `${req.method} ${path.join("/")}`;
  if (key === "GET profile") return service.getProfile(db, user.id);
  if (key === "PUT profile")
    return service.putProfile(db, user.id, await readJson(req, ownerProfileSchema));
  if (key === "PUT onboarding")
    return service.saveOnboarding(db, user.id, await readJson(req, onboardingSchema));
  if (key === "GET businesses")
    return {
      businesses: await db.query(
        "SELECT id,facts,revision FROM businesses WHERE owner_id=$1 ORDER BY created_at",
        [user.id],
      ),
    };
  if (key === "POST businesses")
    return service.createBusiness(db, user.id, await readJson(req, workspaceBusinessSchema));
  if (path[0] === "businesses" && path[1]) {
    const id = uuid(path[1]),
      action = path[2];
    if (path.length === 4 && action === "benefits" && req.method === "GET")
      return service.benefitDetail(db, id, user.id, uuid(path[3]));
    if (path.length === 2 && req.method === "GET") return service.ownBusiness(db, id, user.id);
    if (path.length === 2 && req.method === "PUT") {
      const body = await readJson(
        req,
        z
          .object({ revision: z.number().int().positive(), facts: workspaceBusinessSchema })
          .strict(),
      );
      return service.updateBusiness(db, id, user.id, body.facts, body.revision);
    }
    if (path.length === 3) {
      if (action === "employees" && req.method === "GET") {
        const search = new URL(req.url).searchParams;
        return service.roster(
          db,
          id,
          user.id,
          z.coerce
            .number()
            .int()
            .min(0)
            .parse(search.get("offset") ?? 0),
          z.coerce
            .number()
            .int()
            .min(1)
            .max(100)
            .parse(search.get("limit") ?? 8),
        );
      }
      if (action === "employees" && req.method === "POST")
        return service.saveEmployee(db, id, user.id, await readJson(req, employeeSchema));
      if (action === "scans" && req.method === "POST") {
        rateLimit(`scan:${user.id}`, 20);
        const upload = await readContractUpload(req);
        return service.createScan(db, id, user.id, upload.bytes, upload.mediaType);
      }
      if (action === "benefits" && req.method === "GET")
        return service.eligibleBenefits(db, id, user.id);
      if (action === "evaluate" && req.method === "POST")
        return service.evaluateWorkspace(db, id, user.id);
      if (action === "dashboard" && req.method === "GET") return service.dashboard(db, id, user.id);
      if (action === "projects" && req.method === "GET")
        return { projects: await service.projects(db, id, user.id) };
      if (action === "projects" && req.method === "POST") {
        const body = await readJson(req, z.object({ policyId: z.uuid() }).strict());
        return service.startProject(db, id, user.id, body.policyId);
      }
      if (action === "documents" && req.method === "GET")
        return { documents: await service.documents(db, id, user.id) };
      if (action === "documents" && req.method === "POST")
        return service.createDocument(db, id, user.id, await readJson(req, documentSchema));
      if (action === "notifications" && req.method === "GET")
        return { notifications: await notificationInbox(db, id, user.id) };
    }
  }
  if (path[0] === "employees" && path.length === 2) {
    const id = uuid(path[1]);
    if (req.method === "GET") return service.employeeDetail(db, id, user.id);
    if (req.method === "PUT") {
      const b = await readJson(
        req,
        z.object({ revision: z.number().int().positive(), details: employeeSchema }).strict(),
      );
      const e = await service.employeeDetail(db, id, user.id);
      return service.saveEmployee(db, e.business_id, user.id, b.details, id, b.revision);
    }
    if (req.method === "DELETE") {
      const b = await readJson(
        req,
        z.object({ confirm: z.literal(true), revision: z.number().int().positive() }).strict(),
      );
      return service.deleteEmployee(db, id, user.id, b.confirm, b.revision);
    }
  }
  if (path[0] === "scans" && path[1]) {
    const id = uuid(path[1]);
    if (path.length === 2 && req.method === "GET") return service.scanDetail(db, id, user.id);
    if (path.length === 2 && req.method === "DELETE") {
      await service.deleteScan(db, id, user.id);
      return { ok: true };
    }
    if (path.length === 3 && path[2] === "confirm" && req.method === "POST")
      return service.confirmScan(db, id, user.id, await readJson(req, employeeSchema));
    if (path.length === 3 && path[2] === "document" && req.method === "GET") {
      const d = await service.scanDocument(db, id, user.id);
      return new Response(new Uint8Array(d.bytes), {
        headers: {
          "Content-Type": d.mediaType,
          "Content-Disposition": "attachment; filename=contract",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "sandbox",
        },
      });
    }
  }
  if (path[0] === "projects" && path.length === 2 && req.method === "GET")
    return service.projectDetail(db, uuid(path[1]), user.id);
  if (path[0] === "project-steps" && path.length === 2 && req.method === "PATCH")
    return service.changeProjectStep(
      db,
      uuid(path[1]),
      user.id,
      await readJson(
        req,
        z
          .object({ done: z.boolean().optional(), deadline: dateSchema.nullable().optional() })
          .strict()
          .refine((v) => Object.keys(v).length > 0),
      ),
    );
  if (path[0] === "documents" && path.length === 2) {
    const id = uuid(path[1]);
    if (req.method === "PUT") {
      await service.updateDocument(db, id, user.id, await readJson(req, documentSchema));
      return { ok: true };
    }
    if (req.method === "DELETE") {
      await service.deleteDocument(db, id, user.id);
      return { ok: true };
    }
  }
  if (
    path[0] === "occurrences" &&
    path[2] === "complete" &&
    path.length === 3 &&
    req.method === "POST"
  )
    return service.completeOccurrence(db, uuid(path[1]), user.id);
  if (key === "POST admin/jobs") {
    if (user.role !== "ADMIN") throw new AppError(403, "운영자 권한이 필요합니다.");
    const body = await readJson(
      req,
      z.object({ kind: z.enum(["notifications", "reassess"]) }).strict(),
    );
    return body.kind === "notifications"
      ? dispatchWorkspaceNotifications(db)
      : reassessWorkspaces(db);
  }
  return notFound();
}
