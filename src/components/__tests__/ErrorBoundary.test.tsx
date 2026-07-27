/**
 * Regression tests for ErrorBoundary's auth-related auto-redirect.
 *
 * Locks down that the redirect only fires for specific, known auth/session
 * failure messages, and NOT for generic errors that merely contain
 * substrings like "auth", "token", or "session" (e.g. a bug reading
 * `.author` on an undefined object). See the comment in
 * ErrorBoundary.tsx#componentDidCatch for context.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import ErrorBoundary from "@/components/ErrorBoundary";

vi.mock("@sentry/react", () => ({
  captureException: vi.fn(),
}));

function ThrowError({ message }: { message: string }): never {
  throw new Error(message);
}

describe("ErrorBoundary auth-related redirect", () => {
  let originalLocation: Location;
  let hrefSetter: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    originalLocation = window.location;
    hrefSetter = vi.fn();

    // Replace window.location with a mutable stub so we can observe
    // assignments to `href` without actually navigating jsdom.
    // @ts-expect-error -- intentionally deleting to redefine as configurable
    delete window.location;
    window.location = {
      ...originalLocation,
      get href() {
        return originalLocation.href;
      },
      set href(value: string) {
        hrefSetter(value);
      },
    } as unknown as Location;

    // Silence expected console noise from componentDidCatch/error boundary.
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    window.location = originalLocation;
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("does NOT redirect for an unrelated error that merely contains 'author'", () => {
    render(
      <ErrorBoundary>
        <ThrowError message="Cannot read properties of undefined (reading 'author')" />
      </ErrorBoundary>
    );

    vi.advanceTimersByTime(1000);

    expect(hrefSetter).not.toHaveBeenCalled();
  });

  it("redirects for a 'JWT expired' error", () => {
    render(
      <ErrorBoundary>
        <ThrowError message="JWT expired" />
      </ErrorBoundary>
    );

    vi.advanceTimersByTime(500);

    expect(hrefSetter).toHaveBeenCalledWith("/auth");
  });

  it("redirects for a 'User not authenticated' error", () => {
    render(
      <ErrorBoundary>
        <ThrowError message="User not authenticated" />
      </ErrorBoundary>
    );

    vi.advanceTimersByTime(500);

    expect(hrefSetter).toHaveBeenCalledWith("/auth");
  });
});
