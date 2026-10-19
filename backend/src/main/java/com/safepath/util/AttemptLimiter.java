package com.safepath.util;

import java.util.HashMap;
import java.util.Map;
import java.util.function.LongSupplier;

/**
 * Counts events per key. After {@code maxHits} hits inside {@code windowMs} the key is
 * locked for {@code lockMs}. In-memory (per server instance); pure Java so it can be tested.
 */
public final class AttemptLimiter {

    private record State(int hits, long windowStart, long lockedUntil) {
    }

    private static final int CLEANUP_THRESHOLD = 10_000;

    private final int maxHits;
    private final long windowMs;
    private final long lockMs;
    private final LongSupplier clock;
    private final Map<String, State> states = new HashMap<>();

    public AttemptLimiter(int maxHits, long windowMs, long lockMs) {
        this(maxHits, windowMs, lockMs, System::currentTimeMillis);
    }

    public AttemptLimiter(int maxHits, long windowMs, long lockMs, LongSupplier clock) {
        this.maxHits = maxHits;
        this.windowMs = windowMs;
        this.lockMs = lockMs;
        this.clock = clock;
    }

    /** Seconds until the key may try again, or 0 when it is not locked. */
    public synchronized long blockedFor(String key) {
        State s = states.get(key);
        if (s == null) {
            return 0;
        }
        long now = clock.getAsLong();
        if (s.lockedUntil() > now) {
            return (s.lockedUntil() - now + 999) / 1000;
        }
        return 0;
    }

    /** Records one event (failed login, reset request...). Locks the key when the limit is hit. */
    public synchronized void hit(String key) {
        long now = clock.getAsLong();
        if (states.size() > CLEANUP_THRESHOLD) {
            states.values().removeIf(s -> isExpired(s, now));
        }
        State s = states.get(key);
        if (s == null || isExpired(s, now)) {
            s = new State(0, now, 0);
        }
        int hits = s.hits() + 1;
        long lockedUntil = hits >= maxHits ? now + lockMs : s.lockedUntil();
        states.put(key, new State(hits, s.windowStart(), lockedUntil));
    }

    public synchronized void reset(String key) {
        states.remove(key);
    }

    private boolean isExpired(State s, long now) {
        if (s.lockedUntil() > 0) {
            return s.lockedUntil() <= now;          // lock served
        }
        return now - s.windowStart() > windowMs;    // window over, never locked
    }
}
