import type { ReactNode } from "react";
import { SearchX } from "lucide-react";

export function EmptyState({
  title = "Nothing matches",
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center">
      <SearchX className="h-8 w-8 text-muted-foreground" aria-hidden />
      <h3 className="mt-4 text-base font-medium">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
