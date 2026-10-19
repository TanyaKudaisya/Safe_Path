package com.safepath.service;

import com.safepath.model.User;
import com.safepath.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.regex.Pattern;

/** Stores device push tokens and sends notifications to a user's devices. */
@Service
public class PushService {

    private static final Logger log = LoggerFactory.getLogger(PushService.class);
    private static final Pattern TOKEN =
            Pattern.compile("^(Expo|Exponent)PushToken\\[[^\\]\\s]+\\]$");
    static final int MAX_TOKENS_PER_USER = 5;

    private final UserRepository userRepository;
    private final PushGateway gateway;
    private final Executor executor;

    @Autowired
    public PushService(UserRepository userRepository, PushGateway gateway) {
        this(userRepository, gateway, Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "push-sender");
            t.setDaemon(true);
            return t;
        }));
    }

    public PushService(UserRepository userRepository, PushGateway gateway, Executor executor) {
        this.userRepository = userRepository;
        this.gateway = gateway;
        this.executor = executor;
    }

    public static boolean isValidToken(String token) {
        return token != null && TOKEN.matcher(token.trim()).matches();
    }

    /** Registers a device for this user (and takes it away from anyone else who had it). */
    public boolean register(String userId, String rawToken) {
        if (!isValidToken(rawToken)) {
            return false;
        }
        String token = rawToken.trim();

        // a phone that switches accounts must stop receiving the old account's alerts
        for (User other : userRepository.findByPushTokensContaining(token)) {
            if (!other.getId().equals(userId)) {
                other.getPushTokens().remove(token);
                userRepository.save(other);
            }
        }

        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return false;
        }
        List<String> tokens = user.getPushTokens() == null
                ? new ArrayList<>() : new ArrayList<>(user.getPushTokens());
        tokens.remove(token);
        tokens.add(token); // most recent last
        while (tokens.size() > MAX_TOKENS_PER_USER) {
            tokens.remove(0);
        }
        user.setPushTokens(tokens);
        userRepository.save(user);
        return true;
    }

    public void unregister(String userId, String rawToken) {
        if (rawToken == null) {
            return;
        }
        String token = rawToken.trim();
        userRepository.findById(userId).ifPresent(user -> {
            if (user.getPushTokens() != null && user.getPushTokens().remove(token)) {
                userRepository.save(user);
            }
        });
    }

    /** Fire-and-forget; never throws, never blocks the caller on the network. */
    public void notifyUser(String userId, String title, String body, Map<String, Object> data) {
        try {
            if (userId == null) {
                return;
            }
            User user = userRepository.findById(userId).orElse(null);
            if (user == null || user.getPushTokens() == null || user.getPushTokens().isEmpty()) {
                return;
            }
            List<Map<String, Object>> messages = new ArrayList<>();
            for (String token : user.getPushTokens()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("to", token);
                m.put("title", title);
                m.put("body", body);
                m.put("sound", "default");
                m.put("channelId", "default");
                m.put("data", data == null ? Map.of() : data);
                messages.add(m);
            }
            executor.execute(() -> deliver(userId, messages));
        } catch (Exception e) {
            log.warn("Could not queue push notification: {}", e.getMessage());
        }
    }

    private void deliver(String userId, List<Map<String, Object>> messages) {
        try {
            List<String> invalid = gateway.send(messages);
            if (invalid != null && !invalid.isEmpty()) {
                userRepository.findById(userId).ifPresent(user -> {
                    if (user.getPushTokens() != null && user.getPushTokens().removeAll(invalid)) {
                        userRepository.save(user);
                    }
                });
            }
        } catch (Exception e) {
            log.warn("Push delivery failed: {}", e.getMessage());
        }
    }
}
