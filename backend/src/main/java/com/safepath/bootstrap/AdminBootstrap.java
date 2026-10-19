package com.safepath.bootstrap;

import com.safepath.model.User;
import com.safepath.repository.UserRepository;
import com.safepath.security.StaffPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Creates the very first admin so someone can open the dashboard and invite
 * the rest of the staff. Public signup can never create @safepath.com accounts.
 */
@Component
public class AdminBootstrap implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String email;
    private final String password;
    private final String name;

    public AdminBootstrap(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            @Value("${admin.bootstrap.email:}") String email,
            @Value("${admin.bootstrap.password:}") String password,
            @Value("${admin.bootstrap.name:SafePath Admin}") String name
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.email = email == null ? "" : email.trim().toLowerCase();
        this.password = password;
        this.name = name;
    }

    @Override
    public void run(String... args) {
        if (email.isEmpty() || password == null || password.isEmpty()) {
            log.info("No admin.bootstrap.* configured - skipping first-admin creation");
            return;
        }
        if (!StaffPolicy.isStaffEmail(email)) {
            log.warn("admin.bootstrap.email must end with {} - skipping", StaffPolicy.STAFF_DOMAIN);
            return;
        }
        if (password.length() < 8) {
            log.warn("admin.bootstrap.password must be at least 8 characters - skipping");
            return;
        }

        User existing = userRepository.findByEmail(email).orElse(null);
        if (existing != null) {
            if (!"admin".equalsIgnoreCase(existing.getRole())) {
                existing.setRole("admin");
                userRepository.save(existing);
                log.info("Promoted existing account {} to admin", email);
            }
            return;
        }

        User u = new User();
        u.setName(name);
        u.setEmail(email);
        u.setPassword(passwordEncoder.encode(password));
        u.setRole("admin");
        userRepository.save(u);
        log.warn("Created first admin account {} - change its password in the dashboard!", email);
    }
}
