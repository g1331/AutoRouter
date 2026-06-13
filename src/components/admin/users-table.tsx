"use client";

import { formatDistanceToNow } from "date-fns";
import { useLocale, useTranslations } from "next-intl";
import {
  KeyRound,
  Link2,
  MoreHorizontal,
  Pencil,
  Server,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";

import type { User } from "@/types/api";
import { useToggleUserActive } from "@/hooks/use-users";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";

interface UsersTableProps {
  users: User[];
  /** 当前可见数据中启用的管理员数量，用于在前端禁用最后一个启用管理员的危险操作。 */
  activeAdminCount: number;
  /** 调用者是否为 ADMIN_TOKEN 超级令牌；为真时豁免“最后一个启用管理员”的禁用。 */
  bypassLastAdminGuard?: boolean;
  onEdit: (user: User) => void;
  onChangeUsername: (user: User) => void;
  onResetPassword: (user: User) => void;
  onConfigureUpstreams: (user: User) => void;
  onAssignKeys: (user: User) => void;
  onDelete: (user: User) => void;
}

/**
 * 用户列表表格：展示账号信息，行内开关切换启用状态，下拉菜单聚合编辑与危险操作。
 * 最后一个启用的管理员在前端禁用停用与删除入口，服务端对跨页情形再做 409 兜底；
 * 当 bypassLastAdminGuard 为真（ADMIN_TOKEN 超级令牌登录）时该禁用被豁免。
 */
export function UsersTable({
  users,
  activeAdminCount,
  bypassLastAdminGuard = false,
  onEdit,
  onChangeUsername,
  onResetPassword,
  onConfigureUpstreams,
  onAssignKeys,
  onDelete,
}: UsersTableProps) {
  const toggleActive = useToggleUserActive();
  const t = useTranslations("users");
  const locale = useLocale();
  const dateLocale = getDateLocale(locale);

  const isLastActiveAdmin = (user: User) =>
    !bypassLastAdminGuard && user.role === "admin" && user.is_active && activeAdminCount <= 1;

  const handleToggle = async (user: User, nextActive: boolean) => {
    if (nextActive === user.is_active) {
      return;
    }
    try {
      await toggleActive.mutateAsync({ id: user.id, nextActive });
    } catch {
      // 错误已由 mutation onError 处理
    }
  };

  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-cf-md border border-divider bg-surface-300/80">
          <Users className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
        </div>
        <h3 className="type-title-medium text-foreground">{t("noUsers")}</h3>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-cf-md border border-divider bg-surface-200/70">
      <Table frame="none" containerClassName="rounded-none bg-transparent">
        <TableHeader>
          <TableRow>
            <TableHead>{t("username")}</TableHead>
            <TableHead>{t("displayName")}</TableHead>
            <TableHead>{t("role")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead className="hidden md:table-cell">{t("apiKeys")}</TableHead>
            <TableHead className="hidden whitespace-nowrap 2xl:table-cell">
              {t("createdAt")}
            </TableHead>
            <TableHead className="text-right">{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const lastAdmin = isLastActiveAdmin(user);
            return (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell>{user.display_name}</TableCell>
                <TableCell>
                  <Badge variant={user.role === "admin" ? "info" : "neutral"}>
                    {user.role === "admin" ? t("roleAdmin") : t("roleMember")}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="inline-flex items-center gap-2">
                    <Switch
                      checked={user.is_active}
                      onCheckedChange={(next) => handleToggle(user, next)}
                      disabled={
                        lastAdmin ||
                        (toggleActive.isPending && toggleActive.variables?.id === user.id)
                      }
                      className="h-5 w-10"
                      aria-label={`${user.is_active ? t("disable") : t("enable")}: ${user.username}`}
                    />
                    <span
                      className={cn(
                        "type-caption whitespace-nowrap",
                        user.is_active ? "text-status-success" : "text-muted-foreground"
                      )}
                    >
                      {user.is_active ? t("active") : t("inactive")}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden tabular-nums md:table-cell">
                  {user.api_key_count}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap 2xl:table-cell">
                  {formatDistanceToNow(new Date(user.created_at), {
                    addSuffix: true,
                    locale: dateLocale,
                  })}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`${t("actions")}: ${user.username}`}
                      >
                        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onClick={() => onEdit(user)}>
                        <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t("edit")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onChangeUsername(user)}>
                        <UserCog className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t("changeUsername")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onResetPassword(user)}>
                        <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t("resetPassword")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onConfigureUpstreams(user)}>
                        <Server className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t("configureUpstreams")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onAssignKeys(user)}>
                        <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t("assignKeys")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => onDelete(user)}
                        disabled={lastAdmin}
                        className="text-status-error focus:text-status-error"
                      >
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        {t("deleteUser")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
