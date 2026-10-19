package com.safepath.repository;

import com.safepath.model.PasswordReset;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.Optional;

public interface PasswordResetRepository extends MongoRepository<PasswordReset, String> {

    Optional<PasswordReset> findByUserId(String userId);

    void deleteByUserId(String userId);
}
