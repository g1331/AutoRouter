"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * M3 Snackbar / Toast
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[rgb(var(--md-sys-color-inverse-surface))] group-[.toaster]:text-[rgb(var(--md-sys-color-inverse-on-surface))] group-[.toaster]:border-none group-[.toaster]:shadow-[var(--md-elevation-3)] group-[.toaster]:rounded-[var(--shape-corner-extra-small)]",
          description:
            "group-[.toast]:text-[rgb(var(--md-sys-color-inverse-on-surface)_/_0.7)] group-[.toast]:type-body-medium",
          actionButton:
            "group-[.toast]:bg-[rgb(var(--md-sys-color-inverse-primary))] group-[.toast]:text-[rgb(var(--md-sys-color-inverse-on-surface))] group-[.toast]:type-label-large group-[.toast]:rounded-[var(--shape-corner-full)] group-[.toast]:px-3",
          cancelButton:
            "group-[.toast]:bg-transparent group-[.toast]:text-[rgb(var(--md-sys-color-inverse-primary))] group-[.toast]:type-label-large",
          success:
            "group-[.toaster]:bg-[rgb(var(--md-sys-color-success-container))] group-[.toaster]:text-[rgb(var(--md-sys-color-on-success-container))]",
          error:
            "group-[.toaster]:bg-[rgb(var(--md-sys-color-error-container))] group-[.toaster]:text-[rgb(var(--md-sys-color-on-error-container))]",
          warning:
            "group-[.toaster]:bg-[rgb(var(--md-sys-color-warning-container))] group-[.toaster]:text-[rgb(var(--md-sys-color-on-warning-container))]",
          info: "group-[.toaster]:bg-[rgb(var(--md-sys-color-primary-container))] group-[.toaster]:text-[rgb(var(--md-sys-color-on-primary-container))]",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
