"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useUploadCliproxyAuthFile } from "@/hooks/use-cliproxy";
import { cn } from "@/lib/utils";

interface CliproxyAuthFileUploadDialogProps {
  instanceId: string;
  open: boolean;
  onClose: () => void;
}

type UploadMode = "file" | "paste";

/**
 * 上传 CLIProxyAPI 认证文件的弹窗。
 *
 * 支持「选择文件」与「粘贴 JSON」两种方式，由顶部按钮组切换。
 * 提交前在前端验证 JSON 合法性，上传成功后自动触发同步，
 * 同步结果由 mutation 的 onSuccess 提示。
 */
export function CliproxyAuthFileUploadDialog({
  instanceId,
  open,
  onClose,
}: CliproxyAuthFileUploadDialogProps) {
  const t = useTranslations("cliproxy");
  const tCommon = useTranslations("common");
  const uploadMutation = useUploadCliproxyAuthFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<UploadMode>("file");
  const [pasteContent, setPasteContent] = useState("");
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const [pickedFileContent, setPickedFileContent] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setPickedFileName(null);
      setPickedFileContent(null);
      return;
    }
    setPickedFileName(file.name);
    setPickedFileContent(await file.text());
  };

  const handleSubmit = async () => {
    const raw = mode === "file" ? pickedFileContent : pasteContent;
    if (!raw || !raw.trim()) {
      toast.error(t("uploadAuthFileEmpty"));
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      toast.error(t("uploadAuthFileInvalidJson"));
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      toast.error(t("uploadAuthFileInvalidJson"));
      return;
    }

    try {
      await uploadMutation.mutateAsync({
        instanceId,
        content: parsed as Record<string, unknown>,
      });
      handleClose();
    } catch {
      // 错误已由 mutation 的 onError 提示
    }
  };

  const handleClose = () => {
    setPasteContent("");
    setPickedFileName(null);
    setPickedFileContent(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("uploadAuthFileTitle")}</DialogTitle>
          <DialogDescription>{t("uploadAuthFileDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex w-full overflow-hidden rounded-cf-sm border border-border">
          <ModeButton active={mode === "file"} onClick={() => setMode("file")}>
            {t("uploadAuthFileMethodFile")}
          </ModeButton>
          <ModeButton active={mode === "paste"} onClick={() => setMode("paste")}>
            {t("uploadAuthFileMethodPaste")}
          </ModeButton>
        </div>

        <div className="py-3">
          {mode === "file" ? (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-cf-sm border border-dashed border-border p-6 text-muted-foreground hover:bg-surface-100"
              >
                <Upload className="h-4 w-4" aria-hidden />
                <span className="type-body-small">
                  {pickedFileName ?? t("uploadAuthFileChoose")}
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleFileChange}
              />
            </>
          ) : (
            <Textarea
              rows={10}
              placeholder={t("uploadAuthFilePastePlaceholder")}
              value={pasteContent}
              onChange={(event) => setPasteContent(event.target.value)}
              className="font-mono"
            />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={uploadMutation.isPending}>
            {uploadMutation.isPending ? t("uploading") : t("uploadAuthFileSubmit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ModeButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function ModeButton({ active, onClick, children }: ModeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 px-3 py-2 type-body-small transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-surface-100 hover:bg-surface-200"
      )}
    >
      {children}
    </button>
  );
}
