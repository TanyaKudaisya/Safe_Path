package com.safepath.controller;

import com.safepath.dto.AuthResponse;
import com.safepath.dto.LoginRequest;
import com.safepath.dto.PasswordResetDtos.ForgotPasswordRequest;
import com.safepath.dto.PasswordResetDtos.PushTokenRequest;
import com.safepath.dto.PasswordResetDtos.ResetPasswordRequest;
import com.safepath.dto.SignupRequest;
import com.safepath.dto.UpdateProfileRequest;
import com.safepath.exception.ApiException;
import com.safepath.model.User;
import com.safepath.repository.UserRepository;
import com.safepath.security.JwtService;
import com.safepath.security.LoginGuard;
import com.safepath.security.StaffPolicy;
import com.safepath.service.AuthService;
import com.safepath.service.PasswordResetService;
import com.safepath.service.PushService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final LoginGuard loginGuard;
    private final PasswordResetService passwordResetService;
    private final PushService pushService;

    public AuthController(
            AuthService authService,
            JwtService jwtService,
            UserRepository userRepository,
            LoginGuard loginGuard,
            PasswordResetService passwordResetService,
            PushService pushService
    ) {
        this.authService = authService;
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.loginGuard = loginGuard;
        this.passwordResetService = passwordResetService;
        this.pushService = pushService;
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(@RequestBody SignupRequest request) {
        User user = authService.signup(request);
        return ResponseEntity.ok(toResponse(user));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(
            @RequestBody LoginRequest request,
            HttpServletRequest http
    ) {
        String email = request.getEmail() == null
                ? "" : request.getEmail().trim().toLowerCase();
        String ip = clientIp(http);

        loginGuard.checkLogin(email, ip);          // 429 when locked
        User user;
        try {
            user = authService.login(request);
        } catch (ApiException e) {
            if (e.getStatus() == HttpStatus.UNAUTHORIZED) {
                loginGuard.loginFailed(email, ip);
            }
            throw e;
        }
        loginGuard.loginSucceeded(email, ip);
        return ResponseEntity.ok(toResponse(user));
    }

    // ------------------------- password reset -------------------------

    @PostMapping("/forgot-password")
    public Map<String, String> forgotPassword(
            @RequestBody ForgotPasswordRequest request,
            HttpServletRequest http
    ) {
        String email = request.email() == null ? "" : request.email().trim().toLowerCase();
        loginGuard.checkAndCountResetRequest(email, clientIp(http));
        passwordResetService.requestReset(email);
        // identical answer whether or not the account exists
        return Map.of("message",
                "If that email is registered, a 6-digit code has been sent to it.");
    }

    @PostMapping("/reset-password")
    public Map<String, String> resetPassword(
            @RequestBody ResetPasswordRequest request,
            HttpServletRequest http
    ) {
        String ip = clientIp(http);
        loginGuard.checkResetConfirm(ip);
        try {
            passwordResetService.reset(request.email(), request.code(), request.newPassword());
        } catch (ApiException e) {
            if (e.getStatus() == HttpStatus.BAD_REQUEST) {
                loginGuard.resetConfirmFailed(ip);
            }
            throw e;
        }
        return Map.of("message", "Password changed. You can now log in.");
    }

    // --------------------------- push tokens ---------------------------

    @PostMapping("/push-token")
    public Map<String, Boolean> registerPushToken(
            @RequestBody PushTokenRequest request,
            Authentication authentication
    ) {
        if (authentication == null) {
            throw ApiException.unauthorized("Not logged in");
        }
        if (!pushService.register(authentication.getName(), request.token())) {
            throw ApiException.badRequest("Invalid push token");
        }
        return Map.of("registered", true);
    }

    @PostMapping("/push-token/remove")
    public Map<String, Boolean> removePushToken(
            @RequestBody PushTokenRequest request,
            Authentication authentication
    ) {
        if (authentication == null) {
            throw ApiException.unauthorized("Not logged in");
        }
        pushService.unregister(authentication.getName(), request.token());
        return Map.of("removed", true);
    }

    /** remoteAddr (not X-Forwarded-For, which a client can fake). See README for proxies. */
    private static String clientIp(HttpServletRequest http) {
        String ip = http.getRemoteAddr();
        return ip == null ? "unknown" : ip;
    }

    /** Who am I? (token check used by the dashboard on page load) */
    @GetMapping("/me")
    public AuthResponse me(Authentication authentication) {
        if (authentication == null) {
            throw ApiException.unauthorized("Not logged in");
        }
        User user = userRepository.findById(authentication.getName())
                .orElseThrow(() -> ApiException.unauthorized("Unknown user"));
        return new AuthResponse(
                user.getId(), user.getName(), user.getEmail(), user.getPhone(), user.getAvatar(),
                StaffPolicy.effectiveRole(user.getRole(), user.getEmail()), null);
    }

    /** Edit own profile (name / phone / avatar). */
    @PutMapping("/update")
    public AuthResponse update(
            @RequestBody UpdateProfileRequest request,
            Authentication authentication
    ) {
        if (authentication == null) {
            throw ApiException.unauthorized("Not logged in");
        }
        User user = authService.updateProfile(authentication.getName(), request);
        return new AuthResponse(
                user.getId(), user.getName(), user.getEmail(), user.getPhone(), user.getAvatar(),
                StaffPolicy.effectiveRole(user.getRole(), user.getEmail()), null);
    }

    private AuthResponse toResponse(User user) {
        return new AuthResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getPhone(),
                user.getAvatar(),
                // an "admin" role only counts together with a @safepath.com email
                StaffPolicy.effectiveRole(user.getRole(), user.getEmail()),
                jwtService.generateToken(user.getId())
        );
    }
}
