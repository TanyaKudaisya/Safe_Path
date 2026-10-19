package com.safepath.service;

import com.safepath.exception.ApiException;
import com.safepath.model.PasswordReset;
import com.safepath.model.User;
import com.safepath.repository.PasswordResetRepository;
import com.safepath.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;

/** Forgot-password flow: emailed 6-digit code, valid 15 minutes, 5 tries. */
@Service
public class PasswordResetService {

    private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);

    static final int CODE_MINUTES = 15;
    static final int MAX_ATTEMPTS = 5;
    static final String BAD_CODE = "Invalid or expired code. Please request a new one.";

    private final UserRepository userRepository;
    private final PasswordResetRepository resetRepository;
    private final PasswordEncoder passwordEncoder;
    private final MailService mailService;
    private final SecureRandom random = new SecureRandom();

    public PasswordResetService(
            UserRepository userRepository,
            PasswordResetRepository resetRepository,
            PasswordEncoder passwordEncoder,
            MailService mailService
    ) {
        this.userRepository = userRepository;
        this.resetRepository = resetRepository;
        this.passwordEncoder = passwordEncoder;
        this.mailService = mailService;
    }

    /** Never reveals whether the email exists - always returns normally. */
    public void requestReset(String rawEmail) {
        String email = normalize(rawEmail);
        if (email.isEmpty()) {
            return;
        }
        Optional<User> found = userRepository.findByEmail(email);
        if (found.isEmpty()) {
            // The app gets the same answer either way; only the server log tells you.
            log.info("Password reset requested for {} - no account with that email, nothing sent", email);
            return;
        }
        User user = found.get();

        String code = String.format("%06d", random.nextInt(1_000_000));

        PasswordReset reset = resetRepository.findByUserId(user.getId())
                .orElseGet(PasswordReset::new);
        reset.setUserId(user.getId());
        reset.setCodeHash(passwordEncoder.encode(code));
        reset.setExpiresAt(LocalDateTime.now().plusMinutes(CODE_MINUTES));
        reset.setAttempts(0);
        reset.setCreatedAt(LocalDateTime.now());
        resetRepository.save(reset);
        log.info("Password reset code created for {} - handing it to the mail service", email);

        mailService.send(
                user.getEmail(),
                "Your SafePath password reset code",
                "Hi " + (user.getName() == null ? "" : user.getName()) + ",\n\n"
                        + "Your SafePath password reset code is: " + code + "\n\n"
                        + "It is valid for " + CODE_MINUTES + " minutes. "
                        + "If you did not ask for this, you can ignore this email - "
                        + "your password has not changed.\n\n- SafePath");
    }

    public void reset(String rawEmail, String code, String newPassword) {
        String email = normalize(rawEmail);

        if (newPassword == null || newPassword.length() < 8) {
            throw ApiException.badRequest("Password must be at least 8 characters");
        }
        if (code == null || !code.trim().matches("\\d{6}")) {
            throw ApiException.badRequest(BAD_CODE);
        }

        User user = userRepository.findByEmail(email)
                .orElseThrow(() -> ApiException.badRequest(BAD_CODE));
        PasswordReset reset = resetRepository.findByUserId(user.getId())
                .orElseThrow(() -> ApiException.badRequest(BAD_CODE));

        if (reset.getExpiresAt() == null || reset.getExpiresAt().isBefore(LocalDateTime.now())
                || reset.getAttempts() >= MAX_ATTEMPTS) {
            resetRepository.deleteByUserId(user.getId());
            throw ApiException.badRequest(BAD_CODE);
        }

        if (!passwordEncoder.matches(code.trim(), reset.getCodeHash())) {
            reset.setAttempts(reset.getAttempts() + 1);
            if (reset.getAttempts() >= MAX_ATTEMPTS) {
                resetRepository.deleteByUserId(user.getId());
            } else {
                resetRepository.save(reset);
            }
            throw ApiException.badRequest(BAD_CODE);
        }

        user.setPassword(passwordEncoder.encode(newPassword));
        user.setPasswordChangedAt(LocalDateTime.now());   // signs out every older session
        userRepository.save(user);
        resetRepository.deleteByUserId(user.getId());

        mailService.send(
                user.getEmail(),
                "Your SafePath password was changed",
                "Your SafePath password was just changed. If this was not you, "
                        + "reset it again right away and contact support.\n\n- SafePath");
    }

    private static String normalize(String email) {
        return email == null ? "" : email.trim().toLowerCase();
    }
}
