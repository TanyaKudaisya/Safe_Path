package com.safepath.security;

import com.safepath.model.User;
import com.safepath.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.ZoneId;
import java.util.Date;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository userRepository;

    public JwtAuthenticationFilter(
            JwtService jwtService,
            UserRepository userRepository
    ) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {

        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);

        try {
            String userId = jwtService.extractUserId(token);
            Date issuedAt = jwtService.extractIssuedAt(token);

            User user = userRepository.findById(userId).orElse(null);

            // a password reset signs out every session that started before it
            if (user != null && user.getPasswordChangedAt() != null && issuedAt != null) {
                long changed = user.getPasswordChangedAt()
                        .atZone(ZoneId.systemDefault()).toEpochSecond();
                if (issuedAt.getTime() / 1000 < changed) {
                    user = null;
                }
            }

            if (user != null) {
                // ROLE_ADMIN is granted ONLY to role=admin accounts that also have a
                // @safepath.com email; anything else is a normal user.
                String role = StaffPolicy.effectiveRole(user.getRole(), user.getEmail());

                UsernamePasswordAuthenticationToken authentication =
                        new UsernamePasswordAuthenticationToken(
                                user.getId(),
                                null,
                                List.of(new SimpleGrantedAuthority(
                                        "ROLE_" + role.toUpperCase()))
                        );

                SecurityContextHolder.getContext().setAuthentication(authentication);
            }

        } catch (Exception e) {
            // Invalid or expired JWT -> stay anonymous
        }

        filterChain.doFilter(request, response);
    }
}
