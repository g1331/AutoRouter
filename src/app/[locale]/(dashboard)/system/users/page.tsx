"use client";

import { useState } from "react";
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
import { useUsers } from "@/hooks/use-users";
import type { User } from "@/types/api";

type UserDialog = "edit" | "username" | "password" | "upstreams" | "keys" | "delete" | null;

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [activeUser, setActiveUser] = useState<User | null>(null);
  const [dialog, setDialog] = useState<UserDialog>(null);

  const t = useTranslations("users");
  const tCommon = useTranslations("common");
  const { data, isLoading } = useUsers(page, pageSize);

  const users = data?.items ?? [];
  // 全表启用管理员总数（由后端返回），用于跨分页判断最后一个启用管理员的危险操作禁用
  const activeAdminCount = data?.active_admin_total ?? 0;
  const isLastActiveAdmin = (user: User) =>
    user.role === "admin" && user.is_active && activeAdminCount <= 1;

  const openDialog = (type: Exclude<UserDialog, null>) => (user: User) => {
    setActiveUser(user);
    setDialog(type);
  };
  const closeDialog = () => setDialog(null);

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
              onEdit={openDialog("edit")}
              onChangeUsername={openDialog("username")}
              onResetPassword={openDialog("password")}
              onConfigureUpstreams={openDialog("upstreams")}
              onAssignKeys={openDialog("keys")}
              onDelete={openDialog("delete")}
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
          />
          <ChangeUsernameDialog
            user={activeUser}
            open={dialog === "username"}
            onOpenChange={(open) => !open && closeDialog()}
          />
          <ResetPasswordDialog
            user={activeUser}
            open={dialog === "password"}
            onOpenChange={(open) => !open && closeDialog()}
          />
          <UserUpstreamsDialog
            user={activeUser}
            open={dialog === "upstreams"}
            onOpenChange={(open) => !open && closeDialog()}
          />
          <AssignUserKeysDialog
            user={activeUser}
            open={dialog === "keys"}
            onOpenChange={(open) => !open && closeDialog()}
          />
          <DeleteUserDialog user={activeUser} open={dialog === "delete"} onClose={closeDialog} />
        </>
      )}
    </>
  );
}
