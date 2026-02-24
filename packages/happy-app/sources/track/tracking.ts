// Tracking stub — paid PostHog SDK removed.
// Type preserves the interface so callers like `tracking?.capture()` still typecheck.
type TrackingClient = {
    identify(id: string, properties?: Record<string, any>): void;
    capture(event: string, properties?: Record<string, any>): void;
    screen(name: string, properties?: Record<string, any>): void;
    reset(): void;
    optIn(): void;
    optOut(): void;
};

export const tracking: TrackingClient | null = null;