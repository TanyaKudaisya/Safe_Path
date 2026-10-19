package com.safepath.dto;

/** Request bodies for the forgot-password flow and push tokens. */
public final class PasswordResetDtos {

    private PasswordResetDtos() {
    }

    public record ForgotPasswordRequest(String email) {
    }

    public record ResetPasswordRequest(String email, String code, String newPassword) {
    }

    public record PushTokenRequest(String token) {
    }
}
