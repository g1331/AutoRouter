import {
  getLogs,
  type CliproxyLogsQuery,
  type CliproxyLogsResult,
} from "./cliproxy-management-client";
import { resolveCliproxyManagementTarget } from "./cliproxy-instance-crud";

/** 从 CLIProxyAPI 拉取实例日志。 */
export async function listCliproxyInstanceLogs(
  instanceId: string,
  query: CliproxyLogsQuery = {}
): Promise<CliproxyLogsResult> {
  const target = await resolveCliproxyManagementTarget(instanceId);
  return getLogs(target, query);
}
