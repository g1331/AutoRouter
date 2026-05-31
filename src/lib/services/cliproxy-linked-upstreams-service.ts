import { eq, desc } from "drizzle-orm";
import { db, upstreams, type Upstream } from "../db";
import { getCliproxyInstanceById, CliproxyInstanceNotFoundError } from "./cliproxy-instance-crud";

/** 关联上游类型。 */
export type CliproxyLinkedUpstreamKind = "pool" | "single";

/** 实例下的关联上游展示形态。 */
export interface CliproxyLinkedUpstreamResponse {
  id: string;
  name: string;
  provider: string;
  kind: CliproxyLinkedUpstreamKind;
  authFileName: string | null;
  isActive: boolean;
  createdAt: Date;
}

/** 单账号上游的判定依据：cliproxyAuthFileName 非空。 */
function classifyKind(row: Upstream): CliproxyLinkedUpstreamKind {
  return row.cliproxyAuthFileName ? "single" : "pool";
}

/**
 * 列出某 CLIProxyAPI 实例下的全部关联上游（池上游与单账号上游）。
 *
 * 关联关系来源于 `upstreams.cliproxyInstanceId` 字段，不需要访问 CLIProxyAPI。
 */
export async function listCliproxyLinkedUpstreams(
  instanceId: string
): Promise<CliproxyLinkedUpstreamResponse[]> {
  const instance = await getCliproxyInstanceById(instanceId);
  if (!instance) {
    throw new CliproxyInstanceNotFoundError(instanceId);
  }

  const rows = await db
    .select()
    .from(upstreams)
    .where(eq(upstreams.cliproxyInstanceId, instanceId))
    .orderBy(desc(upstreams.createdAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    provider: row.cliproxyProvider ?? "unknown",
    kind: classifyKind(row),
    authFileName: row.cliproxyAuthFileName ?? null,
    isActive: row.isActive,
    createdAt: row.createdAt,
  }));
}
