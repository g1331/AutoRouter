import { CliproxySkeleton as Skeleton } from "./cliproxy-skeleton";

/** 与账号表格的列宽、信息密度保持一致的占位行。 */
export function CliproxyAccountsSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="cliproxy-accounts-skeleton"
      className="overflow-hidden rounded-cf-sm border border-divider"
    >
      <div className="grid grid-cols-[54%_31%_15%] border-b border-divider px-2 py-3 sm:px-4 lg:grid-cols-[46%_21%_25%_8%]">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="hidden h-3 w-20 lg:block" />
        <Skeleton className="ml-auto h-3 w-7" />
      </div>
      <div className="grid grid-cols-[54%_31%_15%] px-2 py-3 sm:px-4 lg:grid-cols-[46%_21%_25%_8%]">
        <div className="min-w-0 space-y-2.5 pr-2">
          <Skeleton className="h-4 w-32 max-w-full" />
          <Skeleton className="h-3 w-28 max-w-full" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-14" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="space-y-2 pr-2">
          <Skeleton className="h-3 w-16 max-w-full" />
          <Skeleton className="h-3 w-14 max-w-full" />
          <Skeleton className="h-3 w-16 max-w-full lg:hidden" />
        </div>
        <Skeleton className="hidden h-3 w-16 lg:block" />
        <Skeleton className="ml-auto h-8 w-8" />
      </div>
    </div>
  );
}
