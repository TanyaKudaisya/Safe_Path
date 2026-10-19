package com.safepath.repository;

import com.safepath.model.User;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends MongoRepository<User, String> {

    Optional<User> findByEmail(String email);

    List<User> findByRole(String role);

    /** Users that have this Expo push token registered. */
    List<User> findByPushTokensContaining(String token);
}
