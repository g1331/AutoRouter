import {
  getLogs,
  type CliproxyLogEntry,
  type CliproxyManagementTarget,
} from "./cliproxy-management-client";
import {
  getCliproxyInstanceRow,
  getDecryptedManagementKey,
  CliproxyInstanceNotFoundError,
} from "./cliproxy-instance-crud";

/** 从 CLIProxyAPI 拉取实例日志。 */
export async function listCliproxyInstanceLogs(
  instanceId: string,
  since?: string
): Promise<CliproxyLogEntry[]> {
  const instance = await getCliproxyInstanceRow(instanceId);
  if (!instance) {
    throw new CliproxyInstanceNotFoundError(instanceId);
  }
  const target: CliproxyManagementTarget = {
    managementUrl: instance.managementUrl,
    managementKey: getDecryptedManagementKey(instance),
  };
  return getLogs(target, since);
}
