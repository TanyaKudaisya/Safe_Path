package com.safepath.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;

/** One pending password-reset code per user (the code itself is stored hashed). */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "password_resets")
public class PasswordReset {

    @Id
    private String id;

    private String userId;

    private String codeHash;

    private LocalDateTime expiresAt;

    private int attempts;

    private LocalDateTime createdAt;
}
