import { getLogs, type CliproxyLogEntry } from "./cliproxy-management-client";
import { resolveCliproxyManagementTarget } from "./cliproxy-instance-crud";

/** 从 CLIProxyAPI 拉取实例日志。 */
export async function listCliproxyInstanceLogs(
  instanceId: string,
  since?: string
): Promise<CliproxyLogEntry[]> {
  const target = await resolveCliproxyManagementTarget(instanceId);
  return getLogs(target, since);
}
