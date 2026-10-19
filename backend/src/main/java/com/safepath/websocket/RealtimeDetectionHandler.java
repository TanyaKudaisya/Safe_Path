
package com.safepath.websocket;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.net.URI;
import java.util.Queue;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.ConcurrentMap;

@Component
public class RealtimeDetectionHandler extends TextWebSocketHandler {

    private final StandardWebSocketClient yoloClient =
            new StandardWebSocketClient();

    // Built from yolo.service-url (http://host:9001 -> ws://host:9001/ws)
    private final URI yoloWsUri;

    public RealtimeDetectionHandler(
            @Value("${yolo.service-url}") String yoloServiceUrl
    ) {
        this.yoloWsUri = URI.create(
                yoloServiceUrl.replaceFirst("^http", "ws") + "/ws"
        );
    }

    private final ConcurrentMap<String, Bridge> bridges =
            new ConcurrentHashMap<>();

    @Override
    public void afterConnectionEstablished(WebSocketSession client) {
        System.out.println("React Native connected: " + client.getId());

        Bridge bridge = new Bridge(client);
        bridges.put(client.getId(), bridge);

        yoloClient.execute(
                new TextWebSocketHandler() {

                    @Override
                    public void afterConnectionEstablished(
                            WebSocketSession yoloSession
                    ) {
                        System.out.println("Connected to FastAPI YOLO");
                        bridge.attachYoloSession(yoloSession);
                    }

                    @Override
                    protected void handleTextMessage(
                            WebSocketSession session,
                            TextMessage message
                    ) throws IOException {
                        if (client.isOpen()) {
                            synchronized (client) {
                                if (client.isOpen()) {
                                    client.sendMessage(
                                            new TextMessage(
                                                    message.getPayload()
                                            )
                                    );
                                }
                            }
                        }
                    }

                    @Override
                    public void afterConnectionClosed(
                            WebSocketSession session,
                            CloseStatus status
                    ) {
                        System.out.println(
                                "FastAPI WebSocket closed: " + status
                        );
                        // Let the app know instead of leaving it hanging
                        closeClient(client);
                    }
                },
                new WebSocketHttpHeaders(),
                yoloWsUri
        ).whenComplete((session, error) -> {
            if (error != null) {
                System.err.println("Could not connect to FastAPI:");
                error.printStackTrace();
                closeClient(client);
            }
        });
    }

    @Override
    protected void handleTextMessage(
            WebSocketSession client,
            TextMessage message
    ) throws IOException {
        Bridge bridge = bridges.get(client.getId());

        if (bridge != null) {
            bridge.forwardOrQueue(message.getPayload());
        }
    }

    @Override
    public void afterConnectionClosed(
            WebSocketSession client,
            CloseStatus status
    ) {
        Bridge bridge = bridges.remove(client.getId());

        if (bridge != null) {
            bridge.close();
        }

        System.out.println("React Native disconnected: " + status);
    }

    private void closeClient(WebSocketSession client) {
        try {
            if (client.isOpen()) {
                client.close();
            }
        } catch (IOException error) {
            error.printStackTrace();
        }
    }

    private static class Bridge {
        private final WebSocketSession client;
        private final Queue<String> pendingMessages =
                new ConcurrentLinkedQueue<>();

        private WebSocketSession yoloSession;

        Bridge(WebSocketSession client) {
            this.client = client;
        }

        synchronized void attachYoloSession(
                WebSocketSession session
        ) {
            this.yoloSession = session;

            String message;
            while ((message = pendingMessages.poll()) != null) {
                sendToYolo(message);
            }
        }

        synchronized void forwardOrQueue(String message) {
            if (yoloSession == null || !yoloSession.isOpen()) {
                pendingMessages.offer(message);
                return;
            }

            sendToYolo(message);
        }

        private void sendToYolo(String message) {
            try {
                yoloSession.sendMessage(new TextMessage(message));
            } catch (IOException error) {
                System.err.println("Could not forward message to YOLO:");
                error.printStackTrace();
                close();
            }
        }

        synchronized void close() {
            pendingMessages.clear();

            try {
                if (yoloSession != null && yoloSession.isOpen()) {
                    yoloSession.close();
                }
            } catch (IOException error) {
                error.printStackTrace();
            }
        }
    }
}
