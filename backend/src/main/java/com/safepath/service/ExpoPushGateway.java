package com.safepath.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** Sends through Expo's push service (https://docs.expo.dev/push-notifications/sending-notifications/). */
@Service
public class ExpoPushGateway implements PushGateway {

    private static final Logger log = LoggerFactory.getLogger(ExpoPushGateway.class);
    private static final int BATCH = 100; // Expo accepts at most 100 messages per request

    private final RestClient client;
    private final String url;
    private final String accessToken;

    public ExpoPushGateway(
            RestClient.Builder builder,
            @Value("${expo.push.url:https://exp.host/--/api/v2/push/send}") String url,
            @Value("${expo.push.access-token:}") String accessToken
    ) {
        this.client = builder.build();
        this.url = url;
        this.accessToken = accessToken;
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<String> send(List<Map<String, Object>> messages) {
        List<String> invalid = new ArrayList<>();
        for (int from = 0; from < messages.size(); from += BATCH) {
            List<Map<String, Object>> chunk =
                    messages.subList(from, Math.min(from + BATCH, messages.size()));
            try {
                RestClient.RequestBodySpec req = client.post()
                        .uri(url)
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.APPLICATION_JSON);
                if (accessToken != null && !accessToken.isBlank()) {
                    req = req.header("Authorization", "Bearer " + accessToken);
                }
                Map<String, Object> res = req.body(chunk).retrieve().body(Map.class);
                Object data = res == null ? null : res.get("data");
                if (data instanceof List<?> tickets) {
                    for (int i = 0; i < tickets.size() && i < chunk.size(); i++) {
                        if (tickets.get(i) instanceof Map<?, ?> t
                                && "error".equals(t.get("status"))
                                && t.get("details") instanceof Map<?, ?> d
                                && "DeviceNotRegistered".equals(d.get("error"))) {
                            invalid.add(String.valueOf(chunk.get(i).get("to")));
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Expo push request failed: {}", e.getMessage());
            }
        }
        return invalid;
    }
}
