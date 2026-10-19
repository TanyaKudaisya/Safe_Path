package com.safepath.websocket;

import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import java.io.InputStream;
import java.util.Base64;
import org.springframework.web.socket.TextMessage;


import java.net.URI;

@Component
public class YoloWebSocketClient {

    private final StandardWebSocketClient webSocketClient;

    public YoloWebSocketClient() {
        this.webSocketClient = new StandardWebSocketClient();
    }

    public void connect() {

        URI url = URI.create("ws://localhost:9001/ws");

        System.out.println("Trying to connect to YOLO WebSocket...");

        webSocketClient.execute(
                new TextWebSocketHandler() {

                    @Override
                    public void afterConnectionEstablished(
                            WebSocketSession session
                    ) {
                        System.out.println(
                                "Connected to YOLO WebSocket!"
                        );

                        try {

                            // 1. Send metadata
                            String metadata = """
                                {
                                    "threshold": 0.25
                                }
                                """;

                            session.sendMessage(
                                    new TextMessage(metadata)
                            );

                            System.out.println(
                                    "Metadata sent to YOLO!"
                            );

                            // 2. Read test image
                            InputStream inputStream =
                                    getClass()
                                            .getClassLoader()
                                            .getResourceAsStream(
                                                    "static/test-pothole.png"
                                            );

                            if (inputStream == null) {
                                throw new RuntimeException(
                                        "Test image not found"
                                );
                            }

                            byte[] imageBytes =
                                    inputStream.readAllBytes();

                            // 3. Convert image to Base64
                            String base64Image =
                                    Base64.getEncoder()
                                            .encodeToString(
                                                    imageBytes
                                            );

                            // 4. Send image
                            session.sendMessage(
                                    new TextMessage(base64Image)
                            );

                            System.out.println(
                                    "Image sent to YOLO!"
                            );

                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }

                    @Override
                    protected void handleTextMessage(
                            WebSocketSession session,
                            TextMessage message
                    ) {
                        System.out.println(
                                "YOLO Response: "
                                        + message.getPayload()
                        );

                        try {
                            session.close();
                            System.out.println(
                                    "WebSocket closed after receiving response."
                            );
                        } catch (Exception e) {
                            e.printStackTrace();
                        }
                    }

                    @Override
                    public void afterConnectionClosed(
                            WebSocketSession session,
                            org.springframework.web.socket.CloseStatus status
                    ) {
                        System.out.println(
                                "WebSocket closed: " + status
                        );
                    }
                },
                new WebSocketHttpHeaders(),
                url
        ).whenComplete((session, error) -> {

            if (error != null) {
                System.out.println(
                        "YOLO WebSocket connection failed:"
                );
                error.printStackTrace();
            }
        });
    }

}