package com.safepath.security;

import com.safepath.exception.ApiException;
import com.safepath.util.AttemptLimiter;
import org.springframework.stereotype.Component;

import java.util.function.LongSupplier;

/**
 * Brute-force protection for login and password reset.
 *
 * Login failures are counted per (email + IP), per IP and per email, so an attacker cannot
 * lock a victim out from their own address with just five guesses, but a guess-everything
 * script is still stopped.
 */
@Component
public class LoginGuard {

    private static final long MIN = 60_000L;

    private final AttemptLimiter loginPair;     // 5 wrong passwords / 15 min  (email + IP)
    private final AttemptLimiter loginIp;       // 30 / 15 min
    private final AttemptLimiter loginEmail;    // 25 / hour (distributed attacks)
    private final AttemptLimiter resetEmail;    // 3 code requests / hour
    private final AttemptLimiter resetIp;       // 10 code requests / hour
    private final AttemptLimiter confirmIp;     // 10 wrong codes / 15 min

    public LoginGuard() {
        this(System::currentTimeMillis);
    }

    public LoginGuard(LongSupplier clock) {
        this.loginPair = new AttemptLimiter(5, 15 * MIN, 15 * MIN, clock);
        this.loginIp = new AttemptLimiter(30, 15 * MIN, 15 * MIN, clock);
        this.loginEmail = new AttemptLimiter(25, 60 * MIN, 30 * MIN, clock);
        this.resetEmail = new AttemptLimiter(3, 60 * MIN, 60 * MIN, clock);
        this.resetIp = new AttemptLimiter(10, 60 * MIN, 60 * MIN, clock);
        this.confirmIp = new AttemptLimiter(10, 15 * MIN, 15 * MIN, clock);
    }

    // ------------------------------ login ------------------------------

    public void checkLogin(String email, String ip) {
        throwIfBlocked(
                loginPair.blockedFor(pair(email, ip)),
                loginIp.blockedFor(ip),
                loginEmail.blockedFor(email));
    }

    public void loginFailed(String email, String ip) {
        loginPair.hit(pair(email, ip));
        loginIp.hit(ip);
        loginEmail.hit(email);
    }

    public void loginSucceeded(String email, String ip) {
        loginPair.reset(pair(email, ip));
    }

    // ---------------------------- password reset ----------------------------

    /** Counts every request for a code (whether or not the email exists - no enumeration). */
    public void checkAndCountResetRequest(String email, String ip) {
        throwIfBlocked(resetEmail.blockedFor(email), resetIp.blockedFor(ip));
        resetEmail.hit(email);
        resetIp.hit(ip);
    }

    public void checkResetConfirm(String ip) {
        throwIfBlocked(confirmIp.blockedFor(ip));
    }

    public void resetConfirmFailed(String ip) {
        confirmIp.hit(ip);
    }

    // ------------------------------ helpers ------------------------------

    private static String pair(String email, String ip) {
        return email + "|" + ip;
    }

    private static void throwIfBlocked(long... seconds) {
        long max = 0;
        for (long s : seconds) {
            max = Math.max(max, s);
        }
        if (max > 0) {
            throw ApiException.tooManyRequests(max);
        }
    }
}
