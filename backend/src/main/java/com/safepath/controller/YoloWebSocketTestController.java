package com.safepath.controller;

import com.safepath.websocket.YoloWebSocketClient;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/yolo-test")
public class YoloWebSocketTestController {

    private final YoloWebSocketClient webSocketClient;

    public YoloWebSocketTestController(
            YoloWebSocketClient webSocketClient
    ) {
        this.webSocketClient = webSocketClient;
    }

    @PostMapping("/connect")
    public ResponseEntity<String> connect() {

        webSocketClient.connect();

        return ResponseEntity.ok(
                "WebSocket connection attempt started"
        );
    }
}