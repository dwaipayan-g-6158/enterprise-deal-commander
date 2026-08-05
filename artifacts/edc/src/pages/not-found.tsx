import { Link } from "wouter";
import { Compass } from "lucide-react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

/**
 * The 404.
 *
 * It was painted in hardcoded greys — `bg-gray-50`, `text-gray-900`,
 * `text-gray-600` — so a dark-mode reader who mistyped a URL got a white page
 * with near-black text, in an application that is otherwise dark. Tokens now,
 * which fixes it on both shells at once.
 *
 * Built on `Empty`, the same primitive behind every in-app empty state, so a
 * wrong address and an empty list look like the same product rather than two.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[100dvh] w-full items-center justify-center bg-background p-4">
      <Empty className="max-w-md">
        <EmptyHeader className="gap-1.5">
          <EmptyMedia variant="icon">
            <Compass />
          </EmptyMedia>
          <EmptyTitle className="text-xl font-semibold tracking-tight">
            This page went missing
          </EmptyTitle>
          <EmptyDescription>
            We couldn't find what you were looking for. Let's get you back to the deals.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild className="h-12 w-full">
            <Link href="/">Back to the Command Center</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
