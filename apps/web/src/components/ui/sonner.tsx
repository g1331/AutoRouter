"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Cassette Futurism Toast / Notification
 *
 * Terminal-style notifications with amber styling and status variants.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-surface-300 group-[.toaster]:text-amber-500 group-[.toaster]:border-2 group-[.toaster]:border-amber-500 group-[.toaster]:shadow-cf-glow-subtle group-[.toaster]:rounded-cf-sm group-[.toaster]:font-mono",
          description:
            "group-[.toast]:text-amber-700 group-[.toast]:text-sm",
          actionButton:
            "group-[.toast]:bg-amber-500 group-[.toast]:text-black-900 group-[.toast]:font-mono group-[.toast]:text-xs group-[.toast]:font-medium group-[.toast]:uppercase group-[.toast]:tracking-wider group-[.toast]:rounded-cf-sm group-[.toast]:px-3",
          cancelButton:
            "group-[.toast]:bg-transparent group-[.toast]:text-amber-500 group-[.toast]:font-mono group-[.toast]:text-xs group-[.toast]:font-medium group-[.toast]:uppercase group-[.toast]:tracking-wider",
          success:
            "group-[.toaster]:bg-status-success-muted group-[.toaster]:text-status-success group-[.toaster]:border-status-success",
          error:
            "group-[.toaster]:bg-status-error-muted group-[.toaster]:text-status-error group-[.toaster]:border-status-error",
          warning:
            "group-[.toaster]:bg-status-warning-muted group-[.toaster]:text-status-warning group-[.toaster]:border-status-warning",
          info: "group-[.toaster]:bg-status-info-muted group-[.toaster]:text-status-info group-[.toaster]:border-status-info",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
