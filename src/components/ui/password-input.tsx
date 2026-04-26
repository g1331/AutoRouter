"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn, warnIfForbiddenVisualStyle } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentPropsWithoutRef<typeof Input>, "type"> & {
  allowPasswordManager?: boolean;
  containerClassName?: string;
};

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  (
    {
      allowPasswordManager = false,
      className,
      containerClassName,
      disabled,
      autoComplete,
      ...props
    },
    ref
  ) => {
    const tCommon = useTranslations("common");
    const [isVisible, setIsVisible] = React.useState(false);
    const [supportsTextSecurity, setSupportsTextSecurity] = React.useState(true);
    const shouldUseTextSecurity = !isVisible && supportsTextSecurity && !allowPasswordManager;

    React.useEffect(() => {
      setSupportsTextSecurity(
        typeof CSS !== "undefined" &&
          typeof CSS.supports === "function" &&
          CSS.supports("-webkit-text-security", "disc")
      );
    }, []);

    warnIfForbiddenVisualStyle("PasswordInput", containerClassName);

    return (
      <div className={cn("relative", containerClassName)}>
        <Input
          ref={ref}
          type={isVisible || shouldUseTextSecurity ? "text" : "password"}
          disabled={disabled}
          autoComplete={autoComplete ?? (allowPasswordManager ? "current-password" : "off")}
          data-1p-ignore={allowPasswordManager ? undefined : "true"}
          data-lpignore={allowPasswordManager ? undefined : "true"}
          data-form-type={allowPasswordManager ? undefined : "other"}
          className={cn(
            "password-input__field pr-12",
            shouldUseTextSecurity &&
              "font-mono text-[16px] leading-none tracking-[0.22em] [-webkit-text-security:disc]",
            className
          )}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1.5 top-1/2 h-8 w-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setIsVisible((value) => !value)}
          disabled={disabled}
          aria-label={isVisible ? tCommon("hideSensitiveInput") : tCommon("showSensitiveInput")}
        >
          {isVisible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>
    );
  }
);
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
