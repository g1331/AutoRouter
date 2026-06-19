"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";

import { AssignUserKeysDialog } from "@/components/admin/assign-user-keys-dialog";
import { ChangeUsernameDialog } from "@/components/admin/change-username-dialog";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";
import { DeleteUserDialog } from "@/components/admin/delete-user-dialog";
import { EditUserDialog } from "@/components/admin/edit-user-dialog";
import { PaginationControls } from "@/components/admin/pagination-controls";
import { ResetPasswordDialog } from "@/components/admin/reset-password-dialog";
import { Topbar } from "@/components/admin/topbar";
import { UsersTable } from "@/components/admin/users-table";
import { UserUpstreamsDialog } from "@/components/admin/user-upstreams-dialog";
import { Card } from "@/components/ui/card";
import { useRouter } from "@/i18n/navigation";
import { useUsers } from "@/hooks/use-users";
import { useContainerMorph } from "@/hooks/use-container-morph";
import { useAuth } from "@/providers/auth-provider";
import type { User } from "@/types/api";

type UserDialog = "edit" | "username" | "password" | "upstreams" | "keys" | "delete" | null;

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [dialog, setDialog] = useState<UserDialog>(null);

  // 容器变形动画：所有用户操作都从该行的下拉菜单触发，统一以行元素为变形源，
  // 同一时刻只会打开一个弹窗，故共用单个 view-transition-name。
  const { startMorph, canMorph } = useContainerMorph();
  const morphSourceRef = useRef<HTMLElement | null>(null);

  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { data, isLoading } = useUsers(page, pageSize);
  const { principal } = useAuth();

  // ADMIN_TOKEN 超级令牌独立于用户表、始终能管理系统，因此豁免“保留最后一个启用
  // 管理员”的前端禁用；账号登录的管理员仍受限，后端按相同口径用 409 兜底。
  const bypassLastAdminGuard = principal?.kind === "admin_token";

  const users = data?.items ?? [];
  // 全表启用管理员总数（由后端返回），用于跨分页判断最后一个启用管理员的危险操作禁用
  const activeAdminCount = data?.active_admin_total ?? 0;
  const isLastActiveAdmin = (user: User) =>
    !bypassLastAdminGuard && user.role === "admin" && user.is_active && activeAdminCount <= 1;

  const openDialog = (type: Exclude<UserDialog, null>, user: User, source: HTMLElement | null) => {
    morphSourceRef.current = source;
    startMorph(
      () => {
        setActiveUser(user);
        setDialog(type);
      },
      { source, name: "morph-user-row", mode: "enter" }
    );
  };
  const closeDialog = () => {
    startMorph(() => setDialog(null), {
      source: morphSourceRef.current,
      name: "morph-user-row",
      mode: "exit",
    });
  };

  return (
    <>
      <Topbar title={t("pageTitle")} />

      <div className="mx-auto max-w-7xl space-y-4 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <span className="type-body-medium text-muted-foreground">{t("managementDesc")}</span>
          </div>
          <CreateUserDialog />
        </div>

        {isLoading ? (
          <div className="py-16 text-center type-body-medium text-muted-foreground" role="status">
            {tCommon("loading")}
          </div>
        ) : (
          <>
            <UsersTable
              users={users}
              activeAdminCount={activeAdminCount}
              bypassLastAdminGuard={bypassLastAdminGuard}
              onViewUsage={(user) => router.push(`/system/users/${user.id}`)}
              onEdit={(user, source) => openDialog("edit", user, source)}
              onChangeUsername={(user, source) => openDialog("username", user, source)}
              onResetPassword={(user, source) => openDialog("password", user, source)}
              onConfigureUpstreams={(user, source) => openDialog("upstreams", user, source)}
              onAssignKeys={(user, source) => openDialog("keys", user, source)}
              onDelete={(user, source) => openDialog("delete", user, source)}
            />

            {data && data.total_pages > 1 && (
              <Card variant="filled" className="border border-divider">
                <PaginationControls
                  total={data.total}
                  page={page}
                  totalPages={data.total_pages}
                  onPageChange={setPage}
                  className="p-4"
                />
              </Card>
            )}
          </>
        )}
      </div>

      {activeUser && (
        <>
          <EditUserDialog
            user={activeUser}
            open={dialog === "edit"}
            onOpenChange={(open) => !open && closeDialog()}
            isLastActiveAdmin={isLastActiveAdmin(activeUser)}
            morph={canMorph}
          />
          <ChangeUsernameDialog
            user={activeUser}
            open={dialog === "username"}
            onOpenChange={(open) => !open && closeDialog()}
            morph={canMorph}
          />
          <ResetPasswordDialog
            user={activeUser}
            open={dialog === "password"}
            onOpenChange={(open) => !open && closeDialog()}
            morph={canMorph}
          />
          <UserUpstreamsDialog
            user={activeUser}
            open={dialog === "upstreams"}
            onOpenChange={(open) => !open && closeDialog()}
            morph={canMorph}
          />
          <AssignUserKeysDialog
            user={activeUser}
            open={dialog === "keys"}
            onOpenChange={(open) => !open && closeDialog()}
            morph={canMorph}
          />
          <DeleteUserDialog
            user={activeUser}
            open={dialog === "delete"}
            onClose={closeDialog}
            morph={canMorph}
          />
        </>
      )}
    </>
  );
}
