package com.safepath.service;

import com.safepath.dto.LoginRequest;
import com.safepath.dto.SignupRequest;
import com.safepath.dto.UpdateProfileRequest;
import com.safepath.util.PhoneUtil;
import com.safepath.exception.ApiException;
import com.safepath.model.User;
import com.safepath.repository.UserRepository;
import com.safepath.security.StaffPolicy;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.regex.Pattern;

@Service
public class AuthService {

    private static final Pattern EMAIL =
            Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder
    ) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public User signup(SignupRequest request) {

        String name = request.getName() == null ? "" : request.getName().trim();
        String email = request.getEmail() == null
                ? "" : request.getEmail().trim().toLowerCase();
        String password = request.getPassword();
        String phone = PhoneUtil.normalize(request.getPhone());

        if (name.isEmpty()) {
            throw ApiException.badRequest("Name is required");
        }
        if (!EMAIL.matcher(email).matches()) {
            throw ApiException.badRequest("Please enter a valid email address");
        }
        if (phone == null) {
            throw ApiException.badRequest(
                    "Please enter a valid phone number (10-15 digits, e.g. 9876543210 or +919876543210)");
        }
        if (password == null || password.length() < 8) {
            throw ApiException.badRequest("Password must be at least 8 characters");
        }
        // Staff accounts are created by an existing admin, never by public signup.
        if (StaffPolicy.isStaffEmail(email)) {
            throw ApiException.forbidden(
                    "This email domain is reserved for SafePath staff");
        }
        if (userRepository.findByEmail(email).isPresent()) {
            throw ApiException.conflict("Email already registered");
        }

        User user = new User();

        user.setName(name);
        user.setEmail(email);
        user.setPhone(phone);
        user.setPassword(passwordEncoder.encode(password));
        user.setRole("user"); // never trust a client-supplied role

        return userRepository.save(user);
    }

    public User login(LoginRequest request) {

        String email = request.getEmail() == null ? "" : request.getEmail().trim();

        // accounts created before emails were lower-cased are still found
        User user = userRepository.findByEmail(email.toLowerCase())
                .or(() -> userRepository.findByEmail(email))
                .orElseThrow(() -> ApiException.unauthorized("Invalid email or password"));

        if (request.getPassword() == null
                || !passwordEncoder.matches(request.getPassword(), user.getPassword())) {
            throw ApiException.unauthorized("Invalid email or password");
        }

        return user;
    }

    public User updateProfile(String userId, UpdateProfileRequest req) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> ApiException.unauthorized("Unknown user"));

        if (req.getName() != null) {
            String name = req.getName().trim();
            if (name.isEmpty()) {
                throw ApiException.badRequest("Name cannot be empty");
            }
            user.setName(name);
        }
        if (req.getPhone() != null) {
            String phone = PhoneUtil.normalize(req.getPhone());
            if (phone == null) {
                throw ApiException.badRequest(
                        "Please enter a valid phone number (10-15 digits)");
            }
            user.setPhone(phone);
        }
        if (req.getAvatar() != null) {
            user.setAvatar(req.getAvatar());
        }
        return userRepository.save(user);
    }
}
